import pino from "pino";

const testDestination: pino.DestinationStream = {
  write(msg: string) {
    console.log(msg);
  },
};

let level: pino.LevelWithSilent = "debug";
if (process.env.NODE_ENV === "production") level = "info";
else if (process.env.NODE_ENV === "test") level = "warn";

export const logger = pino(
  {
    level,
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
