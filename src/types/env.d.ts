declare namespace NodeJS {
  interface ProcessEnv {
    TOKEN: string;
    API_URL: string;
    MIN_SPEED: string;
    MAX_SPEED: string;
    SPEED_VARIATION: string;
    HEATZONE_SPEED_FACTOR: string;
    ACCELERATION: string;
    DECELERATION: string; 
    TURN_THRESHOLD: string;
    UPDATE_INTERVAL: string;
    UPDATE_SERVER: string;
    UPDATE_SERVER_TIMEOUT: string;    
    GEOJSON_PATH: string;
  }
}