import base64
import os
import tempfile

import cv2
import numpy as np
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

FACE_API_KEY = os.environ.get("FACE_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = "face-enrollments"

# All training/test images are forced to this size before LBPH ever sees
# them -- OpenCV's LBPH requires every image in a training/predict call to
# share identical dimensions, which the original version of this script never
# enforced (it would throw the moment two differently-sized images existed,
# guaranteed given variable webcam resolutions and variable Haar bounding
# boxes).
FACE_SIZE = (200, 200)

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def check_auth() -> bool:
    return bool(FACE_API_KEY) and request.headers.get("X-Internal-Api-Key") == FACE_API_KEY


def decode_image(image_data_url):
    """'data:image/jpeg;base64,...' -> grayscale numpy image, or None if malformed."""
    try:
        b64 = image_data_url.split(",", 1)[1] if "," in image_data_url else image_data_url
        img_bytes = base64.b64decode(b64)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        return cv2.imdecode(np_arr, cv2.IMREAD_GRAYSCALE)
    except Exception:
        return None


def detect_and_crop_face(gray_img):
    """Returns (fixed_size_face, None) on success, or (None, reason) on failure."""
    if gray_img is None:
        return None, "no_face_detected"
    faces = face_cascade.detectMultiScale(gray_img, 1.3, 5)
    if len(faces) == 0:
        return None, "no_face_detected"
    if len(faces) > 1:
        return None, "multiple_faces_detected"
    x, y, w, h = faces[0]
    face = gray_img[y : y + h, x : x + w]
    return cv2.resize(face, FACE_SIZE), None


def storage_headers(content_type=None):
    headers = {"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def storage_upload(path: str, jpg_bytes: bytes) -> bool:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    headers = storage_headers("image/jpeg")
    headers["x-upsert"] = "true"
    res = requests.post(url, headers=headers, data=jpg_bytes, timeout=15)
    return res.ok


def storage_list(prefix: str):
    url = f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}"
    res = requests.post(url, headers=storage_headers("application/json"), json={"prefix": prefix}, timeout=15)
    if not res.ok:
        return []
    return [item["name"] for item in res.json() if not item["name"].startswith(".")]


def storage_download(path: str):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    res = requests.get(url, headers=storage_headers(), timeout=15)
    return res.content if res.ok else None


@app.route("/health", methods=["GET"])
def health():
    # Deliberately unauthenticated -- used for Render health checks and
    # uptime pings to keep the free-tier instance from sleeping.
    return jsonify({"status": "ok"})


@app.route("/enroll", methods=["POST"])
def enroll():
    if not check_auth():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    matric_number = data.get("matric_number")
    image = data.get("image")
    if not matric_number or not image:
        return jsonify({"error": "missing_fields"}), 400

    face, reason = detect_and_crop_face(decode_image(image))
    if face is None:
        return jsonify({"error": reason}), 400

    ok, buf = cv2.imencode(".jpg", face)
    if not ok:
        return jsonify({"error": "encode_failed"}), 500

    # Stored in Supabase Storage, not local disk -- Render's free-tier
    # filesystem is wiped on every redeploy/restart, so nothing enrollment-
    # critical can depend on surviving there.
    existing = storage_list(f"{matric_number}/")
    next_index = len(existing) + 1
    path = f"{matric_number}/{next_index}.jpg"

    if not storage_upload(path, buf.tobytes()):
        return jsonify({"error": "storage_upload_failed"}), 502

    return jsonify({"message": f"Student {matric_number} enrolled successfully!"}), 200


@app.route("/verify", methods=["POST"])
def verify():
    if not check_auth():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    matric_number = data.get("matric_number")
    image = data.get("image")
    if not matric_number or not image:
        return jsonify({"error": "missing_fields"}), 400

    probe_face, reason = detect_and_crop_face(decode_image(image))
    if probe_face is None:
        return jsonify({"distance": None, "reason": reason}), 200

    # Single-identity check: only ever trains against the *claimed* student's
    # own enrolled photos, downloaded fresh from Storage for this one call --
    # structurally unable to resolve to a different person's identity, unlike
    # the original script's open population-wide /recognize. Also fixes that
    # version's real performance problem (it retrained from scratch across
    # every enrolled student on every single call); this only ever touches
    # one student's photos.
    filenames = storage_list(f"{matric_number}/")
    if not filenames:
        return jsonify({"distance": None, "reason": "not_enrolled"}), 200

    training_faces = []
    for filename in filenames:
        content = storage_download(f"{matric_number}/{filename}")
        if content is None:
            continue
        np_arr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            continue
        training_faces.append(cv2.resize(img, FACE_SIZE))

    if not training_faces:
        return jsonify({"distance": None, "reason": "not_enrolled"}), 200

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    labels = np.zeros(len(training_faces), dtype=np.int32)
    recognizer.train(training_faces, labels)
    _label, distance = recognizer.predict(probe_face)

    # Raw distance only -- accept/reject threshold is applied by the calling
    # Edge Function (FACE_VERIFY_THRESHOLD), not decided here, matching how
    # the Luxand integration this replaces worked (a raw score in, a
    # threshold decision made by the Edge Function, independently tunable
    # without redeploying this service).
    return jsonify({"distance": float(distance), "reason": None}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
