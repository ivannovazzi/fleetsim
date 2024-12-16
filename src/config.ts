import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2MmZiODRlMWNiOWJhMTk4MzJiZmM0ZCIsInJvbGUiOiJTVVBFUl9BRE1JTiIsImV4cCI6MTc0NTkzOTQwNiwiaWF0IjoxNzE0NDAzNDA2fQ.NaYJkSnpEisaQ8LYLauLMRvwK3k8642SQgCCwvni6cY",
  apiUrl: "https://graphql-dev.flaredispatch.com/graphql",
  updateInterval: Number(process.env.UPDATE_INTERVAL) || 5000,
  minSpeed: Number(process.env.MIN_SPEED) || 20,
  maxSpeed: Number(process.env.MAX_SPEED) || 60,
  acceleration: Number(process.env.ACCELERATION) || 5,
  deceleration: Number(process.env.DECELERATION) || 7,
  turnThreshold: Number(process.env.TURN_THRESHOLD) || 30,
  defaultVehicles: Number(process.env.DEFAULT_VEHICLES) || 10,
  geojsonPath: process.env.GEOJSON_PATH || path.join(__dirname, '../../../../Downloads', 'export.geojson')
} as const;