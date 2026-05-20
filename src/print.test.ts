import { describe, expect, it } from "vitest";
import { renderPrintPdf } from "./print.js";
import { HttpError } from "./errors.js";
import type { Source } from "./staticmap.js";
import { mockTileFetch } from "./test-helpers/tile-mock.js";

// SF to LA, roughly north-south
const sfToLa = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

const source: Source = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
};

mockTileFetch();

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
