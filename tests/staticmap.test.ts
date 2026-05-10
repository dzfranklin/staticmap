import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  renderStaticMap,
  StaticMapOptions,
  StaticMapSource,
} from "../src/staticmap.js";

const originalFetch = globalThis.fetch;

function makeTile(z: number, x: number, y: number): Buffer {
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

beforeEach(() => {
  globalThis.fetch = (async (input: string | URL) => {
    const url = input.toString();
    const match = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    const z = match ? Number.parseInt(match[1]!, 10) : 0;
    const x = match ? Number.parseInt(match[2]!, 10) : 0;
    const y = match ? Number.parseInt(match[3]!, 10) : 0;
    const buffer = makeTile(z, x, y);

    return new Response(new Uint8Array(buffer));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const source = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
} satisfies StaticMapSource;

describe("renderStaticMap", () => {
  const cases = [
    {
      name: "basic-border",
      options: {
        source,
        size: { width: 320, height: 180 },
        padding: 10,
        lines: [
          {
            path: [
              [-122.5, 37.7],
              [-122.4, 37.8],
              [-122.3, 37.75],
            ],
            style: {
              stroke: "#00ff00",
              width: 8,
              borderStroke: "#ffffff",
              borderWidth: 4,
              lineCap: "round",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "double-line",
      options: {
        source,
        size: { width: 360, height: 200 },
        padding: 12,
        lines: [
          {
            path: [
              [-122.6, 37.68],
              [-122.5, 37.76],
              [-122.4, 37.74],
            ],
            style: {
              stroke: "#ffffff",
              width: 10,
              lineCap: "round",
              lineJoin: "round",
            },
          },
          {
            path: [
              [-122.6, 37.68],
              [-122.5, 37.76],
              [-122.4, 37.74],
            ],
            style: {
              stroke: "#2563eb",
              width: 4,
              lineCap: "round",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "epsg27700-basic",
      options: {
        source: {
          tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
          tileSize: 256,
          crs: "EPSG:27700",
        },
        size: { width: 320, height: 200 },
        padding: 10,
        lines: [
          {
            path: [
              [-0.1278, 51.5074],
              [-1.8904, 52.4862],
            ],
            style: {
              stroke: "#ff0000",
              width: 4,
              lineCap: "round",
              lineJoin: "round",
            },
          },
        ],
      },
    },
  ] satisfies { name: string; options: StaticMapOptions }[];

  for (const testCase of cases) {
    it(`renders ${testCase.name}`, async () => {
      const buffer = await renderStaticMap(testCase.options);
      assertVisualSnapshot(testCase.name, buffer);
    });
  }
});

function assertVisualSnapshot(name: string, buffer: Buffer): void {
  const snapshotDir = path.resolve(
    process.cwd(),
    "tests",
    "__snapshots__",
    "images",
  );
  const snapshotPath = path.join(snapshotDir, `${name}.png`);
  const artifactDir = path.resolve(
    process.cwd(),
    "tests",
    "__artifacts__",
    "visual-diff",
  );
  const expectedArtifactPath = path.join(artifactDir, `${name}.expected.png`);
  const actualArtifactPath = path.join(artifactDir, `${name}.actual.png`);
  const diffArtifactPath = path.join(artifactDir, `${name}.diff.png`);

  if (process.env.UPDATE_SNAPSHOTS) {
    fs.mkdirSync(snapshotDir, { recursive: true });
    fs.writeFileSync(snapshotPath, buffer);
    return;
  }

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(
      `Missing snapshot ${snapshotPath}. Run with UPDATE_SNAPSHOTS=1 to create it.`,
    );
  }

  const existing = fs.readFileSync(snapshotPath);
  const expected = PNG.sync.read(existing);
  const received = PNG.sync.read(buffer);

  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(actualArtifactPath, PNG.sync.write(received));

  if (
    expected.width !== received.width ||
    expected.height !== received.height
  ) {
    throw new Error(
      `Snapshot size mismatch for ${name}. Expected ${expected.width}x${expected.height}, got ${received.width}x${received.height}.`,
    );
  }

  const diff = new PNG({ width: expected.width, height: expected.height });
  const diffPixels = pixelmatch(
    expected.data,
    received.data,
    diff.data,
    expected.width,
    expected.height,
    { threshold: 0.1 },
  );

  if (diffPixels > 0) {
    fs.writeFileSync(diffArtifactPath, PNG.sync.write(diff));
    fs.copyFileSync(snapshotPath, expectedArtifactPath);
    throw new Error(
      `Snapshot mismatch for ${name}. Diff pixels: ${diffPixels}. See ${diffArtifactPath}.`,
    );
  }

  try {
    fs.rmSync(artifactDir, { recursive: true });
  } catch {}
}
