import pino from "pino";

const testDestination: pino.DestinationStream = {
  write(msg: string) {
    console.log(msg);
  },
};

export const logger = pino(
  {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  process.env.NODE_ENV === "test" ? testDestination : undefined,
);
