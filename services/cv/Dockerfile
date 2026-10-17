# Alternative to Modal (e.g. Railway). Build from services/cv.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt requirements-mediapipe.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-mediapipe.txt
COPY app ./app
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
