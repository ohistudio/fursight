# The FurSight server (API, web app, glasses web app) in a container. Keys come in at run time, never in the image:
#   docker build -t fursight .
#   docker run -p 3030:3030 -e MODEL_API_KEY=... -e FURSIGHT_APP_TOKEN=... -e HUB_KEY=... fursight
# then open http://localhost:3030
FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
ENV PORT=3030
EXPOSE 3030
CMD ["node", "dev.js"]
