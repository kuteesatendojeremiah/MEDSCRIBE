# Mediscribe processing image (Blueprint §10.3, §13). Synthetic data only until approvals exist (§11.1).
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
COPY backend/app ./app
COPY fixtures ./fixtures
COPY --from=web /web/dist ./web
USER 10001
EXPOSE 8000
# No request/response body logging anywhere (§10.1); access log off. Core dumps are disabled by the
# runtime (docker run --ulimit core=0), see docs/deploy.md.
CMD ["uvicorn", "app.web:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--log-level", "warning"]
