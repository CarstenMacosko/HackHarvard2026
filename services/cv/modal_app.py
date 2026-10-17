"""Deploy: `modal deploy modal_app.py` (from services/cv). Serve locally: `modal serve modal_app.py`."""
import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgl1", "libglib2.0-0", "libegl1", "libgles2")
    .pip_install_from_requirements("requirements.txt")
    .pip_install_from_requirements("requirements-mediapipe.txt")
    .env({"HAND_LANDMARKER_MODEL": "/models/hand_landmarker.task", "IMAGE_EMBEDDER_MODEL": "/models/mobilenet_v3_small.tflite"})
    .run_commands(
        "mkdir -p /models && python -c \"import urllib.request; urllib.request.urlretrieve("
        "'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',"
        " '/models/hand_landmarker.task')\"",
        "python -c \"import urllib.request; urllib.request.urlretrieve("
        "'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite',"
        " '/models/mobilenet_v3_small.tflite')\"",
    )
    .add_local_python_source("app")
)

app = modal.App("visual-followup-cv", image=image)


@app.function(timeout=300)
@modal.asgi_app()
def fastapi_app():
    from app.main import app as web

    return web
