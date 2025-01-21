import pino from "pino";

function readableDate() {
  // return in 'YYYY-MM-DD HH:mm:ss' format, no milliseconds
  return new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
}

// Initialize base Pino logger
const baseLogger = pino({
  timestamp: pino.stdTimeFunctions.isoTime, // Use ISO time format
  base: null, // Remove default fields like pid and hostname
  level: 'info',
});

// Custom logger wrapper
const logger = {
  info: (message: string) => {
    console.log(`INFO @ ${readableDate()}: ${message}`);
  },
  error: (message: string) => {
    console.log(`ERROR @ ${readableDate()}: ${message}`);
  },
};

export default logger;