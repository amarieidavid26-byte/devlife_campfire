import * as PIXI from 'pixi.js';
import { Howl }         from 'howler';
import { GhostSocket }  from './network/WebSocket.js';
import { Room }         from './room/Room.js';
import { Furniture }    from './room/Furniture.js';
import { Atmosphere }   from './room/Atmosphere.js';
import { Player }       from './character/Player.js';
import { Ghost }        from './character/Ghost.js';
import { HUD }          from './hud/HUD.js';
import { DashboardOverlay } from './hud/DashboardOverlay.js';
import { DemoHotbar }   from './hud/DemoHotbar.js';
import { WHOOPBluetooth } from './network/WHOOPBluetooth.js';
import { CodeEditorApp } from './apps/CodeEditor.js';
import { TerminalApp }  from './apps/Terminal.js';
import { BrowserApp }   from './apps/Browser.js';
import { NotesApp }     from './apps/Notes.js';
import { ChatApp }      from './apps/Chat.js';
import { Plant }        from './room/Plant.js';

const pixiApp = new PIXI.Application({
    width:           window.innerWidth,
    height:          window.innerHeight,
    backgroundColor: 0x1a1a2e,
    antialias:       true,
    resolution:      window.devicePixelRatio || 1,
    autoDensity:     true,
});
document.body.appendChild(pixiApp.view);
pixiApp.view.style.position = 'fixed';
pixiApp.view.style.top      = '0';
pixiApp.view.style.left     = '0';

const GAME_ZOOM     = 1.5;
let   gameContainer = null;

window.addEventListener('resize', () => {
    pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
    if (gameContainer && player) {
        gameContainer.x = window.innerWidth  / 2 - player.container.x * GAME_ZOOM;
        gameContainer.y = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
    }
});

const socket = new GhostSocket('ws://localhost:8000/ws');

const room       = new Room(pixiApp.stage);
const furniture  = new Furniture(pixiApp.stage, room);
const player     = new Player(pixiApp.stage, room, furniture);
const ghost      = new Ghost(pixiApp.stage);
const atmosphere = new Atmosphere(pixiApp.stage);

const worldContainer = new PIXI.Container();
worldContainer.sortableChildren = true;

pixiApp.stage.removeChild(furniture.container);
pixiApp.stage.removeChild(player.container);
pixiApp.stage.removeChild(ghost.container);
pixiApp.stage.removeChild(atmosphere.container);

pixiApp.stage.addChild(worldContainer);
pixiApp.stage.addChild(atmosphere.container);

furniture.attachToWorld(worldContainer);
worldContainer.addChild(player.container);
worldContainer.addChild(ghost.container);

const plant = new Plant();
const plantItem = furniture._items.find(i => i.name === 'plant');
if (plantItem) {
    plant.container.x = plantItem.container.x;
    plant.container.y = plantItem.container.y;
}
worldContainer.addChild(plant.container);

gameContainer = new PIXI.Container();
pixiApp.stage.removeChild(room.container);
pixiApp.stage.removeChild(worldContainer);
pixiApp.stage.addChildAt(gameContainer, 0);
gameContainer.addChild(room.container);
gameContainer.addChild(worldContainer);
gameContainer.scale.set(GAME_ZOOM);
gameContainer.x = Math.round(window.innerWidth  / 2 * (1 - GAME_ZOOM));
gameContainer.y = Math.round(window.innerHeight / 2 * (1 - GAME_ZOOM));

const ePrompt = new PIXI.Text('[E]', {
    fontFamily:         'monospace',
    fontSize:           13,
    fill:               0xe94560,
    fontWeight:         'bold',
    dropShadow:         true,
    dropShadowColor:    '#000000',
    dropShadowBlur:     4,
    dropShadowAlpha:    0.6,
    dropShadowDistance: 0,
});
ePrompt.anchor.set(0.5, 1);
ePrompt.visible = false;
ePrompt.zIndex  = 10000;
worldContainer.addChild(ePrompt);

ghost.setAtmosphere(atmosphere);

const hud               = new HUD();
const dashboardOverlay  = new DashboardOverlay();
const demoHotbar        = new DemoHotbar();
demoHotbar.setClickHandler((key) => socket.sendMockState(key));

const whoopBLE = new WHOOPBluetooth();

let bleWasConnected = false;

whoopBLE.onUpdate((bpm, connected) => {
    if (connected && bpm > 0) {
        socket.send({ type: 'live_hr', heart_rate: bpm });
        if (!bleWasConnected) {
            socket.send({ type: 'ble_reconnected' });
            bleWasConnected = true;
        }
    }
    if (!connected && bleWasConnected) {
        socket.send({ type: 'ble_disconnected' });
        bleWasConnected = false;
    }
    demoHotbar.setBLEConnected(connected);
});

window.connectWHOOP = async () => {
    const success = await whoopBLE.connect();
    if (success) console.log('[main] WHOOP BLE connected — live HR active');
};

const apps = {
    desk_computer:  new CodeEditorApp(socket),
    desk_terminal:  new TerminalApp(socket),
    second_monitor: new BrowserApp(socket),
    whiteboard:     new NotesApp(socket),
    phone:          new ChatApp(socket),
};

apps.phone.onNewMessage = () => furniture.setPhoneNotification(true);
apps.whiteboard.onTaskAdded = (tasks) => {
    tasks.forEach(t => apps.phone.receiveMessage('Team', `📋 New task: "${t}"`));
};

let activeApp   = null;
let coffeeCount = 0;
let currentHR   = 72;

function openApp(name) {
    closeAllApps();
    dashboardOverlay.hide();
    if (name === 'phone') furniture.setPhoneNotification(false);
    const app = apps[name];
    if (!app) return;
    app.open();
    socket.sendAppFocus(app.appType);
    activeApp = app;
    pixiApp.view.style.pointerEvents = 'none';
    player.sit();
}

function closeAllApps() {
    Object.values(apps).forEach(a => a.close());
    socket.sendAppFocus(null);
    activeApp = null;
    pixiApp.view.style.pointerEvents = 'auto';
    player.stand();
}

let ambientSound = new Howl({
    src:         ['/ambient.mp3', '/ambient.ogg'],
    loop:        true,
    volume:      0.35,
    html5:       true,
    onloaderror: () => {
        ambientSound = null;
        console.log('[main] No ambient audio file found — speaker will be silent');
    },
});
let musicPlaying = false;

function toggleMusic() {
    if (!ambientSound) return;
    if (musicPlaying) {
        ambientSound.pause();
        musicPlaying = false;
    } else {
        ambientSound.play();
        musicPlaying = true;
    }
}

furniture.on('interact', (name) => {
    if (name === 'coffee_machine') {
        const state = ghost._state || 'RELAXED';

        if (state === 'WIRED' && currentHR > 95) {
            ghost.showSpeechBubble({
                message:   `Firewall activated. Your heart rate is at ${Math.round(currentHR)} bpm — I'm not letting you have that coffee right now. 🛡️`,
                priority:  'critical',
                state,
                buttons:   ['Fine...'],
                biometric: {},
            });
            return;
        }

        coffeeCount++;

        const STATE_MESSAGES = {
            DEEP_FOCUS: "You're locked in right now. Coffee might break your flow — but it's your call. ☕",
            STRESSED:   "Your stress is already elevated. Caffeine will spike it further. Water might serve you better. 💧",
            FATIGUED:   "Smart call. You're running low — this should help. Don't skip lunch either. ☕",
            RELAXED:    "A relaxed coffee break. Living the dream. ☕",
            WIRED:      "You're already wired — adding caffeine right now is risky. Maybe water? 💧",
        };
        const STATE_PRIORITY = {
            DEEP_FOCUS: 'low', STRESSED: 'high', FATIGUED: 'low', RELAXED: 'low', WIRED: 'medium',
        };
        const STATE_BUTTONS = {
            DEEP_FOCUS: ['Stay focused', 'I need it'],
            STRESSED:   ['Try anyway'],
            FATIGUED:   ['Thanks Ghost ☕'],
            RELAXED:    ['Cheers ☕'],
            WIRED:      ['I live dangerously', 'Fine, water'],
        };

        let message  = STATE_MESSAGES[state]  || STATE_MESSAGES.RELAXED;
        let priority = STATE_PRIORITY[state]  || 'low';
        const buttons = STATE_BUTTONS[state]  || ['Thanks!'];

        if (coffeeCount === 2) {
            message  = `Second one already? Keep an eye on that HRV.\n${message}`;
            if (priority === 'low') priority = 'medium';
        } else if (coffeeCount === 3) {
            message  = `That's your 3rd coffee. I'm logging this. 👀\n${message}`;
            priority = 'high';
        } else if (coffeeCount >= 4) {
            message  = `That's your ${coffeeCount}th coffee today. Your HRV is going to tank at this rate. 😬\n${message}`;
            priority = 'critical';
            dashboardOverlay.addIntervention({
                message:  `⚠️ Caffeine overload — ${coffeeCount} coffees today. Biometric risk flagged.`,
                priority: 'high',
                state,
            });
        }

        ghost.showSpeechBubble({ message, priority, state, buttons, biometric: {},
            trailingButton: coffeeCount > 0 ? `Reset counter (${coffeeCount} ☕)` : undefined,
        });
        return;
    }
    if (name === 'speaker') {
        toggleMusic();
        ghost.showSpeechBubble({
            message:   musicPlaying ? "Music on. Let the flow state begin. 🎵" : "Music off.",
            priority:  'low',
            state:     ghost._state,
            buttons:   ['Nice'],
            biometric: {},
        });
        return;
    }
    openApp(name);
});

ghost.setFeedbackHandler((label) => {
    if (label.startsWith('Reset counter')) {
        coffeeCount = 0;
        return;
    }
    socket.sendFeedback(label);
    if (label === 'Apply Fix' || label === 'I Understand') {
        furniture.onInterventionAccepted();
    }
});

ghost.setApplyFixHandler((code) => {
    const editor = apps.desk_computer;
    if (editor && editor.isOpen && code) {
        editor.replaceContent(code);
    }
});

socket.on('connected',    ()     => { hud.setConnected(true);  dashboardOverlay.setConnected(true);  });
socket.on('disconnected', ()     => { hud.setConnected(false); dashboardOverlay.setConnected(false); });

socket.on('intervention', (data) => { ghost.showSpeechBubble(data); dashboardOverlay.addIntervention(data); });

socket.on('biometric_update', (data) => {
    if (data.heartRate) currentHR = data.heartRate;
    hud.update(data);
    dashboardOverlay.update(data);
    demoHotbar.setActive(data.state);
    if (data.source) demoHotbar.setSource(data.source);
    atmosphere.setState(data.state);
    ghost.setStateTint(data.state);
    furniture.setMonitorState(data.state);
    plant.setStateColor(data.state);
});

const MENTOR_STATE_MESSAGES = {
    DEEP_FOCUS: "You're in the zone. Don't let anyone break your flow. 🎯",
    STRESSED:   "Take a breath. You've shipped harder things than this. 💪",
    FATIGUED:   "You've been at this a while. Even 5 minutes away pays back double. 😴",
    RELAXED:    "Good energy right now. This is when the best ideas happen. ✨",
    WIRED:      "You're firing on all cylinders. Channel it — don't scatter it. ⚡",
};

socket.on('plant_update', (data) => {
    if (data.health !== undefined) plant.setHealth(data.health);
    else if (data.delta !== undefined) plant.adjustHealth(data.delta);
});

socket.on('sleep_mode', (data) => {
    const active = data.active;
    player.setSleepMode(active);
    ghost.setSleepMode(active);
    atmosphere.setSleepMode(active);
    hud.setSleepMode(active);
    if (ambientSound && musicPlaying) {
        ambientSound.fade(ambientSound.volume(), active ? 0.15 : 0.35, 2000);
    }
});

socket.on('state_change', (data) => {
    dashboardOverlay.setState(data.to);
    demoHotbar.setActive(data.to);
    atmosphere.transition(data.from, data.to);
    ghost.setStateTint(data.to);
    furniture.setMonitorState(data.to);
    if (MENTOR_STATE_MESSAGES[data.to]) {
        setTimeout(() => apps.phone.receiveMessage('Manager', MENTOR_STATE_MESSAGES[data.to]), 1500);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '5') {
        if (!demoHotbar.manualEnabled) return;
        e.preventDefault();
        socket.sendMockState(parseInt(e.key));
        return;
    }

    if (e.key === 'Escape') {
        if (ghost._bubble) { ghost.dismissBubble(true); return; }
        dashboardOverlay.hide();
        closeAllApps();
        return;
    }

    if (e.key === 'Tab') {
        e.preventDefault();
        if (!activeApp) dashboardOverlay.toggle();
        return;
    }

    if (activeApp) return;

    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    if (e.key.toLowerCase() === 'e') {
        const name = furniture.getNearbyInteractable(player.gridX, player.gridY);
        if (name) furniture.emit('interact', name);
    }
});

pixiApp.ticker.add((delta) => {
    player.update(delta);
    ghost.update(delta, player.position);
    atmosphere.update(delta);
    furniture.update(delta);
    plant.update(delta);

    const camTargetX = window.innerWidth  / 2 - player.container.x * GAME_ZOOM;
    const camTargetY = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
    const camLerp    = 0.07 * delta;
    gameContainer.x += (camTargetX - gameContainer.x) * camLerp;
    gameContainer.y += (camTargetY - gameContainer.y) * camLerp;

    atmosphere.applyScreenShake(gameContainer);

    furniture._items.forEach(item => { item.container.zIndex = item.container.y; });
    player.container.zIndex = player.container.y;
    ghost.container.zIndex  = player.container.y + 50;

    const nearbyName = furniture.getNearbyInteractable(player.gridX, player.gridY);
    const nearbyItem = nearbyName
        ? furniture._items.find(i => i.name === nearbyName)
        : null;
    if (nearbyItem && !activeApp) {
        ePrompt.visible = true;
        ePrompt.x = nearbyItem.container.x;
        ePrompt.y = nearbyItem.container.y - 55 + Math.sin(Date.now() / 280) * 4;
    } else {
        ePrompt.visible = false;
    }

    furniture.updateHighlights(player.gridX, player.gridY);
});

const splash = document.createElement('div');
splash.style.cssText = [
    'position:fixed;top:0;left:0;width:100vw;height:100vh',
    'background:#1a1a2e;z-index:9999;color:#e0e0e0',
    'display:flex;align-items:center;justify-content:center;flex-direction:column',
    "font-family:'Segoe UI',monospace,sans-serif",
    'transition:opacity 0.8s ease',
].join(';');

const splashStyle = document.createElement('style');
splashStyle.textContent = `
    @keyframes ghostFloat { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-8px) scale(1.08)} }
    @keyframes ecgDraw { from{stroke-dashoffset:520} to{stroke-dashoffset:0} }
    @keyframes subFade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
`;
document.head.appendChild(splashStyle);

splash.innerHTML = `
    <div style="font-size:54px;animation:ghostFloat 1.8s ease-in-out infinite;margin-bottom:12px;filter:drop-shadow(0 0 18px rgba(128,0,255,0.6))">👻</div>
    <div style="font-weight:800;font-size:26px;letter-spacing:0.18em;color:#ffffff">DEVLIFE</div>
    <svg width="300" height="64" style="margin:18px 0;overflow:visible" viewBox="0 0 300 64">
        <path d="M0,32 L70,32 L80,30 L90,32 L100,8 L106,56 L112,32 L122,22 L132,32 L190,32 L300,32"
              fill="none" stroke="#00c864" stroke-width="2.5"
              stroke-dasharray="520" stroke-dashoffset="520"
              style="animation:ecgDraw 1.1s cubic-bezier(.4,0,.2,1) 0.25s forwards;
                     filter:drop-shadow(0 0 5px #00c864)"/>
    </svg>
    <div id="splash-sub" style="color:#888;font-size:13px;letter-spacing:0.05em;
         animation:subFade 0.6s ease 0.7s both">
        Reading what's beneath the surface…
    </div>
    <div style="margin-top:22px;color:#2e2e48;font-size:11px;letter-spacing:0.08em">
        WASD · E interact · 1-5 states · ESC
    </div>
`;
document.body.appendChild(splash);

setTimeout(() => {
    const sub = document.getElementById('splash-sub');
    if (sub) { sub.style.color = '#00c864'; sub.textContent = '● Connected'; }
}, 1500);
setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => { splash.remove(); splashStyle.remove(); }, 820);
}, 2200);

console.log('[DevLife] Running. WASD=move, E/click=interact, 1-5=state, ESC=close');
