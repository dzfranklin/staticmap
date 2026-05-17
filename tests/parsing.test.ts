import { describe, expect, it } from "vitest";
import { buildOptions, parsePath, serializePath } from "../src/parser.js";
import {
  ALL_COMMANDS,
  CenterCommand,
  DebugCommand,
  LabelCommand,
  LineCommand,
  PaddingCommand,
  PageOverlapCommand,
  PointCommand,
  SizeCommand,
  STYLE_COMMANDS,
  StyleCommand,
  ZoomCommand,
} from "../src/commands/index.js";
import { HttpError } from "../src/errors.js";
import type { Options, Feature } from "../src/staticmap.js";

const sampleLine = "_p~iF~ps|U_ulLnnqC"; // encodes two points

const source = {
  tiles: ["https://example.com/{z}/{x}/{y}.png"],
};

// # Helpers

function parse(path: string): Options {
  const { sourceKey, commands } = parsePath(path);
  return buildOptions(commands, { ...source, attribution: sourceKey });
}

function line(opts: Options, index = 0) {
  return opts.features.filter((f) => f.kind === "line")[index] as Extract<
    Feature,
    { kind: "line" }
  >;
}

function point(opts: Options, index = 0) {
  return opts.features.filter((f) => f.kind === "point")[index] as Extract<
    Feature,
    { kind: "point" }
  >;
}

describe("style commands", () => {
  describe("cap", () => {
    const cases: Array<[string, CanvasLineCap]> = [
      [`/map:osm/cap:butt/line:${sampleLine}`, "butt"],
      [`/map:osm/cap:square/line:${sampleLine}`, "square"],
      [`/map:osm/cap:round/line:${sampleLine}`, "round"],
    ];
    it.each(cases)("%s → lineCap=%s", (path, expected) => {
      expect(line(parse(path)).style.lineCap).toBe(expected);
    });

    it("rejects invalid value", () => {
      expect(() => parse(`/map:osm/cap:diagonal/line:${sampleLine}`)).toThrow(
        HttpError,
      );
    });
  });

  describe("join", () => {
    const cases: Array<[string, CanvasLineJoin]> = [
      [`/map:osm/join:bevel/line:${sampleLine}`, "bevel"],
      [`/map:osm/join:miter/line:${sampleLine}`, "miter"],
      [`/map:osm/join:round/line:${sampleLine}`, "round"],
    ];
    it.each(cases)("%s → lineJoin=%s", (path, expected) => {
      expect(line(parse(path)).style.lineJoin).toBe(expected);
    });

    it("rejects invalid value", () => {
      expect(() => parse(`/map:osm/join:diagonal/line:${sampleLine}`)).toThrow(
        HttpError,
      );
    });
  });

  describe("borderWidth", () => {
    const cases: Array<[string, number | undefined]> = [
      [`/map:osm/borderWidth:4/line:${sampleLine}`, 4],
      [`/map:osm/borderWidth:0/line:${sampleLine}`, undefined],
    ];
    it.each(cases)("%s → borderWidth=%s", (path, expected) => {
      expect(line(parse(path)).style.borderWidth).toBe(expected);
    });
  });

  describe("lineDasharray / dash", () => {
    it("sets dasharray and switches lineCap from round to butt", () => {
      const opts = parse(`/map:osm/lineDasharray:5:10/line:${sampleLine}`);
      expect(line(opts).style.lineDasharray).toEqual([5, 10]);
      expect(line(opts).style.lineCap).toBe("butt");
    });

    it("does not override cap:square — only flips round to butt", () => {
      // applyStyle: `if (style.lineCap === "round") style.lineCap = "butt"`
      // so an explicit cap:square is preserved
      const opts = parse(
        `/map:osm/cap:square/lineDasharray:5:10/line:${sampleLine}`,
      );
      expect(line(opts).style.lineCap).toBe("square");
    });

    it("accepts dash alias", () => {
      const opts = parse(`/map:osm/dash:5:10:5/line:${sampleLine}`);
      expect(line(opts).style.lineDasharray).toEqual([5, 10, 5]);
    });

    it("rejects non-positive values", () => {
      expect(() => parse(`/map:osm/dash:-1:5/line:${sampleLine}`)).toThrow(
        HttpError,
      );
      expect(() => parse(`/map:osm/dash:0:5/line:${sampleLine}`)).toThrow(
        HttpError,
      );
    });
  });

  describe("labelSize", () => {
    it("sets labelSize on point style", () => {
      const opts = parse(`/map:osm/labelSize:24/label:X/point:-1:51`);
      expect(point(opts).style.labelSize).toBe(24);
    });
  });
});

describe("feature commands", () => {
  describe("point", () => {
    it("parses longitude and latitude arguments", () => {
      const opts = parse(`/map:osm/point:-1.12345:51.98765`);
      expect(point(opts)).toEqual(
        expect.objectContaining({
          lng: -1.12345,
          lat: 51.98765,
        }),
      );
    });

    it("captures style snapshot at the time of the command", () => {
      const opts = parse(
        `/map:osm/color:%23ff0000/point:-1:51/color:%230000ff/point:-2:52`,
      );
      expect(point(opts, 0).style.color).toBe("#ff0000");
      expect(point(opts, 1).style.color).toBe("#0000ff");
    });
  });

  describe("line", () => {
    it("captures style snapshot at the time of the command", () => {
      const opts = parse(
        `/map:osm/color:%23ff0000/line:${sampleLine}/color:%230000ff/line:${sampleLine}`,
      );
      expect(line(opts, 0).style.color).toBe("#ff0000");
      expect(line(opts, 1).style.color).toBe("#0000ff");
    });

    it("rejects a polyline with fewer than two points", () => {
      expect(() => parse(`/map:osm/line:_p~iF~ps|U`)).toThrow(HttpError);
    });

    it("accepts optional precision argument", () => {
      // At precision 5 the same encoded string decodes differently — just verify
      // it parses without error and produces a line
      const opts = parse(`/map:osm/line:5:${sampleLine}`);
      expect(line(opts).kind).toBe("line");
    });

    it("rejects invalid precision argument", () => {
      expect(() => parse(`/map:osm/line:notanumber:${sampleLine}`)).toThrow(
        HttpError,
      );
    });

    it("rejects zero parts after command name", () => {
      // "line" with no colon-parts at all is caught by the wrong-arg-count check
      expect(() => parsePath(`/map:osm/line`)).toThrow(HttpError);
    });

    it("decodes default precision", () => {
      // encoded using polylinedecoder.online, precision=5
      const opts = parse(`/map:osm/line:_pffK_nqsB_pR_pR`);
      expect(line(opts).path).toEqual([
        [19.1, 64.1],
        [19.2, 64.2],
      ]);
    });

    it("decodes precision 5", () => {
      // encoded using polylinedecoder.online, precision=5
      const opts = parse(`/map:osm/line:5:_pffK_nqsB_pR_pR`);
      expect(line(opts).path).toEqual([
        [19.1, 64.1],
        [19.2, 64.2],
      ]);
    });

    it("decodes precision 6", () => {
      // encoded using polylinedecoder.online, precision=6
      const opts = parse(`/map:osm/line:6:_ijgyB_uwlc@_ibE_ibE`);
      expect(line(opts).path).toEqual([
        [19.1, 64.1],
        [19.2, 64.2],
      ]);
    });
  });

  describe("label", () => {
    it("applies to the next point only and clears after", () => {
      const opts = parse(
        `/map:osm/label:A/labelColor:%23ff0000/point:-1:51/point:-2:52`,
      );
      const points = opts.features.filter((f) => f.kind === "point");
      expect(points[0]!.label).toBe("A");
      expect(points[0]!.style.labelColor).toBe("#ff0000");
      expect(points[1]!.label).toBeUndefined();
    });

    it("applies labelHaloWidth and labelHaloColor to point style", () => {
      const opts = parse(
        `/map:osm/labelHaloWidth:3/labelHaloColor:%23ffffff/label:X/point:-1:51`,
      );
      expect(point(opts).style.labelHaloWidth).toBe(3);
      expect(point(opts).style.labelHaloColor).toBe("#ffffff");
    });

    it("applies labelAnchor and labelOffset to point style", () => {
      const opts = parse(
        `/map:osm/labelAnchor:right/labelOffset:10/label:X/point:-1:51`,
      );
      expect(point(opts).style.labelAnchor).toBe("right");
      expect(point(opts).style.labelOffset).toBe(10);
    });

    it("rejects invalid labelAnchor", () => {
      expect(() => parse(`/map:osm/labelAnchor:diagonal`)).toThrow(HttpError);
    });

    it("round-trips label, labelColor, labelAnchor, labelOffset, labelHaloWidth, labelHaloColor", () => {
      const original = `/map:osm/label:Hello/labelColor:%23ff0000/labelAnchor:top-right/labelOffset:8/labelHaloWidth:2/labelHaloColor:%23ffffff/point:-1.000000:51.000000`;
      const { sourceKey, commands } = parsePath(original);
      const { commands: commands2 } = parsePath(
        serializePath(sourceKey, commands),
      );
      expect(buildOptions(commands, source)).toEqual(
        buildOptions(commands2, source),
      );
    });
  });
});

describe("global commands", () => {
  describe("size", () => {
    const cases: Array<[string, { width: number; height: number }]> = [
      [`/map:osm/size:800:600/line:${sampleLine}`, { width: 800, height: 600 }],
      [`/map:osm/size:1:1/line:${sampleLine}`, { width: 1, height: 1 }],
    ];
    it.each(cases)("%s → size=%j", (path, expected) => {
      expect(parse(path).size).toEqual(expected);
    });
  });

  describe("zoom", () => {
    it("sets fractional zoom", () => {
      expect(parse(`/map:osm/zoom:10.5/line:${sampleLine}`).zoom).toBe(10.5);
    });
  });

  describe("center", () => {
    it("parses longitude and latitude arguments", () => {
      const opts = parse(
        `/map:osm/center:-1.12345:51.98765/line:${sampleLine}`,
      );
      expect(opts.center).toEqual({ lng: -1.12345, lat: 51.98765 });
    });
  });

  describe("padding", () => {
    it("sets padding", () => {
      expect(parse(`/map:osm/padding:12/line:${sampleLine}`).padding).toBe(12);
    });
  });

  describe("pageOverlap", () => {
    it("sets pageOverlap", () => {
      const opts = parse(`/map:osm/pageOverlap:100/line:${sampleLine}`);
      expect(opts.pageOverlap).toBe(100);
    });
  });

  describe("debug", () => {
    it("defaults to false", () => {
      expect(parse(`/map:osm/line:${sampleLine}`).debug).toBe(false);
    });

    it("sets debug to true", () => {
      expect(parse(`/map:osm/debug/line:${sampleLine}`).debug).toBe(true);
    });
  });
});

// # Path parsing

const sampleLongLine = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const polylineWithQuestionMark = "_a~Ca@fyiAdDC~@bAtBqHv@?~HgSnD";

describe("parsePath", () => {
  it("parses sourceKey and command list", () => {
    const result = parsePath("/map:osm/size:600:150/width:4");
    expect(result.sourceKey).toBe("osm");
    expect(result.commands.length).toBe(2);
  });

  it("rejects unknown command", () => {
    expect(() => parsePath("/map:osm/bogus:1")).toThrow(HttpError);
  });

  it("rejects missing source key", () => {
    expect(() => parsePath("/map:/size:300:200")).toThrow(HttpError);
  });

  it("formats parse errors with command name and argument info", () => {
    expect(() =>
      parsePath(`/map:osm/dash:"string"/line:${sampleLongLine}`),
    ).toThrow(
      /Parse error in command "dash": Invalid value for argument 0 \(values\): /,
    );
  });

  it("parses a full multi-command path", () => {
    const opts = parse(
      `/map:osm/size:600:150/padding:12/zoom:10.5/center:-122.4:37.77` +
        `/color:%23ffffff/width:10/line:${sampleLongLine}` +
        `/color:%232563eb/width:4/border:%23000000/borderWidth:8/line:${sampleLongLine}`,
    );
    expect(opts.size).toEqual({ width: 600, height: 150 });
    expect(opts.padding).toBe(12);
    expect(opts.zoom).toBe(10.5);
    expect(opts.center).toEqual({ lng: -122.4, lat: 37.77 });
    expect(opts.features.filter((f) => f.kind === "line").length).toBe(2);
    expect(line(opts, 0).style.color).toBe("#ffffff");
    expect(line(opts, 0).style.width).toBe(10);
    expect(line(opts, 1).style.color).toBe("#2563eb");
    expect(line(opts, 1).style.width).toBe(4);
    expect(line(opts, 1).style.borderColor).toBe("#000000");
    expect(line(opts, 1).style.borderWidth).toBe(8);
  });

  it("carries style state forward across line commands", () => {
    const opts = parse(
      `/map:osm/color:%23ffffff/width:10/border:%23000000/borderWidth:12/line:${sampleLongLine}/width:4/line:${sampleLongLine}`,
    );
    expect(line(opts, 0).style.color).toBe("#ffffff");
    expect(line(opts, 0).style.width).toBe(10);
    expect(line(opts, 0).style.borderColor).toBe("#000000");
    expect(line(opts, 0).style.borderWidth).toBe(12);
    expect(line(opts, 1).style.color).toBe("#ffffff");
    expect(line(opts, 1).style.width).toBe(4);
    expect(line(opts, 1).style.borderColor).toBe("#000000");
    expect(line(opts, 1).style.borderWidth).toBe(12);
  });
});

// # Serialization

describe("serializePath", () => {
  it("round-trips commands", () => {
    const originalCommands = [
      // globals
      new SizeCommand({ width: 600, height: 150 }),
      new PaddingCommand({ value: 12 }),
      new ZoomCommand({ value: 10.5 }),
      new CenterCommand({ lng: -122.4, lat: 37.77 }),
      new PageOverlapCommand({ value: 50 }),
      new DebugCommand({}),
      // styles
      ...STYLE_COMMANDS.map((Cls) => Cls.default()),
      // features
      new LineCommand({ value: sampleLine }),
      new LabelCommand({ value: "A" }),
      new PointCommand({ lng: -1, lat: 51 }),
    ];
    const serialized = serializePath("osm", originalCommands);

    const { commands: parsedCommands } = parsePath(serialized);
    const reserialized = serializePath("osm", parsedCommands);

    expect(reserialized).toBe(serialized);
  });

  it("percent-encodes # in color values", () => {
    const { sourceKey, commands } = parsePath(
      `/map:osm/color:%23aabbcc/line:${sampleLongLine}`,
    );
    expect(serializePath(sourceKey, commands)).toContain("color:%23aabbcc");
  });

  it("percent-encodes ? in polyline values", () => {
    const { sourceKey, commands } = parsePath(
      `/map:osm/zoom:12/line:4:${encodeURIComponent(polylineWithQuestionMark)}`,
    );
    const url = serializePath(sourceKey, commands);
    expect(url).not.toContain("?");
    const { commands: commands2 } = parsePath(url);
    expect(buildOptions(commands, source)).toEqual(
      buildOptions(commands2, source),
    );
  });

  it("round-trips center coordinates at full precision", () => {
    const { sourceKey, commands } = parsePath(
      "/map:osm/center:-1.23456789:51.98765432",
    );
    const { commands: commands2 } = parsePath(
      serializePath(sourceKey, commands),
    );
    expect(buildOptions(commands, source).center).toEqual(
      buildOptions(commands2, source).center,
    );
  });

  it("serializes border alias as border not borderColor", () => {
    const { sourceKey, commands } = parsePath(
      `/map:osm/border:%23ff0000/line:${sampleLongLine}`,
    );
    const url = serializePath(sourceKey, commands);
    expect(url).toContain("border:%23ff0000");
    expect(url).not.toContain("borderColor:");
  });

  it("serializes borderColor canonical name", () => {
    const { sourceKey, commands } = parsePath(
      `/map:osm/borderColor:%23ff0000/line:${sampleLongLine}`,
    );
    expect(serializePath(sourceKey, commands)).toContain(
      "borderColor:%23ff0000",
    );
  });

  it("round-trips dash alias with colon-delimited values", () => {
    const { sourceKey, commands } = parsePath(
      `/map:osm/dash:5:10:5/line:${sampleLongLine}`,
    );
    const url = serializePath(sourceKey, commands);
    expect(url).toContain("dash:5:10:5");
    const { commands: commands2 } = parsePath(url);
    expect(buildOptions(commands, source)).toEqual(
      buildOptions(commands2, source),
    );
  });

  it("serializes lineDasharray canonical name", () => {
    const { sourceKey, commands } = parsePath(
      `/map:osm/lineDasharray:5:10/line:${sampleLongLine}`,
    );
    expect(serializePath(sourceKey, commands)).toContain("lineDasharray:5:10");
  });
});
