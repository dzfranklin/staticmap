import path from "path";
import { describe, it } from "vitest";
import { drawFooter, FOOTER_H_MM, type DrawFooterOpts } from "./footer.js";

import { assertPDFRegionSnapshot } from "../test-helpers/snapshots.js";
import { mm } from "./util.js";

const snapshotDir = path.resolve(
  import.meta.dirname,
  "__snapshots__",
  "footer.test.ts",
);

// approx A4
const PAGE_W_MM = 210 - 20;

const footerW = mm(PAGE_W_MM);
const footerH = mm(FOOTER_H_MM);

const defaultOpts: DrawFooterOpts = {
  title: "My medium length map title",
  pageNum: 1,
  total: 1,
  attribution: "Contains OS data © Crown copyright and database rights 2026",
  neighbors: {},
  footerW,
  footerH,
};
const opts = (overrides: Partial<DrawFooterOpts>): DrawFooterOpts => ({
  ...defaultOpts,
  ...overrides,
});

describe("drawFooter", () => {
  it("renders without neighbors", async () =>
    await assertPDFRegionSnapshot(
      snapshotDir,
      "footer-without-neighbors",
      (doc) => {
        drawFooter(doc, opts({}));
      },
      footerW,
      footerH,
    ));

  it("renders with neighbors", async () =>
    await assertPDFRegionSnapshot(
      snapshotDir,
      "footer-neighbors",
      (doc) => {
        drawFooter(
          doc,
          opts({
            pageNum: 11,
            total: 13,
            neighbors: { top: 9, left: 10, right: 12, bottom: 13 },
          }),
        );
      },
      footerW,
      footerH,
    ));

  it("renders with partial neighbors", async () =>
    await assertPDFRegionSnapshot(
      snapshotDir,
      "footer-partial-neighbors",
      (doc) => {
        drawFooter(
          doc,
          opts({ pageNum: 2, total: 4, neighbors: { right: 3, bottom: 4 } }),
        );
      },
      footerW,
      footerH,
    ));

  it("renders overflow", async () => {
    await assertPDFRegionSnapshot(
      snapshotDir,
      "footer-overflow",
      (doc) => {
        drawFooter(
          doc,
          opts({
            title:
              "A very very very very very very long title that should overflow and be truncated with an ellipsis",
            attribution:
              "An excessively excessively excessively excessively excessively excessively excessively excessively excessively long attribution that should also be truncated with an ellipsis to fit within the footer area",
            pageNum: 1000,
            total: 1000,
            neighbors: { top: 999, left: 998, right: 997, bottom: 996 },
          }),
        );
      },
      footerW,
      footerH,
    );
  });
});
