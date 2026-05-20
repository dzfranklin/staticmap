import { createCanvas } from "canvas";
import { afterEach, beforeEach } from "vitest";

export function makeTile(z: number, x: number, y: number): Buffer {
  const size = 256;
  const dpi = 2;
  const canvas = createCanvas(size * dpi, size * dpi);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpi, dpi);
  ctx.antialias = "none";
  ctx.fillStyle = `rgb(${(x * 40) % 255}, ${(y * 80) % 255}, ${(z * 60) % 255})`;
  ctx.fillRect(0, 0, size, size);
  return canvas.toBuffer("image/png");
}

export function mockTileFetch(): void {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = (async (input: string | URL) => {
      const url = input.toString();
      const match = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
      const z = match ? Number.parseInt(match[1]!, 10) : 0;
      const x = match ? Number.parseInt(match[2]!, 10) : 0;
      const y = match ? Number.parseInt(match[3]!, 10) : 0;
      return new Response(new Uint8Array(makeTile(z, x, y)));
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
}
