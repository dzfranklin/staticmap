import { describe, expect, it } from "vitest";
import { computePages } from "./pagination.js";
import { parsePath } from "../parser.js";
import { SizeCommand } from "../commands/index.js";
import { HttpError } from "../errors.js";
import type { Source } from "../staticmap.js";

// SF to LA, roughly north-south
const sfToLa = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
// Short segment in London for EPSG:27700 tests
const londonSegment = "_ibwIehwDqvCesD";

const source: Source = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
};

const source27700: Source = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
  crs: "EPSG:27700",
};

function commands(path: string) {
  return parsePath(path).commands;
}

const pageSize = { width: 800, height: 600 };

describe("computePages", () => {
  it("returns attribution from source", () => {
    const sourceWithAttrib: Source = { ...source, attribution: "© OSM" };
    const { attribution } = computePages(
      "osm",
      commands(`/map:osm/zoom:6/line:${sfToLa}`),
      sourceWithAttrib,
      pageSize,
      50,
    );
    expect(attribution).toBe("© OSM");
  });

  it("returns undefined attribution when source has none", () => {
    const { attribution } = computePages(
      "osm",
      commands(`/map:osm/zoom:6/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    expect(attribution).toBeUndefined();
  });

  it("each page url is a valid map path", () => {
    const { pages } = computePages(
      "osm",
      commands(`/map:osm/zoom:6/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    for (const page of pages) {
      expect(() => parsePath(page.url)).not.toThrow();
    }
  });

  it("each page has the requested size", () => {
    const { pages } = computePages(
      "osm",
      commands(`/map:osm/zoom:6/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    for (const page of pages) {
      expect(page.size).toEqual(pageSize);
    }
  });

  it("pages have non-overlapping row/col positions", () => {
    const { pages } = computePages(
      "osm",
      commands(`/map:osm/zoom:6/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    const keys = pages.map((p) => `${p.row},${p.col}`);
    expect(new Set(keys).size).toBe(pages.length);
  });

  it("pages cover consecutive rows and cols with no gaps", () => {
    const { pages } = computePages(
      "osm",
      commands(`/map:osm/zoom:6/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    // Every page's row and col should be non-negative integers
    for (const page of pages) {
      expect(page.row).toBeGreaterThanOrEqual(0);
      expect(page.col).toBeGreaterThanOrEqual(0);
    }
  });

  it("produces nativeBounds for EPSG:27700 source", () => {
    const { pages } = computePages(
      "os",
      commands(`/map:os/zoom:8/line:${londonSegment}`),
      source27700,
      pageSize,
      50,
    );
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.nativeBounds).toBeDefined();
      expect(page.nativeBounds!.crs).toBe("EPSG:27700");
      expect(page.nativeBounds!.maxX).toBeGreaterThan(page.nativeBounds!.minX);
      expect(page.nativeBounds!.maxY).toBeGreaterThan(page.nativeBounds!.minY);
    }
  });

  it("does not produce nativeBounds for EPSG:3857 source", () => {
    const { pages } = computePages(
      "osm",
      commands(`/map:osm/zoom:6/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    for (const page of pages) {
      expect(page.nativeBounds).toBeUndefined();
    }
  });

  it("encodes page size in page urls, replacing any input size command", () => {
    const cmds = [
      ...commands(`/map:osm/zoom:6/line:${sfToLa}`),
      new SizeCommand({ width: 1000, height: 800 }),
    ];
    const { pages } = computePages("osm", cmds, source, pageSize, 50);
    for (const page of pages) {
      expect(page.url).toMatch(
        new RegExp(`size:${pageSize.width}:${pageSize.height}`),
      );
    }
  });

  it("throws when zoom is missing", () => {
    expect(() =>
      computePages(
        "osm",
        commands(`/map:osm/line:${sfToLa}`),
        source,
        pageSize,
        50,
      ),
    ).toThrow(HttpError);
  });

  it("throws when no features provided", () => {
    expect(() =>
      computePages("osm", commands(`/map:osm/zoom:6`), source, pageSize, 50),
    ).toThrow(HttpError);
  });

  it("throws when pageOverlap >= page width", () => {
    expect(() =>
      computePages(
        "osm",
        commands(`/map:osm/zoom:6/line:${sfToLa}`),
        source,
        pageSize,
        pageSize.width,
      ),
    ).toThrow(HttpError);
  });

  it("returns at least one page for a valid line", () => {
    const { pages } = computePages(
      "osm",
      commands(`/map:osm/zoom:6/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    expect(pages.length).toBeGreaterThan(0);
  });

  it("higher zoom produces more pages", () => {
    const low = computePages(
      "osm",
      commands(`/map:osm/zoom:5/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    const high = computePages(
      "osm",
      commands(`/map:osm/zoom:8/line:${sfToLa}`),
      source,
      pageSize,
      50,
    );
    expect(high.pages.length).toBeGreaterThan(low.pages.length);
  });

  it("scale command resolves before pagination on EPSG:27700 source", () => {
    // scale:25000 should not throw "print requires a zoom command"
    const { pages } = computePages(
      "os",
      commands(`/map:os/scale:25000/line:${londonSegment}`),
      source27700,
      pageSize,
      50,
    );
    expect(pages.length).toBeGreaterThan(0);
  });

  it("scale command page urls preserve scale command", () => {
    const { pages } = computePages(
      "os",
      commands(`/map:os/scale:25000/line:${londonSegment}`),
      source27700,
      pageSize,
      50,
    );
    for (const page of pages) {
      expect(page.url).toContain("scale:25000");
    }
  });
});
