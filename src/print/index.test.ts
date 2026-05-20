import path from "path";
import { describe, expect, it } from "vitest";
import { renderPrintPdf } from "./index.js";
import { HttpError } from "../errors.js";
import type { Source } from "../staticmap.js";
import { mockTileFetch } from "../test-helpers/tile-mock.js";
import { assertPDFSnapshot } from "../test-helpers/snapshots.js";

// SF to LA, roughly north-south
const sfToLa = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

// Two-page OS route
const twoPageRoute =
  "miv{IrbzUj@}AjAyAfAg@^GRUX?N[VIf@y@n@WFWjAcAjC_EdE{IxC}FpAaEZ_CvDyH`DyCjC{Av@eBXEhFuK~@q@Z}BtEgHhGmGdJ_HvCkAxFqBzALbfAtv@tcAqEeEscBmpBdYgKf@aXmOcB_DcCaFyIqJ";

const osSource: Source = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
  crs: "EPSG:27700",
  attribution: "© Crown copyright and database rights 2026",
};

const source: Source = {
  tiles: ["https://tiles.example.com/{z}/{x}/{y}.png"],
  tileSize: 256,
};

mockTileFetch();

const snapshotDir = path.resolve(
  import.meta.dirname,
  "__snapshots__",
  "index.test.ts",
);

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

  it("renders two-page OS route", async () => {
    const pdf = await renderPrintPdf(
      { map: `/map:os/zoom:8/line:${twoPageRoute}`, style: "os" },
      osSource,
      "os",
    );
    assertPDFSnapshot(snapshotDir, "two-page-os", pdf);
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
