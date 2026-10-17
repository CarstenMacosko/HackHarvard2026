from __future__ import annotations

import os
import tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import registry
from .models import AnalyzeRequest, AnalyzeResponse
from .pipeline import analyze

app = FastAPI(title="Visual Follow-Up CV service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/modules")
def modules() -> list[dict]:
    """Registry catalog: what the workflow builder can compose."""
    return registry.catalog()


def _check_module(module_id: str) -> None:
    try:
        registry.get(module_id)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_url(req: AnalyzeRequest) -> AnalyzeResponse:
    """Analyze media by URL (e.g. a signed Supabase Storage URL the agent uploaded to)."""
    _check_module(req.module)
    if not req.media_url:
        raise HTTPException(422, "media_url is required")
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        r = await client.get(req.media_url)
        if r.status_code != 200:
            raise HTTPException(502, f"could not fetch media ({r.status_code})")
    suffix = Path(req.media_url.split("?")[0]).suffix or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(r.content)
        f.flush()
        return analyze(req, f.name)


@app.post("/analyze/upload", response_model=AnalyzeResponse)
async def analyze_upload(file: UploadFile = File(...), request: str = Form(...)) -> AnalyzeResponse:
    """Dev/testing: multipart upload with the AnalyzeRequest JSON in the `request` field."""
    req = AnalyzeRequest.model_validate_json(request)
    _check_module(req.module)
    suffix = Path(file.filename or "").suffix or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(await file.read())
        f.flush()
        return analyze(req, f.name)
