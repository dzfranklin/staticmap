import { describe, expect, it } from "vitest";
import { buildOptions, HttpError, parsePath, serializePath } from "../src/parser.js";

const samplePolyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
// Contains '?' which is a valid polyline character but a URL query delimiter
const polylineWithQuestionMark = "_a~Ca@fyiAdDC~@bAtBqHv@?~HgSnD";

const source = {
  tiles: ["https://example.com/{z}/{x}/{y}.png"],
  attribution: "Test",
};

describe("parsePath", () => {
  it("parses command segments", () => {
    const result = parsePath("/map:osm/size:600x150/width:4");
    expect(result.sourceKey).toBe("osm");
    expect(result.commands.length).toBe(2);
  });

  it("rejects unknown command", () => {
    try {
      parsePath("/map:osm/bogus:1");
      throw new Error("expected parsePath to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(400);
    }
  });
});

describe("buildOptions", () => {
  it("tracks style state across line commands", () => {
    const commands = parsePath(
      `/map:osm/color:%23ffffff/width:10/border:%23000000/borderWidth:12/line:${samplePolyline}/width:4/line:${samplePolyline}`,
    ).commands;

    const options = buildOptions(commands, {
      tiles: ["https://example.com/{z}/{x}/{y}.png"],
    });
    const lines = options.features.filter((f) => f.kind === "line");
    expect(lines.length).toBe(2);
    expect(lines[0]!.style.color).toBe("#ffffff");
    expect(lines[0]!.style.width).toBe(10);
    expect(lines[0]!.style.borderStroke).toBe("#000000");
    expect(lines[0]!.style.borderWidth).toBe(12);
    expect(lines[1]!.style.color).toBe("#ffffff");
    expect(lines[1]!.style.width).toBe(4);
    expect(lines[1]!.style.borderStroke).toBe("#000000");
    expect(lines[1]!.style.borderWidth).toBe(12);
  });
});

describe("parsePath", () => {
  it("parses full request", () => {
    const path =
      "/map:osm/size:600x150/padding:12/zoom:10.5/center:-122.4,37.77/color:%23ffffff/width:10/line:" +
      samplePolyline +
      "/color:%232563eb/width:4/border:%23000000/borderWidth:8/line:" +
      samplePolyline;

    const result = parsePath(path);
    expect(result.sourceKey).toBe("osm");

    const options = buildOptions(result.commands, source);
    expect(options.size).toEqual({ width: 600, height: 150 });
    expect(options.padding).toBe(12);
    expect(options.zoom).toBe(10.5);
    expect(options.center).toEqual({ lng: -122.4, lat: 37.77 });
    const lines = options.features.filter((f) => f.kind === "line");
    expect(lines.length).toBe(2);
    expect(lines[0]!.style.color).toBe("#ffffff");
    expect(lines[0]!.style.width).toBe(10);
    expect(lines[1]!.style.color).toBe("#2563eb");
    expect(lines[1]!.style.width).toBe(4);
    expect(lines[1]!.style.borderStroke).toBe("#000000");
    expect(lines[1]!.style.borderWidth).toBe(8);
  });

  it("rejects missing source key", () => {
    try {
      parsePath("/map:/size:300x200");
      throw new Error("expected parseMapRequest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(400);
    }
  });

  it("parses pageOverlap command", () => {
    const { commands } = parsePath(`/map:osm/pageOverlap:100/line:${samplePolyline}`);
    const options = buildOptions(commands, source);
    expect(options.pageOverlap).toBe(100);
  });
});

describe("serializePath", () => {
  it("round-trips a path with every command", () => {
    const original =
      `/map:osm` +
      `/size:600x400` +
      `/padding:16` +
      `/zoom:12` +
      `/center:-122.4,37.77` +
      `/color:%23ff0000` +
      `/width:6` +
      `/border:%23000000` +
      `/borderWidth:3` +
      `/line:${samplePolyline}` +
      `/color:%232563eb` +
      `/width:4` +
      `/line:4:${samplePolyline}` +
      `/point:-122.400000,37.770000` +
      `/pageOverlap:80`;
    const { sourceKey, commands } = parsePath(original);
    const serialized = serializePath(sourceKey, commands);
    const { commands: commands2 } = parsePath(serialized);
    const opts1 = buildOptions(commands, source);
    const opts2 = buildOptions(commands2, source);
    expect(opts1).toEqual(opts2);
  });

  it("encodes color values", () => {
    const { sourceKey, commands } = parsePath(`/map:osm/color:%23aabbcc/line:${samplePolyline}`);
    const url = serializePath(sourceKey, commands);
    expect(url).toContain("color:%23aabbcc");
  });

  it("encodes ? in polyline values", () => {
    const { sourceKey, commands } = parsePath(
      `/map:osm/zoom:12/line:4:${encodeURIComponent(polylineWithQuestionMark)}`,
    );
    const url = serializePath(sourceKey, commands);
    expect(url).not.toContain("?");
    // Round-trips correctly
    const { commands: commands2 } = parsePath(url);
    const opts1 = buildOptions(commands, source);
    const opts2 = buildOptions(commands2, source);
    expect(opts1).toEqual(opts2);
  });

  it("includes center with 6 decimal places", () => {
    const { sourceKey, commands } = parsePath("/map:osm/center:-1.23456789,51.98765432");
    const url = serializePath(sourceKey, commands);
    expect(url).toContain("center:-1.234568,51.987654");
  });
});
