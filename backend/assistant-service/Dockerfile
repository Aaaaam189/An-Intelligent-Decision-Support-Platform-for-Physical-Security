# syntax=docker/dockerfile:1
# Build context: ./backend/assistant-service

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN useradd -r -u 10001 app && chown -R app /app
USER app

ENV SERVER_PORT=8087
EXPOSE 8087
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${SERVER_PORT}"]
