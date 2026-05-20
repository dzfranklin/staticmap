import path from "path";
import { describe, it } from "vitest";
import { drawFooter } from "./footer.js";

import { assertPDFPageSnapshot } from "../test-helpers/snapshots.js";

const snapshotDir = path.resolve(
  import.meta.dirname,
  "__snapshots__",
  "footer.test.ts",
);

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

const A4_W_MM = 210;
const MARGIN_MM = 10;
const FOOTER_MM = 10;

const footerX = mm(MARGIN_MM);
const footerY = mm(MARGIN_MM);
const footerW = mm(A4_W_MM - 2 * MARGIN_MM);
const footerH = mm(FOOTER_MM);
const pageWMm = A4_W_MM;
const pageHMm = FOOTER_MM + 2 * MARGIN_MM;

describe("drawFooter", () => {
  it("renders title and page number", () =>
    assertPDFPageSnapshot(
      snapshotDir,
      "footer-simple",
      (doc) => {
        drawFooter(
          doc,
          "My Map",
          1,
          1,
          undefined,
          {},
          footerX,
          footerY,
          footerW,
          footerH,
        );
      },
      pageWMm,
      pageHMm,
    ));

  it("renders with attribution", () =>
    assertPDFPageSnapshot(
      snapshotDir,
      "footer-attribution",
      (doc) => {
        drawFooter(
          doc,
          "My Map",
          1,
          1,
          "© Crown copyright and database rights 2026",
          {},
          footerX,
          footerY,
          footerW,
          footerH,
        );
      },
      pageWMm,
      pageHMm,
    ));

  it("renders with neighbours", () =>
    assertPDFPageSnapshot(
      snapshotDir,
      "footer-neighbours",
      (doc) => {
        drawFooter(
          doc,
          "My Map",
          3,
          6,
          "© Crown copyright and database rights 2026",
          { top: 1, left: 2, right: 4, bottom: 5 },
          footerX,
          footerY,
          footerW,
          footerH,
        );
      },
      pageWMm,
      pageHMm,
    ));

  it("renders with partial neighbours", () =>
    assertPDFPageSnapshot(
      snapshotDir,
      "footer-partial-neighbours",
      (doc) => {
        drawFooter(
          doc,
          "My Map",
          2,
          4,
          undefined,
          { right: 3, bottom: 4 },
          footerX,
          footerY,
          footerW,
          footerH,
        );
      },
      pageWMm,
      pageHMm,
    ));
});
