import { pino } from "pino";

export const log = pino({
  level: process.env["LOG_LEVEL"] || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      singleLine: true,
    },
  },
});

export type Logger = pino.Logger;
