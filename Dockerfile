# syntax=docker/dockerfile:1

# --- 1. Build the React frontend ---------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Python runtime: FastAPI serves the API and the built frontend --------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_ENV=production
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/app ./app
COPY backend/log_config.json ./
COPY --from=frontend /frontend/dist ./static

RUN useradd --create-home --uid 1000 adix && chown -R adix /app
USER adix

EXPOSE 8000
# Railway injects PORT; 8000 is only the local default.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --log-config log_config.json"]
