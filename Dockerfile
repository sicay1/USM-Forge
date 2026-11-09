FROM node:24-trixie-slim

# Native Linux encoder: MPEG-1 + ADX through FFmpeg, CRI muxing through CriCodecs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-native.txt /tmp/requirements-native.txt
RUN python3 -m venv /opt/cri && /opt/cri/bin/pip install --no-cache-dir --only-binary=:all: --require-hashes -r /tmp/requirements-native.txt

WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/mux-usm.py ./scripts/mux-usm.py
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md ./
COPY --chown=node:node docs ./docs
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 DATA_DIR=/data \
    USM_BACKEND=native PYTHON_PATH=/opt/cri/bin/python MAX_ENCODE_MB=256
USER node
EXPOSE 3210
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3210/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
