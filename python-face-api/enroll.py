from flask import Flask, request, jsonify
import cv2
import os
import numpy as np
from flask_cors import CORS
import base64

app = Flask(__name__)
CORS(app)

@app.route('/enroll', methods=['POST'])
def enroll_person():
    data = request.json
    usn = data.get('usn')
    image_data = data.get('image')

    if not usn or not image_data:
        return jsonify({'message': 'Name or image data is missing'}), 400

    folder = os.path.join("faces", usn)
    os.makedirs(folder, exist_ok=True)

    # Convert base64 to image
    try:
        img_bytes = base64.b64decode(image_data.split(',')[1])
        nparr = np.frombuffer(img_bytes, np.uint8)
        img_np = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    except Exception as e:
        return jsonify({'message': 'Invalid image format'}), 400

    # Detect face
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = face_cascade.detectMultiScale(img_np, 1.3, 5)

    if len(faces) == 0:
        return jsonify({'message': 'No face detected'}), 400

    # Save detected face(s)
    count = len(os.listdir(folder)) + 1
    for (x, y, w, h) in faces:
        face = img_np[y:y+h, x:x+w]
        filename = os.path.join(folder, f"{usn}_{count}.jpg")
        cv2.imwrite(filename, face)
        print(f"[INFO] Saved face: {filename}")
        count += 1

    return jsonify({'message': 'Enrollment complete'}), 200

if __name__ == "__main__":
    app.run(port=5000)
