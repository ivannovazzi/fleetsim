FROM node:23-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:23-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist
COPY export.geojson ./

# Default environment variables
ENV NODE_ENV=production \
    UPDATE_INTERVAL=5000 \
    MIN_SPEED=20 \
    MAX_SPEED=120 \
    HEATZONE_SPEED_FACTOR=0.2 \
    SPEED_VARIATION=0.2 \
    ACCELERATION=5 \
    DECELERATION=7 \
    TURN_THRESHOLD=30 \
    GEOJSON_PATH=/app/export.geojson \
    USE_ADAPTER=false \
    ADAPTER_URL=http://localhost:3000 \
    SYNC_ADAPTER=false \
    SYNC_ADAPTER_TIMEOUT=5000

CMD ["npm", "start"]