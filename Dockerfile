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
    MAX_SPEED=60 \
    HEATZONE_SPEED_FACTOR=0.5 \
    SPEED_VARIATION=0.2 \
    ACCELERATION=5 \
    DECELERATION=7 \
    TURN_THRESHOLD=30 \    
    DEFAULT_VEHICLES=10 \
    GEOJSON_PATH=/app/export.geojson \
    API_URL=https://graphql-dev.flaredispatch.com/graphql

CMD ["npm", "start"]