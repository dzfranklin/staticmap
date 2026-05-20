import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCanvas } from "canvas";
import { renderPrintPdf } from "../src/print.js";
import { HttpError } from "../src/errors.js";
import type { Source } from "../src/staticmap.js";

// SF to LA, roughly north-south
const sfToLa = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

const source: Source = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
};

function makeTile(z: number, x: number, y: number): Buffer {
  const size = 256;
  const canvas = createCanvas(size * 2, size * 2);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `rgb(${(x * 40) % 255}, ${(y * 80) % 255}, ${(z * 60) % 255})`;
  ctx.fillRect(0, 0, size * 2, size * 2);
  return canvas.toBuffer("image/png");
}

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

describe("renderPrintPdf", () => {
  it("returns a PDF buffer", async () => {
    const pdf = await renderPrintPdf(
      { map: `/map:osm/zoom:6/line:${sfToLa}` },
      source,
      "osm",
    );
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rejects when no features provided", async () => {
    await expect(
      renderPrintPdf({ map: `/map:osm/zoom:8` }, source, "osm"),
    ).rejects.toThrow(HttpError);
  });

  it("rejects style=os with non-27700 source", async () => {
    await expect(
      renderPrintPdf(
        { map: `/map:osm/zoom:6/line:${sfToLa}`, style: "os" },
        source,
        "osm",
      ),
    ).rejects.toThrow(HttpError);
  });
});
