"""
MindStream Emotion Inference

Extracts frames from a webcam clip, detects faces via Haar cascade,
runs inference using the FER+ MobileNetV2 model, and writes a result JSON.

Usage:
    python predict_emotion.py --clip /path/to/capture_<id>.webm
"""

import argparse
import json
import os
import sys

import numpy as np

_SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
MODEL_PATH = os.path.normpath(
    os.path.join(_SCRIPT_DIR, "..", "core_ai", "MODELS", "CV", "best_ferplus_emotion.keras")
)

FER_CLASSES = ["angry", "contempt", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
IMG_SIZE = (128, 128)
NUM_FRAMES = 5
BLUR_THRESHOLD = 40.0


def extract_frames(clip_path: str, n_frames: int) -> list:
    """Extract n_frames evenly-spaced frames from a .webm clip using PyAV."""
    import av

    frames = []
    with av.open(clip_path) as container:
        stream = container.streams.video[0]
        total = stream.frames

        if total == 0:
            for frame in container.decode(video=0):
                frames.append(frame.to_ndarray(format="rgb24"))
        else:
            indices = set(
                int(i * (total - 1) / (n_frames - 1))
                for i in range(n_frames)
            ) if n_frames > 1 else {0}

            for idx, frame in enumerate(container.decode(video=0)):
                if idx in indices:
                    frames.append(frame.to_ndarray(format="rgb24"))
                if len(frames) >= n_frames and idx >= max(indices):
                    break

    if not frames:
        raise RuntimeError(f"No frames decoded from: {clip_path}")

    if len(frames) > n_frames:
        step = len(frames) / n_frames
        frames = [frames[int(i * step)] for i in range(n_frames)]

    import cv2 as _cv2
    def _blur_score(f):
        gray = _cv2.cvtColor(f, _cv2.COLOR_RGB2GRAY)
        return _cv2.Laplacian(gray, _cv2.CV_64F).var()

    sharp = [f for f in frames if _blur_score(f) >= BLUR_THRESHOLD]
    if not sharp:
        print("[predict_emotion] All frames blurry, using sharpest available")
        sharp = sorted(frames, key=_blur_score, reverse=True)[:max(1, len(frames)//2)]
    else:
        print(f"[predict_emotion] {len(sharp)}/{len(frames)} frames passed blur check")

    return sharp


def crop_face_region(frame_rgb: np.ndarray, margin: float = 0.0) -> np.ndarray:
    """Crop to the largest face using OpenCV Haar cascade, falling back to full frame."""
    import cv2

    gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    if face_cascade.empty():
        return frame_rgb

    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))

    if len(faces) == 0:
        return frame_rgb

    x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])
    h_img, w_img, _ = frame_rgb.shape
    dx = int(w * margin)
    dy = int(h * margin)
    x1, y1 = max(0, x - dx), max(0, y - dy)
    x2, y2 = min(w_img, x + w + dx), min(h_img, y + h + dy)

    return frame_rgb[y1:y2, x1:x2]


def preprocess_frames(frames: list) -> np.ndarray:
    """Detect faces via Haar cascade and resize batch for MobileNetV2 input."""
    from PIL import Image
    try:
        from tf_keras.applications.mobilenet_v2 import preprocess_input
    except ImportError:
        from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

    import cv2

    batch = []
    for frame_rgb in frames:
        gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray_eq = clahe.apply(gray)

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        face_cascade = cv2.CascadeClassifier(cascade_path)

        face_detected = False
        if not face_cascade.empty():
            for sf, mn, ms in [(1.05, 3, 20), (1.1, 4, 30), (1.2, 5, 40)]:
                faces = face_cascade.detectMultiScale(
                    gray_eq, scaleFactor=sf, minNeighbors=mn, minSize=(ms, ms)
                )
                if len(faces) > 0:
                    x, y, w, h = max(faces, key=lambda r: r[2] * r[3])
                    h_img, w_img = frame_rgb.shape[:2]
                    face_pct = (w * h) / (w_img * h_img) * 100
                    if face_pct < 3.0:
                        print(f"[predict_emotion] Face area small ({face_pct:.1f}% of frame)")
                    dx, dy = int(w * 0.10), int(h * 0.10)
                    x1 = max(0, x - dx)
                    y1 = max(0, y - dy)
                    x2 = min(w_img, x + w + dx)
                    y2 = min(h_img, y + h + dy)
                    face_crop = frame_rgb[y1:y2, x1:x2]
                    if face_crop.size > 0 and face_crop.shape[0] > 10 and face_crop.shape[1] > 10:
                        batch.append(np.array(
                            Image.fromarray(face_crop).resize(IMG_SIZE, Image.BILINEAR),
                            dtype=np.float32
                        ))
                        face_detected = True
                    break

        if not face_detected:
            batch.append(np.array(
                Image.fromarray(frame_rgb).resize(IMG_SIZE, Image.BILINEAR),
                dtype=np.float32
            ))

    batch = np.stack(batch, axis=0)
    batch = preprocess_input(batch)
    return batch


def load_model(model_path: str):
    """Load Keras model, using tf_keras fallback when available."""
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    import tensorflow as tf
    tf.get_logger().setLevel("ERROR")

    try:
        import tf_keras
        model = tf_keras.models.load_model(model_path, compile=False)
    except ImportError:
        model = tf.keras.models.load_model(model_path, compile=False)
    return model


def predict(model, batch: np.ndarray) -> tuple:
    """Run model inference, averaging predictions across the top-3 peak confidence frames."""
    MIN_CONFIDENCE = 0.28
    TOP_K = 3

    probs = model.predict(batch, verbose=0)
    frame_peaks = probs.max(axis=1)

    k = min(TOP_K, len(probs))
    top_indices = np.argsort(frame_peaks)[::-1][:k]
    top_probs = probs[top_indices]
    top_peaks = frame_peaks[top_indices]

    for i, (p, peak) in enumerate(zip(probs, frame_peaks)):
        top = int(np.argmax(p))
        used = "✓" if i in top_indices else " "
        print(f"[predict_emotion]  [{used}] frame {i}: {FER_CLASSES[top]:<10} {peak:.2%}")

    weights = top_peaks / top_peaks.sum()
    weighted_avg = (top_probs * weights[:, None]).sum(axis=0)

    class_idx = int(np.argmax(weighted_avg))
    confidence = float(weighted_avg[class_idx])

    if confidence < MIN_CONFIDENCE:
        print(f"[predict_emotion] Low confidence ({confidence:.2%}), defaulting to neutral")
        return "neutral", confidence

    return FER_CLASSES[class_idx], confidence


def main():
    parser = argparse.ArgumentParser(description="MindStream emotion inference")
    parser.add_argument("--clip", required=True, help="Path to the webcam clip")
    args = parser.parse_args()

    clip_path = os.path.abspath(args.clip)
    if not os.path.isfile(clip_path):
        print(f"[predict_emotion] ERROR: clip not found: {clip_path}", file=sys.stderr)
        sys.exit(1)

    base = os.path.splitext(clip_path)[0]
    result_path = base + "_result.json"

    print(f"[predict_emotion] Processing: {os.path.basename(clip_path)}")

    try:
        print(f"[predict_emotion] Extracting {NUM_FRAMES} frames...")
        frames = extract_frames(clip_path, NUM_FRAMES)

        batch = preprocess_frames(frames)

        print("[predict_emotion] Loading model...")
        model = load_model(MODEL_PATH)

        print("[predict_emotion] Running inference...")
        label, confidence = predict(model, batch)

        print(f"[predict_emotion] Result: {label} ({confidence:.2%})")

        result = {
            "emotion": {
                "label": label,
                "confidence": round(confidence, 4),
            }
        }
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2)

        print(f"[predict_emotion] Written: {os.path.basename(result_path)}")

    except Exception as e:
        print(f"[predict_emotion] ERROR: {e}", file=sys.stderr)
        error_result = {"error": str(e), "emotion": None}
        with open(result_path, "w") as f:
            json.dump(error_result, f, indent=2)
        sys.exit(1)


if __name__ == "__main__":
    main()
