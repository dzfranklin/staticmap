import path from "path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { renderStaticMap, Options, Source } from "./staticmap.js";
import { DEFAULT_STYLE } from "./commands/index.js";
import { assertVisualSnapshot } from "./test-helpers/snapshots.js";
import { mockTileFetch } from "./test-helpers/tile-mock.js";

mockTileFetch();

const source = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
} satisfies Source;

const snapshotDir = path.resolve(
  import.meta.dirname,
  "__snapshots__",
  "staticmap.test.ts",
);

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
              ...DEFAULT_STYLE,
              color: "#00ff00",
              width: 8,
              borderColor: "#ffffff",
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
              ...DEFAULT_STYLE,
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
              ...DEFAULT_STYLE,
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
              ...DEFAULT_STYLE,
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
              ...DEFAULT_STYLE,
              color: "#e11d48",
              width: 6,
              lineDasharray: [2, 1],
              lineCap: "butt",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "dashed-line-with-border",
      options: {
        source,
        size: { width: 600, height: 340 },
        padding: 36,
        features: [
          {
            kind: "line",
            path: [
              [-122.5, 37.7],
              [-122.4, 37.8],
              [-122.3, 37.75],
            ],
            style: {
              ...DEFAULT_STYLE,
              color: "#0000ff",
              width: 12,
              borderColor: "#ffffff",
              borderWidth: 4,
              lineDasharray: [3, 2],
              lineCap: "butt",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "dashed-line-with-border-short-gap",
      options: {
        source,
        size: { width: 600, height: 340 },
        padding: 36,
        features: [
          {
            kind: "line",
            path: [
              [-122.5, 37.7],
              [-122.4, 37.8],
              [-122.3, 37.75],
            ],
            style: {
              ...DEFAULT_STYLE,
              color: "#0000ff",
              width: 8,
              borderColor: "#ffffff",
              borderWidth: 3,
              lineDasharray: [5, 3],
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
              ...DEFAULT_STYLE,
              color: "#ff0000",
              width: 20,
              borderColor: "#ffffff",
              borderWidth: 4,
              lineCap: "round",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "point-transparent-with-border",
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
              ...DEFAULT_STYLE,
              color: "#00000000",
              width: 40,
              borderColor: "#ff0000",
              borderWidth: 4,
            },
          },
        ],
      },
    },
    {
      name: "point-partly-transparent-with-border",
      options: {
        source,
        size: { width: 300, height: 180 },
        zoom: 14.4,
        features: [
          {
            kind: "point",
            lng: -122.4,
            lat: 37.77,
            style: {
              ...DEFAULT_STYLE,
              color: "#ff000040",
              width: 40,
              borderColor: "#ff000060",
              borderWidth: 4,
            },
          },
        ],
      },
    },
    {
      name: "line-transparent-with-border",
      options: {
        source,
        size: { width: 320, height: 180 },
        padding: 20,
        features: [
          {
            kind: "line",
            path: [
              [-122.5, 37.7],
              [-122.4, 37.8],
              [-122.3, 37.75],
            ],
            style: {
              ...DEFAULT_STYLE,
              color: "#00000000",
              width: 8,
              borderColor: "#ff0000",
              borderWidth: 4,
              lineCap: "round",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "line-partly-transparent-with-border",
      options: {
        source,
        size: { width: 320, height: 180 },
        padding: 20,
        features: [
          {
            kind: "line",
            path: [
              [-122.5, 37.7],
              [-122.4, 37.8],
              [-122.3, 37.75],
            ],
            style: {
              ...DEFAULT_STYLE,
              color: "#ff000040",
              width: 8,
              borderColor: "#ff000060",
              borderWidth: 4,
              lineCap: "round",
              lineJoin: "round",
            },
          },
        ],
      },
    },
    {
      name: "point-label-partly-transparent",
      options: {
        source,
        size: { width: 320, height: 180 },
        padding: 20,
        features: [
          {
            kind: "point",
            lng: -122.4,
            lat: 37.77,
            label: "Hello",
            style: {
              ...DEFAULT_STYLE,
              color: "#ff0000",
              width: 20,
              labelColor: "#1e3a5f40",
              labelAnchor: "top",
              labelOffset: 4,
              labelHaloWidth: 3,
              labelHaloColor: "#ffffff60",
            },
          },
        ],
      },
    },
    {
      name: "point-label-transparent",
      options: {
        source,
        size: { width: 320, height: 180 },
        padding: 20,
        features: [
          {
            kind: "point",
            lng: -122.4,
            lat: 37.77,
            label: "Hello",
            style: {
              ...DEFAULT_STYLE,
              color: "#ff0000",
              width: 20,
              labelColor: "#00000000",
              labelAnchor: "top",
              labelOffset: 4,
              labelHaloWidth: 3,
              labelHaloColor: "#00000080",
            },
          },
        ],
      },
    },
    {
      name: "point-label",
      options: {
        source,
        size: { width: 320, height: 180 },
        padding: 20,
        features: [
          {
            kind: "point",
            lng: -122.4,
            lat: 37.77,
            label: "Hello",
            style: {
              ...DEFAULT_STYLE,
              color: "#ff0000",
              width: 20,
              borderColor: "#ffffff",
              borderWidth: 4,
              lineCap: "round",
              lineJoin: "round",
              labelColor: "#1e3a5f",
              labelAnchor: "top",
              labelOffset: 4,
              labelHaloWidth: 3,
              labelHaloColor: "#ffffff",
            },
          },
        ],
      },
    },
  ] satisfies {
    name: string;
    options: Options;
  }[];

  for (const testCase of cases) {
    it(`renders ${testCase.name}`, async () => {
      const { buffer } = await renderStaticMap(testCase.options);
      assertVisualSnapshot(snapshotDir, testCase.name, buffer);
    });
  }

  it("renders with debug overlay without error", async () => {
    const options: Options = {
      source,
      size: { width: 320, height: 180 },
      padding: 16,
      debug: true,
      features: [
        {
          kind: "line",
          path: [
            [-122.5, 37.7],
            [-122.4, 37.8],
          ],
          style: { ...DEFAULT_STYLE, color: "#ff0000", width: 4 },
        },
      ],
    };
    const { buffer } = await renderStaticMap(options);
    const png = PNG.sync.read(buffer);
    expect(png.width).toBe(options.size.width * 2);
    expect(png.height).toBe(options.size.height * 2);
  });
});
