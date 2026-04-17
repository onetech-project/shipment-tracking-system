FROM mcr.microsoft.com/devcontainers/javascript-node:24

RUN apt-get update && apt-get install -y \
  tzdata \
  build-essential \
  python3 \
  postgresql-client \
  redis-tools \
  && rm -rf /var/lib/apt/lists/*

# Set timezone
ENV TZ=Asia/Jakarta
RUN ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime && echo ${TZ} > /etc/timezone
RUN date