import { describe, expect, test } from "vitest";
import { decodePolyline, encodePolyline } from "../src/polyline.js";

const input = [
  [-122.4194, 37.7749],
  [-122.4099, 37.7912],
] as const;

// from polylinedecoder.online
const cases: Array<[string, number]> = [
  ["c|peFf`ejV{dBkz@", 5],
  ["gbr`gAnk{nhFwy^wpQ", 6],
];

describe("polyline", () => {
  test.for(cases)(
    "decodes polyline %s with precision %d",
    ([polyline, precision]) => {
      const decoded = decodePolyline(polyline, precision);
      expect(decoded).toEqual(input);
    },
  );

  test.for(cases)(
    "encodes polyline to %s with precision %d",
    ([polyline, precision]) => {
      const encoded = encodePolyline(input, precision);
      expect(encoded).toEqual(polyline);
    },
  );
});
