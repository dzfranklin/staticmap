import path from "path";
import { describe, it } from "vitest";
import { drawFooter, type DrawFooterOpts } from "./footer.js";

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

const footerW = mm(A4_W_MM - 2 * MARGIN_MM);
const footerH = mm(FOOTER_MM);
const pageWMm = A4_W_MM;
const pageHMm = FOOTER_MM + 2 * MARGIN_MM;

const defaultOpts: DrawFooterOpts = {
  title: "My Map",
  pageNum: 1,
  total: 1,
  attribution: undefined,
  neighbors: {},
  footerX: 0,
  footerY: 0,
  footerW,
  footerH,
};
const opts = (overrides: Partial<DrawFooterOpts>): DrawFooterOpts => ({
  ...defaultOpts,
  ...overrides,
});

describe("drawFooter", () => {
  it("renders title and page number", () =>
    assertPDFPageSnapshot(
      snapshotDir,
      "footer-simple",
      (doc) => {
        drawFooter(doc, opts({}));
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
          opts({ attribution: "© Crown copyright and database rights 2026" }),
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
          opts({
            pageNum: 3,
            total: 6,
            attribution: "© Crown copyright and database rights 2026",
            neighbors: { top: 1, left: 2, right: 4, bottom: 5 },
          }),
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
          opts({ pageNum: 2, total: 4, neighbors: { right: 3, bottom: 4 } }),
        );
      },
      pageWMm,
      pageHMm,
    ));
});
