import asyncio
import json
import time
import random
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles 
from fastapi.responses import JSONResponse, RedirectResponse

from config import (
    CLAUDE_API_KEY, WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
    HOST, PORT,
    GAME_MODE, CONTENT_REANALYZE_INTERVAL, CONTENT_MIN_LENGTH
)
if GAME_MODE: 
    from content_analyzer import ContentAnalyzer
else: 
    from screen_capture import ScreenCapture
    from vision_analyzer import VisionAnalyzer
from biometric_engine import BiometricEngine 
from mock_biometrics import MockBiometrics 
from ghost_brain import GhostBrain 
from context_history import ContextTracker
from fallback_responses import get_fallback_intervention

if GAME_MODE:
    content_analyzer = ContentAnalyzer(CLAUDE_API_KEY)
else: 
    capture = ScreenCapture()
    vision = VisionAnalyzer(CLAUDE_API_KEY)
bio = BiometricEngine(WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET)
mock = MockBiometrics()
brain = GhostBrain(CLAUDE_API_KEY)
tracker = ContextTracker()

connected_clients: list[WebSocket] = []

intervention_history: list[dict] = []

ghost_running = False 
pending_content = {}
content_lock = threading.Lock()
last_analyzed_hashes = {}
intervention_cooldown_until = 0
last_intervention_hash = None
suppressed_hashes = {}
mock_override_until = 0
sleep_mode_active = False
sleep_low_hr_count = 0
ble_disconnected = False
ble_disconnect_timer = None
last_coding_activity = 0
main_event_loop: asyncio.AbstractEventLoop = None

async def broadcast(message: dict):
    dead_clients = []
    for client in connected_clients:
        try: 
            await client.send_json(message)
        except Exception: 
            dead_clients.append(client)
    for client in dead_clients:
        connected_clients.remove(client)

def broadcast_sync (message: dict):
    if main_event_loop is None: 
        return
    asyncio.run_coroutine_threadsafe(broadcast(message), main_event_loop)

def build_biometric_msg(data, state):
    source = "whoop" if (bio.access_token and time.time() >= mock_override_until) else "mock"
    ble_active = bio.live_heart_rate > 0 and (time.time() - bio.live_hr_timestamp < 5)
    return {
        "type": "biometric_update",
        "source": "ble" if ble_active else source,
        "heartRate": round(data.get("heartRate", 0)),
        "recovery": round(data.get("recovery", 0)),
        "strain": round(data.get("strain", 0), 1),
        "state": state,
        "sleepPerformance": round(data.get("sleepPerformance", 0), 2),
        "hrv": round(data.get("hrv", 0), 1),
        "estimated_stress": round(data.get("estimated_stress", 0), 2),
        "spo2": round(data.get("spo2", 0), 1),
        "skinTemp": round(data.get("skinTemp", 0), 1)
    }

def on_state_change(old_state, new_state):
    data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else bio.current_data or {}
    reason = "Biometric data changed"
    if data.get("strain", 0) > 16:
        reason = "Strain over 16"
    elif data.get("recovery", 100) <40:
        reason = "Recovery dropped below 40"
    elif data.get("sleepPerformance", 1) < 0.7: 
        reason = "Poor sleep performance"

    message = {
        "type": "state_change", 
        "from": old_state, 
        "to": new_state,
        "reason": reason,
        "estimated_stress": bio.estimated_stress
    }
    broadcast_sync(message)
    if not GAME_MODE: 
        modifiers = bio.get_personality_modifiers(new_state)
        capture.set_interval(modifiers.get("capture_interval", 3))

bio.on_state_change(on_state_change)

_sim_hr = 67.0
_SIM_HR_RANGES = {
    "RELAXED":    (62, 72),
    "DEEP_FOCUS": (65, 78),
    "STRESSED":   (85, 100),
    "FATIGUED":   (55, 65),
    "WIRED":      (80, 95),
}

def _simulate_hr(state):
    global _sim_hr
    lo, hi = _SIM_HR_RANGES.get(state, (62, 72))
    mid = (lo + hi) / 2
    _sim_hr += (mid - _sim_hr) * 0.15 + random.uniform(-3, 3)
    _sim_hr = max(lo, min(hi, _sim_hr))
    return round(_sim_hr)

def _on_ble_disconnect_timeout():
    global sleep_mode_active
    if ble_disconnected and not sleep_mode_active:
        sleep_mode_active = True
        broadcast_sync({"type": "sleep_mode", "active": True})
        print("[bio] Sleep mode ON — BLE disconnected for 10s")

def _check_sleep_mode(data):
    global sleep_mode_active, sleep_low_hr_count

    if ble_disconnected:
        return

    ble_fresh = bio.live_heart_rate >= 0 and (time.time() - bio.live_hr_timestamp < 10)
    if not ble_fresh:
        if sleep_mode_active:
            sleep_mode_active = False
            sleep_low_hr_count = 0
            broadcast_sync({"type": "sleep_mode", "active": False})
            print("[bio] Sleep mode OFF — no BLE data")
        return

    hr = bio.live_heart_rate
    if hr < 50:
        sleep_low_hr_count += 1
        if sleep_low_hr_count >= 5 and not sleep_mode_active:
            sleep_mode_active = True
            broadcast_sync({"type": "sleep_mode", "active": True})
            print(f"[bio] Sleep mode ON — low HR={hr} for {sleep_low_hr_count} cycles")
    else:
        if sleep_mode_active:
            sleep_mode_active = False
            broadcast_sync({"type": "sleep_mode", "active": False})
            print(f"[bio] Sleep mode OFF — HR={hr}")
        sleep_low_hr_count = 0


def biometric_loop():
    global last_coding_activity
    while ghost_running:
        is_whoop = False
        if time.time() < mock_override_until:
            data = mock.get_data()
        elif bio.access_token:
            data = bio.fetch_data()
            if data is None:
                data = mock.get_data()
            else:
                is_whoop = True
        else:
            data = mock.get_data()

        if data:
            ble_fresh = bio.live_heart_rate and (time.time() - bio.live_hr_timestamp < 5)
            if ble_fresh:
                data["heartRate"] = bio.live_heart_rate
            elif is_whoop:
                pre_state = bio.classify(data)
                data["heartRate"] = _simulate_hr(pre_state)

            state = bio.classify(data)

            if is_whoop:
                src = "ble" if ble_fresh else "whoop"
                print(f"[bio] WHOOP state classified: {state} (rec={data.get('recovery')}, strain={data.get('strain')}, hrv={data.get('hrv')}, hr={data.get('heartRate')}, src={src})")

            biometric_msg = build_biometric_msg(data, state)
            broadcast_sync(biometric_msg)

        _check_sleep_mode(data)

        if last_coding_activity > 0 and time.time() - last_coding_activity > 60:
            last_coding_activity = time.time()
            broadcast_sync({"type": "plant_update", "delta": -2})

        time.sleep(5)


def ghost_loop():
    global intervention_cooldown_until, last_intervention_hash
    time.sleep(2)

    while ghost_running:
        try:
            state = bio.current_state
            modifiers = bio.get_personality_modifiers(state)

            if GAME_MODE:
                analysis = None
                app_type = None
                content_data = None
                content_hash = None

                with content_lock:
                    latest_time = 0
                    for atype, data in pending_content.items():
                        if data["timestamp"] > latest_time:
                            latest_time = data["timestamp"]
                            app_type = atype
                            content_data = data

                if content_data and len(content_data.get("content", "")) >= CONTENT_MIN_LENGTH:
                    content_hash = hash(content_data["content"][:500])

                    already_analyzed = content_hash == last_analyzed_hashes.get(app_type)
                    in_cooldown = time.time() < intervention_cooldown_until
                    user_suppressed = suppressed_hashes.get(content_hash, 0) > time.time()

                    if already_analyzed or in_cooldown or user_suppressed:
                        with content_lock:
                            if app_type in pending_content:
                                del pending_content[app_type]
                    else:
                        context_summary = tracker.get_summary()
                        try:
                            analysis = content_analyzer.analyze(
                                app_type=app_type,
                                content=content_data["content"],
                                extra_context=context_summary or "",
                                **content_data.get("kwargs", {})
                            )
                            last_analyzed_hashes[app_type] = content_hash
                            with content_lock:
                                if app_type in pending_content:
                                    del pending_content[app_type]
                        except Exception as e:
                            print(f"[ghost_loop] Content analysis failed: {e}")

                if analysis:
                    tracker.update(analysis, state, bio.estimated_stress)
                    intervention = brain.process(analysis, state, modifiers)

                    if intervention:
                        intervention_cooldown_until = time.time() + 8
                        last_intervention_hash = content_hash
                        last_analyzed_hashes.clear()
                        bio_data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else (bio.current_data or {})
                        intervention["biometric"] = build_biometric_msg(bio_data, state)
                        intervention["app_type"] = app_type
                        broadcast_sync(intervention)
                        intervention_history.append(intervention)
                        if len(intervention_history) > 50:
                            intervention_history.pop(0)
                        print(f"[ghost] ({state}/{app_type}) {intervention['message'][:80]}...")

                        plant_delta = -25 if intervention.get("priority") == "critical" else -15
                        broadcast_sync({"type": "plant_update", "delta": plant_delta})
                    else:
                        broadcast_sync({"type": "plant_update", "delta": 10})

            else:
                screenshots = capture.get_buffer()

                if not screenshots:
                    time.sleep(1)
                    continue

                context_summary = tracker.get_summary()

                try:
                    analysis = vision.analyze(screenshots, context_summary)
                except Exception as e:
                    print(f"[ghost_loop] Vision analysis failed: {e}")
                    time.sleep(modifiers.get("capture_interval", 3))
                    continue

                tracker.update(analysis, state, bio.estimated_stress)

                intervention = brain.process(analysis, state, modifiers)

                if intervention:
                    bio_data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else (bio.current_data or {})
                    intervention["biometric"] = build_biometric_msg(bio_data, state)
                    broadcast_sync(intervention)
                    intervention_history.append(intervention)
                    if len(intervention_history) > 50:
                        intervention_history.pop(0)
                    print(f"[ghost] ({state}) {intervention['message'][:80]}...")

        except Exception as e:
            print(f"[ghost_loop] Error: {e}")
            import traceback
            traceback.print_exc()
        time.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI): 
    global ghost_running, main_event_loop
    ghost_running = True

    main_event_loop = asyncio.get_event_loop()
    if not GAME_MODE:
        capture.start()
        print("[ghost] Screen capture started")
    else:
        print("[ghost] Game mode. waiting for content from PixiJS frontend")
    
    bio_thread = threading.Thread(target = biometric_loop, daemon = True)
    bio_thread.start()
    ghost_thread = threading.Thread(target = ghost_loop, daemon = True)
    ghost_thread.start()
    print(f"[ghost] Ghost loop started")
    print(f"[ghost] Server running on http://{HOST}:{PORT}")
    yield
    
    ghost_running = False
    if not GAME_MODE: 
        capture.stop()
    main_event_loop = None
    print("[ghost] Shutting down")
    

app = FastAPI(title = "Ghost Desktop Agent", lifespan = lifespan)

app.mount("/public", StaticFiles(directory="public"), name="public")

@app.get ("/health")
async def health():
    return {"status": "alive", "ghost": "watching"}

@app.get("/api/status")
async def status():
    bio_data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else (bio.current_data or {})

    return {
        "biometric_state": bio.current_state, 
        "biometric_data": bio_data, 
        "last_analysis": content_analyzer.last_analysis if GAME_MODE else vision.last_analysis,
        "interventions_total": brain.intervention_count, 
        "interventions_accepted": brain.accepted_count,
        "interventions_ignored": brain.ignored_count,
        "session_stats": tracker.get_session_stats(),
        "mock_mode": not bio.access_token or time.time() < mock_override_until,
        "whoop_connected": bio.access_token is not None,
        "estimated_stress": bio.estimated_stress,
        "hrv_baseline": bio.hrv_baseline,
        "hrv_current": bio_data.get("hrv", 0),
        "game_mode": GAME_MODE,
        "current_app": content_analyzer.last_analysis.get("app") if GAME_MODE and content_analyzer.last_analysis else None,
    }

@app.post("/api/biometric/mock")
async def set_mock_state (body:dict):
    state_num = body.get ("state")
    if state_num not in [1, 2, 3, 4, 5]:
        return JSONResponse(
            status_code = 400,
            content = {"error": "state must be 1-5"}
        )

    mock.set_state(state_num)

    await asyncio.sleep(0.3)
    data = mock.get_data()
    new_state = bio.classify(data)

    return {
        "ok": True, 
        "preset": state_num,
        "state": new_state,
        "data": data
    }

@app.post("/api/feedback")
async def user_feedback(body: dict):
    action = body.get("action", "")
    brain.user_feedback(action)
    return {"ok": True, "accepted": brain.accepted_count, "ignored": brain.ignored_count}

@app.get("/api/history")
async def get_history(): 
    return {"interventions": intervention_history[-20:]}


@app.get("/api/game/apps")
async def get_game_apps():
    return {
        "game_mode": GAME_MODE,
        "apps": {
            "code": {"room_object": "desk_computer", "label": "Code Editor"},
            "terminal": {"room_object": "desk_terminal", "label": "Terminal"},
            "browser": {"room_object": "second_monitor", "label": "Browser"},
            "notes": {"room_object": "whiteboard", "label": "Notes"},
            "chat": {"room_object": "phone", "label": "Chat"}
        }
    }

@app.get("/api/whoop/auth")
async def whoop_auth():
    redirect_uri = "http://localhost:8000/api/whoop/callback"
    auth_url = bio.get_auth_url(redirect_uri)
    return RedirectResponse(url=auth_url)

@app.get("/api/whoop/callback")
async def whoop_callback(code: str = None, error: str = None):
    if error or not code:
        return JSONResponse({"error": error or "No code received"}, status_code=400)
    redirect_uri = "http://localhost:8000/api/whoop/callback"
    success = bio.exchange_token(code, redirect_uri)
    if success:
        return RedirectResponse(url="http://localhost:5173")
    return JSONResponse({"error": "Token exchange failed"}, status_code=500)

@app.get("/api/whoop/status")
async def whoop_status():
    connected = bio.access_token is not None
    return JSONResponse({
        "connected": connected,
        "source": "whoop" if connected else "mock",
    })

@app.get("/api/test/sleep")
async def test_sleep():
    global ble_disconnected, sleep_mode_active
    ble_disconnected = True
    sleep_mode_active = True
    for ws in connected_clients:
        await ws.send_json({"type": "sleep_mode", "active": True})
    return {"status": "sleep mode activated"}

@app.get("/api/test/wake")
async def test_wake():
    global ble_disconnected, sleep_mode_active
    ble_disconnected = False
    sleep_mode_active = False
    for ws in connected_clients:
        await ws.send_json({"type": "sleep_mode", "active": False})
    return {"status": "sleep mode deactivated"}

@app.get("/api/test/plant/grow")
async def test_plant_grow():
    for ws in connected_clients:
        await ws.send_json({"type": "plant_update", "delta": 25})
    return {"status": "plant growing"}

@app.get("/api/test/plant/die")
async def test_plant_die():
    for ws in connected_clients:
        await ws.send_json({"type": "plant_update", "delta": -25})
    return {"status": "plant dying"}

@app.get("/api/test/plant/bloom")
async def test_plant_bloom():
    for ws in connected_clients:
        await ws.send_json({"type": "plant_update", "health": 100})
    return {"status": "plant blooming"}

@app.get("/api/test/plant/kill")
async def test_plant_kill():
    for ws in connected_clients:
        await ws.send_json({"type": "plant_update", "health": 0})
    return {"status": "plant dead"}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    global suppressed_hashes, intervention_cooldown_until, mock_override_until, ble_disconnected, ble_disconnect_timer, sleep_mode_active, sleep_low_hr_count, last_coding_activity
    await ws.accept()
    connected_clients.append(ws)
    print(f"[ws] Client connected ({len(connected_clients)} total)")

    bio_data = mock.get_data() if (not bio.access_token or time.time() < mock_override_until) else (bio.current_data or {})
    await ws.send_json(build_biometric_msg(bio_data, bio.current_state))

    try:
        while True:
            data = await ws.receive_json()

            if data.get("type") == "feedback":
                action = data.get("action", "")
                brain.user_feedback(action)
                if action == "Apply Fix":
                    intervention_cooldown_until = 0
                    last_analyzed_hashes.clear()
                    suppressed_hashes.clear()
                    await broadcast({"type": "plant_update", "delta": 20})
                else:
                    if last_intervention_hash is not None:
                        suppressed_hashes[last_intervention_hash] = time.time() + 10
                        now = time.time()
                        suppressed_hashes = {h: t for h, t in suppressed_hashes.items() if t > now}

            elif data.get("type") == "content_update":
                last_coding_activity = time.time()
                app_type = data.get("app_type", "code")
                content = data.get("content", "")
                kwargs = {}
                if data.get("language"):
                    kwargs["language"] = data["language"]
                if data.get("cursor_line"): 
                    kwargs["cursor_line"] = data["cursor_line"]
                if data.get("url"): 
                    kwargs["url"] = data["url"]
                if data.get("shell"):
                    kwargs["shell"] = data["shell"]
                if data.get("platform"):
                    kwargs["platform"] = data["platform"]
                with content_lock:
                    pending_content[app_type] = {
                        "content": content,
                        "timestamp": time.time(),
                        "changed": True,
                        "kwargs": kwargs
                    }
            
            elif data.get("type") == "mock_state":
                state_num = data.get("state")
                if state_num in [1, 2, 3, 4, 5]:
                    mock.set_state(state_num)
                    mock_override_until = time.time() + 30
                    data_now = mock.get_data()
                    new_state = bio.classify(data_now)
                    await ws.send_json(build_biometric_msg(data_now, new_state))
                    intervention_cooldown_until = 0
                    last_analyzed_hashes.clear()
                    suppressed_hashes.clear()
                    brain.last_intervention_time = 0
            
            elif data.get("type") == "live_hr":
                live_hr = data.get("heart_rate", 0)
                if 30 < live_hr < 220:
                    bio.live_heart_rate = live_hr
                    bio.live_hr_timestamp = time.time()

            elif data.get("type") == "ble_disconnected":
                ble_disconnected = True
                if ble_disconnect_timer:
                    ble_disconnect_timer.cancel()
                ble_disconnect_timer = threading.Timer(10.0, _on_ble_disconnect_timeout)
                ble_disconnect_timer.daemon = True
                ble_disconnect_timer.start()
                print("[ws] BLE disconnected — 10s sleep timer started")

            elif data.get("type") == "ble_reconnected":
                ble_disconnected = False
                if ble_disconnect_timer:
                    ble_disconnect_timer.cancel()
                    ble_disconnect_timer = None
                if sleep_mode_active:
                    sleep_mode_active = False
                    sleep_low_hr_count = 0
                    broadcast_sync({"type": "sleep_mode", "active": False})
                    print("[bio] Sleep mode OFF — BLE reconnected")

            elif data.get("type") == "app_focus":
                app_type = data.get("app_type")
                if app_type:
                    broadcast_sync({
                        "type": "app_focus_change",
                        "app_type": app_type,
                        "timestamp": time.time()
                    })

    except WebSocketDisconnect:
        connected_clients.remove(ws)
        print (f"[ws]Client offline({len(connected_clients)} total)")

if __name__ == "__main__": 
    import uvicorn
    uvicorn.run(app, host = HOST, port = PORT)
