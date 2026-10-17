"""Deploy: `modal deploy modal_app.py` (from services/cv). Serve locally: `modal serve modal_app.py`."""
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install_from_requirements("requirements.txt")
    .pip_install_from_requirements("requirements-mediapipe.txt")
    .add_local_python_source("app")
)

app = modal.App("visual-followup-cv", image=image)


@app.function(timeout=300)
@modal.asgi_app()
def fastapi_app():
    from app.main import app as web

    return web
