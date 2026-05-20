import path from "path";
import { describe, it } from "vitest";
import { computeEdgeTicks, drawScaleBarH, drawScaleBarV } from "./edge.js";
import { assertPDFRegionSnapshot } from "../test-helpers/snapshots.js";

const snapshotDir = path.resolve(
  import.meta.dirname,
  "__snapshots__",
  "edge.test.ts",
);

const EDGE_MM = 2.7;
const SCALE_BOX_MM = 1.5;
const EDGE_GAP_MM = 0.5;
const MARGIN_MM = 10;
const FOOTER_MM = 10;
const A4_W_MM = 210;
const A4_H_MM = 297;
const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

const edgeTotalMm = EDGE_MM + SCALE_BOX_MM + EDGE_GAP_MM;
const imgWMm = A4_W_MM - 2 * (MARGIN_MM + edgeTotalMm);
const imgHMm = A4_H_MM - 2 * (MARGIN_MM + edgeTotalMm) - FOOTER_MM;

// Realistic EPSG:27700 bounds: OS Explorer scale gives ~2km E × ~3km N per A4 page
const londonBounds = {
  crs: "EPSG:27700",
  minX: 530000,
  maxX: 532000,
  minY: 179000,
  maxY: 182000,
};

const ticks = computeEdgeTicks(londonBounds, imgWMm, imgHMm);

const barHW = mm(imgWMm);
const barHH = mm(2 * edgeTotalMm);
const barVW = mm(2 * edgeTotalMm);
const barVH = mm(imgHMm);

describe("drawScaleBarH", () => {
  it("renders top scale bar", () =>
    assertPDFRegionSnapshot(
      snapshotDir,
      "scale-bar-h-top",
      (doc) => {
        drawScaleBarH(
          doc,
          ticks.top,
          "top",
          EDGE_MM,
          SCALE_BOX_MM,
          EDGE_GAP_MM,
        );
      },
      barHW,
      barHH,
    ));

  it("renders bottom scale bar", () =>
    assertPDFRegionSnapshot(
      snapshotDir,
      "scale-bar-h-bottom",
      (doc) => {
        drawScaleBarH(
          doc,
          ticks.bottom,
          "bottom",
          EDGE_MM,
          SCALE_BOX_MM,
          EDGE_GAP_MM,
        );
      },
      barHW,
      barHH,
    ));
});

describe("drawScaleBarV", () => {
  it("renders left scale bar", () =>
    assertPDFRegionSnapshot(
      snapshotDir,
      "scale-bar-v-left",
      (doc) => {
        drawScaleBarV(
          doc,
          ticks.left,
          "left",
          EDGE_MM,
          SCALE_BOX_MM,
          EDGE_GAP_MM,
        );
      },
      barVW,
      barVH,
    ));

  it("renders right scale bar", () =>
    assertPDFRegionSnapshot(
      snapshotDir,
      "scale-bar-v-right",
      (doc) => {
        drawScaleBarV(
          doc,
          ticks.right,
          "right",
          EDGE_MM,
          SCALE_BOX_MM,
          EDGE_GAP_MM,
        );
      },
      barVW,
      barVH,
    ));
});
