from typing import Optional

from fastapi import FastAPI

from app.logging_filter import configure_logging
from app.middleware import NoStoreMiddleware
from app.routes import auth, extract, render, transcribe
from app.security.accounts import AccountStore, LoginThrottle
from app.security.errors import install_error_handlers
from app.security.limits import RateLimiter
from app.security.tokens import TokenService
from app.settings import Settings, get_settings


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    configure_logging()
    settings = settings or get_settings()
    app = FastAPI(title="Mediscribe", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.tokens = TokenService(settings)
    app.state.limiter = RateLimiter(settings.rate_limit_per_minute)
    app.state.accounts = AccountStore(settings.accounts_file)
    app.state.throttle = LoginThrottle(settings.login_max_failures, settings.login_window_seconds)
    app.add_middleware(NoStoreMiddleware)
    install_error_handlers(app)
    app.include_router(auth.router)
    app.include_router(auth.admin)
    app.include_router(transcribe.router)
    app.include_router(extract.router)
    app.include_router(render.router)

    @app.get("/info")
    def info() -> dict:
        """Content-free description of what is processing audio, so the UI can say so honestly."""
        local = settings.provider == "local_whisper" and settings.provider_gate_approved
        return {
            "speech": "local" if local else "mock",
            "speech_model": settings.whisper_model if local else None,
            "synthetic_only": settings.synthetic_only,
        }

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
