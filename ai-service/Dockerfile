# syntax=docker/dockerfile:1
# Build context: ./ai-service   (CPU image; see notes for GPU)

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    YOLO_CONFIG_DIR=/tmp/Ultralytics
WORKDIR /app

# ultralytics pulls in opencv-python, which needs these shared libs
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU-only torch keeps the image far smaller; remove the first line for GPU builds
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements.txt

COPY fused_pipeline.py serve_videos.py *.yaml ./

# Trained weapon weights are not in the repo: mount them at runtime, e.g.
#   -v ./weights/runs:/app/runs   (expects runs/detect/weapon_detector_v4/weights/best.pt)
# yolov8m.pt is downloaded automatically on first run.
RUN useradd -r -u 10001 -m app && chown -R app /app
USER app

ENV MJPEG_PORT=8091
EXPOSE 8091
CMD ["python", "fused_pipeline.py"]
