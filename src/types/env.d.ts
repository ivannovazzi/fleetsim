declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    UPDATE_INTERVAL: string;
    MIN_SPEED: string;
    MAX_SPEED: string;
    ACCELERATION: string;
    DECELERATION: string; 
    TURN_THRESHOLD: string;
    GEOJSON_PATH: string;
    DEFAULT_VEHICLES: string;
  }
}