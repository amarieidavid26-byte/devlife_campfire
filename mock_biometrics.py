import time 
import threading 

class MockBiometrics: 
    PRESETS = {
        1: {
            "name": "DEEP_FOCUS",
            "heartRate": 62,
            "strain": 10.2,
            "recovery": 75,
            "sleepPerformance": 0.85,
            "hrv": 40,
            "estimated_stress": 1.2,
            "spo2": 97.5,
            "skinTemp": 33.2
        },
        2: {
            "name": "STRESSED",
            "heartRate": 95,
            "strain": 18.5,
            "recovery": 45,
            "sleepPerformance": 0.72,
            "hrv": 22,
            "estimated_stress": 2.6,
            "spo2": 96.0,
            "skinTemp": 34.1
        },
        3: {
             "name": "FATIGUED", 
            "heartRate": 55,
            "strain": 3.1, 
            "recovery": 30, 
            "sleepPerformance": 0.45,
            "hrv": 28, 
            "estimated_stress": 1.8, 
            "spo2": 95.5,
            "skinTemp": 33.0
        }, 
        4: {
            "name": "RELAXED", 
            "heartRate": 68,
            "strain": 4.5,
            "recovery": 85,
            "sleepPerformance": 0.92,
            "hrv": 72, 
            "estimated_stress": 0.4, 
            "spo2": 98.0,
            "skinTemp": 33.5
        },
        5: {
            "name": "WIRED", 
            "heartRate": 88,
            "strain": 14.3,
            "recovery": 50, 
            "sleepPerformance": 0.70,
            "hrv": 35,
            "estimated_stress": 1.9,
            "spo2": 96.5,
            "skinTemp": 33.8
        }
    }

    NUMERIC_FIELDS = {
        "heartRate", "strain", "recovery", "sleepPerformance", "hrv", "estimated_stress", "spo2", "skinTemp"

    }

    def __init__(self): 
        self.current_preset = 4
        self.current_data = dict(self.PRESETS[4])
        self.target_data = dict(self.PRESETS[4])
        self.transitioning = False

    def set_state(self, preset_number):
        if preset_number not in self.PRESETS: 
            return False

        self.current_preset = preset_number
        self.target_data = dict(self.PRESETS[preset_number])
        self.transitioning = True

        thread = threading.Thread(target = self._transition, daemon = True)
        thread.start()
        return True

    def get_data(self): 
        return dict(self.current_data)
    
    def get_state_name(self):
        return self.PRESETS[self.current_preset]["name"]

    def _transition(self):
        steps = 20
        delay = 2.0 / steps
        start_data = dict(self.current_data)
        
        for step in range (1, steps + 1):
            progress = step / steps

            for key in self.NUMERIC_FIELDS: 
                start_val = start_data.get(key, 0)
                target_val = self.target_data.get(key, 0)
                self.current_data[key] = start_val + (target_val - start_val) * progress

        time.sleep(delay)
    
        self.current_data["name"] = self.target_data["name"]
        self.transitioning = False


        