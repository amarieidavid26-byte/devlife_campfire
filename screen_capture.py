
import mss
from PIL import Image 
import imagehash 
import base64
import io
import threading
import time
from config import CAPTURE_WIDTH, JPEG_QUALITY, HASH_THRESHOLD

class ScreenCapture:
    def __init__(self):
        self.sct = mss.mss()
        self.buffer = []
        self.buffer_size = 5
        self.last_hash = None
        self.interval = 3
        self.running = False
        self.latest_b64 = None

    def capture (self):
        monitor = self.sct.monitors[1]
        screenshot = self.sct.grab(monitor)

        img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")

        ratio = CAPTURE_WIDTH / img.width 
        new_size = (CAPTURE_WIDTH, int (img.height * ratio))
        img = img.resize(new_size, Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format = "JPEG", quality = JPEG_QUALITY)
        b64 = base64.b64encode(buffer.getvalue()).decode()
        return img, b64

    def has_changed(self, img):
        current_hash = imagehash.phash(img)

        if self.last_hash is None: 
            self.last_hash = current_hash
            return True

        distance = current_hash - self.last_hash
        self.last_hash = current_hash

        return distance > HASH_THRESHOLD

    def add_to_buffer(self, b64):
        self.buffer.append(b64)
        self.latest_b64 = b64
        if len (self.buffer) > self.buffer_size:
            self.buffer.pop(0)

    def get_buffer(self):
        return self.buffer.copy()

    def start(self):
        self.running = True
        thread = threading.Thread(target=self._loop, daemon=True)
        thread.start()

    def _loop(self):
        while self.running:
            try:
                img, b64 = self.capture()
                if self.has_changed(img):
                    self.add_to_buffer(b64)
            except Exception as e: 
                print(f"[screen_capture] Error: {e}")
            time.sleep(self.interval)

    def set_interval(self, seconds):
        self.interval = max(1, seconds)

    def stop(self):
        self.running = False
