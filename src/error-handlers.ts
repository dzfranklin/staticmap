import { createCanvas, CanvasRenderingContext2D } from "canvas";
import { HttpError } from "./errors.js";
import express from "express";
import { logger } from "./logger.js";

export function handleJsonError(err: unknown, res: express.Response): void {
  const status = err instanceof HttpError ? err.status : 500;
  const message =
    err instanceof HttpError ? err.message : "Internal server error";
  if (!(err instanceof HttpError)) {
    logger.error({ err }, "Unhandled error");
  }
  res
    .status(status)
    .setHeader("Content-Type", "application/json")
    .json({ error: message });
}

export function handleError(err: unknown, res: express.Response): void {
  const status = err instanceof HttpError ? err.status : 500;
  const message =
    err instanceof HttpError ? err.message : "Internal server error";

  if (!(err instanceof HttpError)) {
    logger.error({ err }, "Unhandled error");
    res
      .status(500)
      .setHeader("Content-Type", "text/plain")
      .send("Internal server error");
    return;
  }

  const buffer = renderErrorImage(status, message);
  res
    .status(status)
    .setHeader("Content-Type", "image/png")
    .setHeader("Cache-Control", "no-store")
    .setHeader("X-Map-Error", message)
    .send(buffer);
}

function renderErrorImage(status: number, message: string): Buffer {
  const width = 640;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f5f1e8";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1f1f1f";
  ctx.font = "700 28px sans-serif";
  ctx.fillText(`Staticmap error (${status})`, 32, 56);

  ctx.fillStyle = "#3c3c3c";
  ctx.font = "16px sans-serif";
  drawWrappedText(ctx, message, 32, 96, width - 64, 22);

  ctx.strokeStyle = "#e0d8cb";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  return canvas.toBuffer("image/png");
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ctx.fillText(line, x, cursorY);
  }
}
