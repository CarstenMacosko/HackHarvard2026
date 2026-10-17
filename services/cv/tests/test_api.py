import json

import cv2
from fastapi.testclient import TestClient

from app.main import app
from tests.test_eczema import skin_photo

client = TestClient(app)


def test_modules_catalog_lists_both_modules():
    ids = {m["id"] for m in client.get("/modules").json()}
    assert {"finger_tapping", "eczema_photo"} <= ids


def test_upload_returns_observation():
    ok, png = cv2.imencode(".png", skin_photo())
    req = {"module": "eczema_photo", "participant_id": "p1", "patient_report": {"itch": 4}}
    r = client.post("/analyze/upload", files={"file": ("x.png", png.tobytes(), "image/png")}, data={"request": json.dumps(req)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["review_status"] == "pending"
    assert body["patient_report"] == {"itch": 4}
    assert body["quality"]["accepted"]


def test_unknown_module_404():
    r = client.post("/analyze", json={"module": "nope", "media_url": "http://x"})
    assert r.status_code == 404
