import path from "path";
import { describe, it } from "vitest";
import {
  computeEdgeTicks,
  drawScaleBarH,
  drawScaleBarV,
  EDGE_V_WIDTH_MM,
  EDGE_H_HEIGHT_MM,
} from "./edge.js";
import { assertPDFRegionSnapshot } from "../test-helpers/snapshots.js";
import { mm } from "./util.js";

const snapshotDir = path.resolve(
  import.meta.dirname,
  "__snapshots__",
  "edge.test.ts",
);

// approx A4
const PAGE_W_MM = 210 - 20;
const PAGE_H_MM = 297 - 20;

const londonBounds = {
  crs: "EPSG:27700",
  minX: 530042,
  maxX: 532042,
  minY: 179060,
  maxY: 182060,
};

const ticks = computeEdgeTicks(londonBounds, PAGE_W_MM, PAGE_H_MM);

const barHW = mm(PAGE_W_MM);
const barHH = mm(EDGE_H_HEIGHT_MM);
const barVW = mm(EDGE_V_WIDTH_MM);
const barVH = mm(PAGE_H_MM);

describe("drawScaleBarH", () => {
  it("renders top scale bar", async () =>
    await assertPDFRegionSnapshot(
      snapshotDir,
      "scale-bar-h-top",
      (doc) => {
        drawScaleBarH(doc, ticks.top, "top");
      },
      barHW,
      barHH,
    ));

  it("renders bottom scale bar", async () =>
    await assertPDFRegionSnapshot(
      snapshotDir,
      "scale-bar-h-bottom",
      (doc) => {
        drawScaleBarH(doc, ticks.bottom, "bottom");
      },
      barHW,
      barHH,
    ));
});

describe("drawScaleBarV", () => {
  it("renders left scale bar", async () =>
    await assertPDFRegionSnapshot(
      snapshotDir,
      "scale-bar-v-left",
      (doc) => {
        drawScaleBarV(doc, ticks.left, "left");
      },
      barVW,
      barVH,
    ));

  it("renders right scale bar", async () =>
    await assertPDFRegionSnapshot(
      snapshotDir,
      "scale-bar-v-right",
      (doc) => {
        drawScaleBarV(doc, ticks.right, "right");
      },
      barVW,
      barVH,
    ));
});
