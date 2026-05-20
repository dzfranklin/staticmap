import path from "path";
import { describe, it } from "vitest";
import { drawFooter, type DrawFooterOpts } from "./footer.js";

import { assertPDFRegionSnapshot } from "../test-helpers/snapshots.js";

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

const defaultOpts: DrawFooterOpts = {
  title: "My Map",
  pageNum: 1,
  total: 1,
  attribution: undefined,
  neighbors: {},
  footerW,
  footerH,
};
const opts = (overrides: Partial<DrawFooterOpts>): DrawFooterOpts => ({
  ...defaultOpts,
  ...overrides,
});

describe("drawFooter", () => {
  it("renders title and page number", () =>
    assertPDFRegionSnapshot(
      snapshotDir,
      "footer-simple",
      (doc) => {
        drawFooter(doc, opts({}));
      },
      footerW,
      footerH,
    ));

  it("renders with attribution", () =>
    assertPDFRegionSnapshot(
      snapshotDir,
      "footer-attribution",
      (doc) => {
        drawFooter(
          doc,
          opts({ attribution: "© Crown copyright and database rights 2026" }),
        );
      },
      footerW,
      footerH,
    ));

  it("renders with neighbours", () =>
    assertPDFRegionSnapshot(
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
      footerW,
      footerH,
    ));

  it("renders with partial neighbours", () =>
    assertPDFRegionSnapshot(
      snapshotDir,
      "footer-partial-neighbours",
      (doc) => {
        drawFooter(
          doc,
          opts({ pageNum: 2, total: 4, neighbors: { right: 3, bottom: 4 } }),
        );
      },
      footerW,
      footerH,
    ));
});
