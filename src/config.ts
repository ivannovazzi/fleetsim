import dotenv from 'dotenv';

dotenv.config();

export const config = {
  token: process.env.TOKEN,
  apiUrl: "https://graphql-dev.flaredispatch.com/graphql",
  updateInterval: Number(process.env.UPDATE_INTERVAL) || 5000,
  minSpeed: Number(process.env.MIN_SPEED) || 20,
  maxSpeed: Number(process.env.MAX_SPEED) || 60,
  acceleration: Number(process.env.ACCELERATION) || 5,
  deceleration: Number(process.env.DECELERATION) || 7,
  turnThreshold: Number(process.env.TURN_THRESHOLD) || 30,
  defaultVehicles: Number(process.env.DEFAULT_VEHICLES) || 10,
  geojsonPath: process.env.GEOJSON_PATH || "./export.geojson"
} as const;