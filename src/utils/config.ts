import dotenv from 'dotenv';

dotenv.config();

export const config = {
  token: process.env.TOKEN,
  apiUrl: process.env.API_URL,
  updateInterval: Number(process.env.UPDATE_INTERVAL) || 5000,
  minSpeed: Number(process.env.MIN_SPEED) || 20,
  maxSpeed: Number(process.env.MAX_SPEED) || 60,
  acceleration: Number(process.env.ACCELERATION) || 5,
  deceleration: Number(process.env.DECELERATION) || 7,
  turnThreshold: Number(process.env.TURN_THRESHOLD) || 30,
  heatZoneSpeedFactor: Number(process.env.HEATZONE_SPEED_FACTOR) || 0.5,
  defaultVehicles: Number(process.env.DEFAULT_VEHICLES) || 10,
  updateServer: process.env.UPDATE_SERVER === 'true',
  geojsonPath: process.env.GEOJSON_PATH || "./export.geojson"
} as const;

export function verifyConfig() {
  if (!config.token) {
    throw new Error('Missing required environment variable: TOKEN');
  }

  if (!config.geojsonPath) {
    throw new Error('Missing required environment variable: GEOJSON_PATH');
  }  

}