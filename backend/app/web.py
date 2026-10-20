"""Single-container entry point: the API under /api and the built frontend at /, all responses
no-store (Blueprint §10.2: Cache-Control no-store on app pages and API responses, which also keeps
pages out of the back-forward cache). No service worker is shipped.

    uvicorn app.web:app
"""

from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.main import create_app
from app.middleware import NoStoreMiddleware
from app.settings import REPO_ROOT, Settings, get_settings


def create_web_app(
    settings: Optional[Settings] = None, static_dir: Optional[Path] = None
) -> FastAPI:
    settings = settings or get_settings()
    dist = static_dir or settings.static_dir or (REPO_ROOT / "frontend" / "dist")
    outer = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    outer.add_middleware(NoStoreMiddleware)
    outer.mount("/api", create_app(settings))
    if dist.is_dir():
        outer.mount("/", StaticFiles(directory=dist, html=True), name="web")
    return outer


app = create_web_app()
