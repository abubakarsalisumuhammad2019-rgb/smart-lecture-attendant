from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import os
import base64

app = Flask(__name__)
CORS(app)

# Store student data (matric number and image path only)
student_data = {}

# Enroll a new student (matric_number, face image)
@app.route("/enroll", methods=["POST"])
def enroll():
    data = request.get_json()
    matric_number = data["matric_number"]
    image_data = data["image"].split(",")[1]
    image_bytes = base64.b64decode(image_data)
    np_arr = np.frombuffer(image_bytes, np.uint8)
    face_img = cv2.imdecode(np_arr, cv2.IMREAD_GRAYSCALE)

    # Save face image in folder (name the folder by student matric number)
    student_folder = os.path.join("faces", matric_number)
    os.makedirs(student_folder, exist_ok=True)

    # Save image as a file in the student's folder
    img_count = len(os.listdir(student_folder))
    img_name = f"{img_count + 1}.jpg"
    img_path = os.path.join(student_folder, img_name)
    cv2.imwrite(img_path, face_img)

    # Store student matric number and image path in the student_data dictionary
    student_data[matric_number] = {
        "image_path": img_path
    }

    return jsonify({"message": f"Student {matric_number} enrolled successfully!"})

# Train the model
def train_model():
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    faces = []
    labels = []
    label_map = {}
    current_label = 0

    # Loop through all subfolders in 'faces' and add student data
    for person_matric_number in os.listdir("faces"):
        person_folder = os.path.join("faces", person_matric_number)
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

# Face recognition API
@app.route("/recognize", methods=["POST"])
def recognize():
    data = request.get_json()
    image_data = data["image"].split(",")[1]
    image_bytes = base64.b64decode(image_data)
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    recognizer, label_reverse_map = train_model()
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)

    for (x, y, w, h) in faces:
        face_img = gray[y:y+h, x:x+w]
        label, confidence = recognizer.predict(face_img)
        matric_number = label_reverse_map.get(label, "Unknown")

        return jsonify({
            "matric_number": matric_number,
            "confidence": int(confidence)
        })

    return jsonify({"matric_number": "No face detected"})

if __name__ == "__main__":
    app.run(port=5000)
