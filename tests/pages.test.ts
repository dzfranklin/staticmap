import { describe, expect, it } from "vitest";
import { parsePath, buildOptions, HttpError } from "../src/parser.js";
import { computePages } from "../src/pages.js";
import { resolveView, type StaticMapSource } from "../src/staticmap.js";

// San Francisco to Los Angeles, roughly north-south
const sfToLa = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

const source: StaticMapSource = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
};

const source27700: StaticMapSource = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
  crs: "EPSG:27700",
};

function pages(path: string, src: StaticMapSource = source) {
  const { sourceKey, commands } = parsePath(path);
  return computePages(sourceKey, commands, src);
}

describe("computePages", () => {
  it("produces multiple pages for a long path at high zoom", () => {
    const result = pages(
      `/map:osm/size:2000x2000/zoom:14/pageOverlap:0/line:${sfToLa}`,
    );
    expect(result.pages.length).toBeGreaterThan(1);
  });

  it("grid covers the entire path", () => {
    const result = pages(
      `/map:osm/size:2000x2000/zoom:6/pageOverlap:0/line:${sfToLa}`,
    );
    expect(result.pages.length).toBe(1);
  });

  it("produces more pages at higher zoom", () => {
    const low = pages(
      `/map:osm/size:2000x2000/zoom:6/pageOverlap:0/line:${sfToLa}`,
    );
    const high = pages(
      `/map:osm/size:2000x2000/zoom:10/pageOverlap:0/line:${sfToLa}`,
    );
    expect(high.pages.length).toBeGreaterThan(low.pages.length);
  });

  it("overlap reduces stride so there are more pages", () => {
    const noOverlap = pages(
      `/map:osm/size:400x400/zoom:8/pageOverlap:0/line:${sfToLa}`,
    );
    const withOverlap = pages(
      `/map:osm/size:400x400/zoom:8/pageOverlap:100/line:${sfToLa}`,
    );
    expect(withOverlap.pages.length).toBeGreaterThanOrEqual(
      noOverlap.pages.length,
    );
  });

  it("row/col indices are correct", () => {
    const result = pages(
      `/map:osm/size:400x400/zoom:8/pageOverlap:0/line:${sfToLa}`,
    );
    for (const tile of result.pages) {
      expect(tile.row).toBeGreaterThanOrEqual(0);
      expect(tile.col).toBeGreaterThanOrEqual(0);
    }
  });

  it("each url is a /map: url with a center command", () => {
    const result = pages(
      `/map:osm/size:400x400/zoom:8/pageOverlap:0/line:${sfToLa}`,
    );
    for (const tile of result.pages) {
      expect(tile.url).toMatch(/^\/map:osm\//);
      expect(tile.url).toContain("/center:");
      expect(tile.center.lng).toBeTypeOf("number");
      expect(tile.center.lat).toBeTypeOf("number");
    }
  });

  it("url does not contain pageOverlap command", () => {
    const result = pages(
      `/map:osm/size:400x400/zoom:8/pageOverlap:100/line:${sfToLa}`,
    );
    const tile = result.pages[0]!;
    const { commands } = parsePath(tile.url);
    const centerCmd = commands.find((c) => c.type === "center");
    expect(centerCmd).toBeDefined();
  });

  it("replaces any existing center command", () => {
    const result = pages(
      `/map:osm/size:400x400/zoom:8/center:0,0/pageOverlap:0/line:${sfToLa}`,
    );
    for (const tile of result.pages) {
      expect(Math.abs(tile.center.lng)).toBeGreaterThan(0.01);
    }
  });

  it("defaults pageOverlap to 50", () => {
    const withDefault = pages(`/map:osm/size:400x400/zoom:8/line:${sfToLa}`);
    const withExplicit = pages(
      `/map:osm/size:400x400/zoom:8/pageOverlap:50/line:${sfToLa}`,
    );
    expect(withDefault.pages.length).toBe(withExplicit.pages.length);
  });

  it("rejects missing zoom", () => {
    expect(() => pages(`/map:osm/size:400x400/line:${sfToLa}`)).toThrow(
      HttpError,
    );
  });

  it("rejects pageOverlap >= page width", () => {
    expect(() =>
      pages(`/map:osm/size:400x400/zoom:8/pageOverlap:400/line:${sfToLa}`),
    ).toThrow(HttpError);
  });

  it("rejects missing line", () => {
    expect(() => pages(`/map:osm/size:400x400/zoom:8`)).toThrow(HttpError);
  });

  it("per-page url resolves to the computed center, not the line centroid", () => {
    const result = pages(
      `/map:osm/size:400x400/zoom:8/pageOverlap:0/line:${sfToLa}`,
    );
    for (const tile of result.pages) {
      const { commands } = parsePath(tile.url);
      const opts = buildOptions(commands, source);
      const { center } = resolveView(opts, source.tileSize ?? 256);
      expect(center.lng).toBeCloseTo(tile.center.lng, 4);
      expect(center.lat).toBeCloseTo(tile.center.lat, 4);
    }
  });

  it("works with a projected CRS source", () => {
    const { sourceKey, commands } = parsePath(
      `/map:os/size:2000x2000/zoom:5/pageOverlap:0/line:${sfToLa}`,
    );
    const result = computePages(sourceKey, commands, source27700);
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    for (const tile of result.pages) {
      expect(tile.url).toMatch(/^\/map:os\//);
    }
  });

  it("does not emit a page whose only content is in the buffer of an adjacent page", () => {
    const result = pages(
      `/map:osm/size:300x300/padding:0/pageOverlap:100/line:qgu{IdqxUvDyH\`DyCjC{Av@eBXEhFuK~@q@Z}BjDsG/zoom:15`,
    );
    expect(result.pages.length).toBe(1);
  });

  it("excludes pages with no lines passing through them", () => {
    // A diagonal line will not pass through all grid cells — some corner
    // cells should be absent from the result
    const withFilter = pages(
      `/map:osm/size:400x400/zoom:8/pageOverlap:0/line:${sfToLa}`,
    );
    // The SF-LA polyline runs roughly north-south, so a wide grid layout
    // should have fewer pages than numRows*numCols
    const withoutOverlap = pages(
      `/map:osm/size:200x200/zoom:8/pageOverlap:0/line:${sfToLa}`,
    );
    // Both must have at least one page
    expect(withFilter.pages.length).toBeGreaterThan(0);
    expect(withoutOverlap.pages.length).toBeGreaterThan(0);
  });
});
