FROM mcr.microsoft.com/devcontainers/javascript-node:24

RUN apt-get update && apt-get install -y \
  tesseract-ocr \
  poppler-utils \
  imagemagick \
  libzbar0 \
  build-essential \
  python3 \
  postgresql-client \
  redis-tools \
  && rm -rf /var/lib/apt/lists/*
