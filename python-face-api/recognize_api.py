from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import os
import base64

app = Flask(__name__)
CORS(app)

FACES_DIR = "faces"
# LBPH's "confidence" is actually a distance -- lower means a closer match.
# 70 is a starting point; calibrate against real capture conditions (lighting,
# camera quality) before relying on this in production.
FACE_VERIFY_THRESHOLD = float(os.environ.get("FACE_VERIFY_THRESHOLD", 70))

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def decode_image(image_field):
    image_bytes = base64.b64decode(image_field.split(",")[1])
    np_arr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)


def detect_single_face(frame):
    """Returns (cropped_grayscale_face, None) on success, or (None, reason) on
    failure. Rejecting zero-face and multi-face frames doubles as a cheap
    anti-spoof guard (a printed photo held next to a real face, empty frames, etc)."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)
    if len(faces) == 0:
        return None, "no_face_detected"
    if len(faces) > 1:
        return None, "multiple_faces_detected"
    (x, y, w, h) = faces[0]
    return gray[y:y + h, x:x + w], None


def train_model():
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    faces = []
    labels = []
    label_map = {}
    current_label = 0

    for person_matric_number in os.listdir(FACES_DIR):
        person_folder = os.path.join(FACES_DIR, person_matric_number)
        if not os.path.isdir(person_folder):
            continue

        if person_matric_number not in label_map:
            label_map[person_matric_number] = current_label
            current_label += 1

        for img_file in os.listdir(person_folder):
            img_path = os.path.join(person_folder, img_file)
            img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)

            if img is None:
                print(f"[WARN] Could not read image: {img_path}")
                continue

            faces.append(img)
            labels.append(label_map[person_matric_number])

    if len(faces) == 0:
        raise ValueError("No face images found for training.")

    recognizer.train(faces, np.array(labels))
    return recognizer, {v: k for k, v in label_map.items()}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# Enroll a new student (matric_number, face image). Kept low-trust: anyone who
# can call this can add a face for any matric_number -- attaching this to a
# real student flow (looked-up-by-admin, or the student's own onboarding
# wizard) is the frontend's job, not this service's.
@app.route("/enroll", methods=["POST"])
def enroll():
    data = request.get_json(silent=True) or {}
    matric_number = data.get("matric_number")
    image = data.get("image")

    if not matric_number or not image:
        return jsonify({"error": "matric_number and image are required"}), 400

    frame = decode_image(image)
    face_img, reason = detect_single_face(frame)
    if face_img is None:
        return jsonify({"error": reason}), 400

    student_folder = os.path.join(FACES_DIR, matric_number)
    os.makedirs(student_folder, exist_ok=True)

    img_count = len(os.listdir(student_folder))
    img_path = os.path.join(student_folder, f"{img_count + 1}.jpg")
    cv2.imwrite(img_path, face_img)

    return jsonify({"message": f"Student {matric_number} enrolled successfully!"})


# Kiosk-only, 1:N, no threshold -- intentionally a lower trust bar than
# /verify. Never use this to gate attendance for a claimed identity.
@app.route("/recognize", methods=["POST"])
def recognize():
    data = request.get_json(silent=True) or {}
    image = data.get("image")
    if not image:
        return jsonify({"error": "image is required"}), 400

    frame = decode_image(image)
    face_img, reason = detect_single_face(frame)
    if face_img is None:
        return jsonify({"matric_number": "No face detected", "confidence": None})

    try:
        recognizer, label_reverse_map = train_model()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    label, confidence = recognizer.predict(face_img)
    matric_number = label_reverse_map.get(label, "Unknown")

    return jsonify({"matric_number": matric_number, "confidence": int(confidence)})


# 1:1, thresholded -- the actual attendance-verification gate. Rejects if the
# predicted identity isn't the one being claimed, or if confidence is worse
# than FACE_VERIFY_THRESHOLD.
@app.route("/verify", methods=["POST"])
def verify():
    data = request.get_json(silent=True) or {}
    matric_number = data.get("matric_number")
    image = data.get("image")

    if not matric_number or not image:
        return jsonify({"error": "matric_number and image are required"}), 400

    if not os.path.isdir(os.path.join(FACES_DIR, matric_number)):
        return jsonify({
            "verified": False,
            "confidence": None,
            "threshold": FACE_VERIFY_THRESHOLD,
            "reason": "not_enrolled",
        })

    frame = decode_image(image)
    face_img, reason = detect_single_face(frame)
    if face_img is None:
        return jsonify({
            "verified": False,
            "confidence": None,
            "threshold": FACE_VERIFY_THRESHOLD,
            "reason": reason,
        }), 400

    try:
        recognizer, label_reverse_map = train_model()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    label, confidence = recognizer.predict(face_img)
    predicted_matric_number = label_reverse_map.get(label)
    verified = predicted_matric_number == matric_number and confidence <= FACE_VERIFY_THRESHOLD

    return jsonify({
        "verified": bool(verified),
        "confidence": float(confidence),
        "threshold": FACE_VERIFY_THRESHOLD,
    })


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 5000)))
