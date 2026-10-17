# Alternative to Modal (e.g. Railway). Build from services/cv.
FROM python:3.12-slim
# libgl1/libglib2.0-0: OpenCV · libegl1/libgles2: MediaPipe Tasks runtime
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libegl1 libgles2 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt requirements-mediapipe.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-mediapipe.txt
COPY app ./app
# bake the hand landmarker and image embedder models into the image so the first request doesn't download them
RUN python -c "from app.modules.hands import hand_model_path; from app.embedding import embedder_model_path; print(hand_model_path(), embedder_model_path())"
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
