# Mediscribe processing image (Blueprint §10.3, §13). Synthetic or test data only until approvals exist (§11.1).
# Stage 1: build the frontend. Stage 2: slim Python runtime (PDF is built in Python with ReportLab).
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY fixtures/ /fixtures/
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    HOME=/tmp \
    FIXTURES_DIR=/app/fixtures/synthetic STATIC_DIR=/app/web
RUN useradd --system --uid 10001 --no-create-home mediscribe
WORKDIR /app
COPY backend/pyproject.toml ./backend/pyproject.toml
RUN pip install --no-cache-dir fastapi==0.111.0 "uvicorn==0.30.1" pydantic==2.12.5 \
    pydantic-settings==2.3.0 python-docx==1.2.0 jsonschema==4.26.0 reportlab
# Local speech model (ADR-0005, ADR-0013): audio is transcribed inside this container and never sent to a
# third party. The model weights are downloaded once, at build time, so no request leaves at run time.
RUN pip install --no-cache-dir "faster-whisper==1.2.1" "av>=14,<19" numpy
ARG WHISPER_MODEL=small
ENV HF_HOME=/opt/hf WHISPER_MODEL=${WHISPER_MODEL}
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"     && chmod -R a+rX /opt/hf
COPY backend/app ./app
COPY fixtures ./fixtures
COPY --from=web /web/dist ./web
USER 10001
EXPOSE 8000
# Liveness only; content-free (/api/health). Render uses its own healthCheckPath (render.yaml).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"
# No request/response body logging anywhere (§10.1); access log off. Core dumps are disabled by the
# runtime (docker run --ulimit core=0), see docs/deploy.md.
CMD ["uvicorn", "app.web:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--log-level", "warning"]
