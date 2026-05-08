import { describe, expect, it } from "vitest";
import { buildOptions, HttpError, parsePath } from "../src/parser.js";

const samplePolyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

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
      `/map:osm/stroke:%23ffffff/width:10/border:%23000000/borderWidth:12/line:${samplePolyline}/width:4/line:${samplePolyline}`,
    ).commands;

    const options = buildOptions(commands, {
      tiles: ["https://example.com/{z}/{x}/{y}.png"],
    });
    expect(options.lines.length).toBe(2);
    expect(options.lines[0]!.stroke).toBe("#ffffff");
    expect(options.lines[0]!.width).toBe(10);
    expect(options.lines[0]!.borderStroke).toBe("#000000");
    expect(options.lines[0]!.borderWidth).toBe(12);
    expect(options.lines[1]!.stroke).toBe("#ffffff");
    expect(options.lines[1]!.width).toBe(4);
    expect(options.lines[1]!.borderStroke).toBe("#000000");
    expect(options.lines[1]!.borderWidth).toBe(12);
  });
});

describe("parsePath", () => {
  it("parses full request", () => {
    const path =
      "/map:osm/size:600x150/padding:12/zoom:10.5/center:-122.4,37.77/stroke:%23ffffff/width:10/line:" +
      samplePolyline +
      "/stroke:%232563eb/width:4/border:%23000000/borderWidth:8/line:" +
      samplePolyline;

    const result = parsePath(path);
    expect(result.sourceKey).toBe("osm");

    const options = buildOptions(result.commands, source);
    expect(options.size).toEqual({ width: 600, height: 150 });
    expect(options.padding).toBe(12);
    expect(options.zoom).toBe(10.5);
    expect(options.center).toEqual({ lng: -122.4, lat: 37.77 });
    expect(options.lines.length).toBe(2);
    expect(options.lines[0]!.stroke).toBe("#ffffff");
    expect(options.lines[0]!.width).toBe(10);
    expect(options.lines[1]!.stroke).toBe("#2563eb");
    expect(options.lines[1]!.width).toBe(4);
    expect(options.lines[1]!.borderStroke).toBe("#000000");
    expect(options.lines[1]!.borderWidth).toBe(8);
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
});
