import json
import sys
import time
import signal
import base64

import cv2
import mediapipe as mp

running = True

def handle_sigterm(signum, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, handle_sigterm)

mp_hands = mp.solutions.hands

def emit(payload):
    line = json.dumps(payload) + "\n"
    sys.stdout.write(line)
    sys.stdout.flush()

def log(msg):
    sys.stderr.write(f"[hand_tracker] {msg}\n")
    sys.stderr.flush()

def is_raspberry_pi():
    try:
        with open("/proc/device-tree/model", "r") as f:
            model = f.read().lower()
            return "raspberry pi" in model
    except Exception:
        return False

def create_camera():
    if is_raspberry_pi():
        try:
            from picamera2 import Picamera2
            picam2 = Picamera2()
            config = picam2.create_preview_configuration(
                main={"size": (640, 480), "format": "RGB888"}
            )
            picam2.configure(config)
            picam2.start()
            log("Using Picamera2")
            return ("picamera2", picam2)
        except Exception as e:
            log(f"Picamera2 failed: {e}, falling back to OpenCV")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        log("ERROR: Could not open camera")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    log("Using OpenCV VideoCapture")
    return ("opencv", cap)

def capture_frame(camera_type, camera_obj):
    if camera_type == "picamera2":
        frame = camera_obj.capture_array()
        return frame

    ret, frame = camera_obj.read()
    if not ret or frame is None:
        return None
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

def release_camera(camera_type, camera_obj):
    if camera_type == "picamera2":
        camera_obj.stop()
    else:
        camera_obj.release()

def main():
    global running

    camera_type, camera_obj = create_camera()

    frame_count = 0
    FRAME_SEND_INTERVAL = 3
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 40]

    log("Starting hand tracking loop")

    with mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        model_complexity=0,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as hands:

        while running:
            rgb = capture_frame(camera_type, camera_obj)
            if rgb is None:
                time.sleep(0.01)
                continue

            h, w = rgb.shape[:2]

            rgb_mirrored = cv2.flip(rgb, 1)

            results = hands.process(rgb_mirrored)

            # Send coordinates for ALL detected hands (not just the first)
            if results.multi_hand_landmarks:
                hand_points = []
                for hand_landmarks in results.multi_hand_landmarks:
                    tip = hand_landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]
                    hand_points.append({
                        "x": float(tip.x),
                        "y": float(tip.y)
                    })

                emit({
                    "type": "hands",
                    "points": hand_points,
                    "width": w,
                    "height": h,
                    "ts": time.time()
                })

            frame_count += 1
            if frame_count % FRAME_SEND_INTERVAL == 0:
                small = cv2.resize(rgb_mirrored, (320, 240))
                bgr = cv2.cvtColor(small, cv2.COLOR_RGB2BGR)
                ret, jpeg = cv2.imencode(".jpg", bgr, encode_param)
                if ret:
                    b64 = base64.b64encode(jpeg.tobytes()).decode("ascii")
                    emit({
                        "type": "frame",
                        "data": b64,
                        "width": 320,
                        "height": 240,
                        "ts": time.time()
                    })

            time.sleep(0.01)

    release_camera(camera_type, camera_obj)
    log("Hand tracking stopped")

if __name__ == "__main__":
    main()