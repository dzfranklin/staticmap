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
        padding: 18,
        features: [
          {
            kind: "line",
            path: [
              [-122.5, 37.7],
              [-122.4, 37.8],
              [-122.3, 37.75],
            ],
            style: {
              color: "#00ff00",
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
        padding: 17,
        features: [
          {
            kind: "line",
            path: [
              [-122.6, 37.68],
              [-122.5, 37.76],
              [-122.4, 37.74],
            ],
            style: {
              color: "#ffffff",
              width: 10,
              lineCap: "round",
              lineJoin: "round",
            },
          },
          {
            kind: "line",
            path: [
              [-122.6, 37.68],
              [-122.5, 37.76],
              [-122.4, 37.74],
            ],
            style: {
              color: "#2563eb",
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
        features: [
          {
            kind: "line",
            path: [
              [-0.1278, 51.5074],
              [-1.8904, 52.4862],
            ],
            style: {
              color: "#ff0000",
              width: 4,
              lineCap: "round",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "dashed-line",
      options: {
        source,
        size: { width: 320, height: 180 },
        padding: 18,
        features: [
          {
            kind: "line",
            path: [
              [-122.5, 37.7],
              [-122.4, 37.8],
              [-122.3, 37.75],
            ],
            style: {
              color: "#e11d48",
              width: 6,
              dasharray: [2, 1],
              lineCap: "butt",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "point",
      options: {
        source,
        size: { width: 320, height: 180 },
        padding: 20,
        features: [
          {
            kind: "point",
            lng: -122.4,
            lat: 37.77,
            style: {
              color: "#ff0000",
              width: 20,
              borderStroke: "#ffffff",
              borderWidth: 4,
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

const snapshotDir = path.resolve(
  import.meta.dirname,
  "__snapshots__",
  "images/",
);

const failureArtifactDir = path.resolve(
  import.meta.dirname,
  "__artifacts__",
  "visual-diff/",
);

const snapshotUpdateMode: "missing-only" | "all" | "none" =
  process.env.UPDATE_ALL_SNAPSHOTS === "1"
    ? "all"
    : process.env.UPDATE_NEW_SNAPSHOTS === "1"
      ? "missing-only"
      : "none";

function assertVisualSnapshot(name: string, buffer: Buffer): void {
  const result = snapshotTest(name, buffer);
  if (!result.success) {
    if (!result.expected && snapshotUpdateMode !== "none") {
      writeSnapshot(name, buffer);
      console.warn(`Created new snapshot for ${name}`);
      return;
    } else if (snapshotUpdateMode === "all") {
      writeSnapshot(name, buffer);
      console.warn(`Updated snapshot for ${name}`);
      return;
    }

    writeSnapshotFailureArtifacts(result);
  }

  expect(result.success, result.message).toBe(true);

  if (result.success && result.diffPixels) {
    console.warn(
      `Snapshot for ${name} has ${result.diffPixels} differing pixels. ` +
        `Consider updating the snapshot if this change is expected.`,
    );
  }
}

interface SnapshotResult {
  name: string;
  success: boolean;
  message?: string;
  expected?: PNG;
  actual?: PNG;
  diff?: PNG;
  diffPixels?: number;
}

function snapshotTest(
  name: string,
  buffer: Buffer,
  {
    threshold = 0.1,
    maxDiffRatio = 0.0005,
  }: { threshold?: number; maxDiffRatio?: number } = {},
): SnapshotResult {
  const r: SnapshotResult = { name, success: false };

  const snapshotPath = path.join(snapshotDir, `${name}.png`);
  try {
    r.expected = PNG.sync.read(fs.readFileSync(snapshotPath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ...r,
        message: `Missing snapshot for ${name}. Run with UPDATE_NEW_SNAPSHOTS=1 to create it.`,
      };
    } else {
      throw err;
    }
  }

  r.actual = PNG.sync.read(buffer);
  if (
    r.expected.width !== r.actual.width ||
    r.expected.height !== r.actual.height
  ) {
    const message =
      `Snapshot size mismatch for ${name}. ` +
      `Expected ${r.expected.width}x${r.expected.height}, got ${r.actual.width}x${r.actual.height}.`;
    return { ...r, message };
  }

  r.diff = new PNG({ width: r.expected.width, height: r.expected.height });
  r.diffPixels = pixelmatch(
    r.expected.data,
    r.actual.data,
    r.diff.data,
    r.expected.width,
    r.expected.height,
    { threshold },
  );

  const totalPixels = r.expected.width * r.expected.height;
  const diffRatio = r.diffPixels / totalPixels;

  if (diffRatio > maxDiffRatio) {
    const message =
      `Snapshot mismatch for ${name}. ` +
      `${(diffRatio * 100).toFixed(2)}% of pixels differ (${r.diffPixels} pixels), ` +
      `exceeding the threshold of ${(maxDiffRatio * 100).toFixed(2)}%.`;
    return { ...r, message };
  }

  return { ...r, success: true };
}

function writeSnapshotFailureArtifacts(r: SnapshotResult): void {
  if (r.success) throw new Error("bad state: success");

  const expectedPath = path.join(failureArtifactDir, `${r.name}.expected.png`);
  const actualPath = path.join(failureArtifactDir, `${r.name}.actual.png`);
  const diffPath = path.join(failureArtifactDir, `${r.name}.diff.png`);

  fs.mkdirSync(failureArtifactDir, { recursive: true });
  if (r.expected) fs.writeFileSync(expectedPath, PNG.sync.write(r.expected));
  if (r.actual) fs.writeFileSync(actualPath, PNG.sync.write(r.actual));
  if (r.diff) fs.writeFileSync(diffPath, PNG.sync.write(r.diff));
}

function writeSnapshot(name: string, buffer: Buffer): void {
  const snapshotPath = path.join(snapshotDir, `${name}.png`);
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(snapshotPath, buffer);
}
