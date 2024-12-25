declare namespace NodeJS {
  interface ProcessEnv {
    TOKEN: string;
    API_URL: string;
    UPDATE_INTERVAL: string;
    MIN_SPEED: string;
    MAX_SPEED: string;
    ACCELERATION: string;
    DECELERATION: string; 
    TURN_THRESHOLD: string;
    DEFAULT_VEHICLES: string;
    GEOJSON_PATH: string;
  }
}