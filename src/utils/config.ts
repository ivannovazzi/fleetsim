import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  updateInterval: Number(process.env.UPDATE_INTERVAL) || 500,
  minSpeed: Number(process.env.MIN_SPEED) || 20,
  maxSpeed: Number(process.env.MAX_SPEED) || 60,
  acceleration: Number(process.env.ACCELERATION) || 5,
  deceleration: Number(process.env.DECELERATION) || 7,
  turnThreshold: Number(process.env.TURN_THRESHOLD) || 30,
  speedVariation: Number(process.env.SPEED_VARIATION) || 0.1,
  heatZoneSpeedFactor: Number(process.env.HEATZONE_SPEED_FACTOR) || 0.5,
  useAdapter: process.env.USE_ADAPTER === 'true' || false,
  syncAdapter: process.env.SYNC_ADAPTER === 'true',
  syncAdapterTimeout: Number(process.env.SYNC_ADAPTER_TIMEOUT) || 5000,
  geojsonPath: process.env.GEOJSON_PATH || "./export.geojson",
  adapterURL: process.env.ADAPTER_URL || 'http://localhost:3001',
} as const;

export function verifyConfig() {
  if (!config.geojsonPath) {
    throw new Error('Missing required environment variable: GEOJSON_PATH');
  }
}