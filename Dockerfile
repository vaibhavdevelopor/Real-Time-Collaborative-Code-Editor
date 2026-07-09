# ─── MaxHeap Multi-Container Architecture ───
# This full-stack project is dockerized using a microservices pattern with Docker Compose.
#
# Dedicated container configurations can be found inside:
#   1. ./server/Dockerfile  -> Node.js / Express / Socket.IO backend
#   2. ./client/Dockerfile  -> React / Vite frontend served with Nginx
#
# To start the entire stack (Frontend + Backend + Redis) with one command, run:
#   docker-compose up --build
