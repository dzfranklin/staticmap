import type { PageTile } from "./pagination.js";
import { fontCapHeight, type Doc, mm } from "./util.js";

export interface Tick {
  major: boolean;
  offsetMm: number;
  spanMm: number;
  filled: boolean;
  labelPrefix?: string;
  labelMain?: string;
}

export interface EdgeTicks {
  top: Tick[];
  bottom: Tick[];
  left: Tick[];
  right: Tick[];
}

const LABELS_H_HEIGHT_MM = 3.5;
const LABELS_V_WIDTH_MM = 5.5;
const SCALE_BOX_MM = 1.5;
const EDGE_GAP_MM = 1;
export const EDGE_H_HEIGHT_MM = LABELS_H_HEIGHT_MM + SCALE_BOX_MM + EDGE_GAP_MM;
export const EDGE_V_WIDTH_MM = LABELS_V_WIDTH_MM + SCALE_BOX_MM + EDGE_GAP_MM;

const SCALE_COLOR = "#06aeee";
const STROKE_W = mm(0.3);

function gridCrossings(minM: number, maxM: number): number[] {
  const first = Math.ceil(minM / 100) * 100;
  const result: number[] = [];
  for (let v = first; v <= maxM; v += 100) result.push(v);
  return result;
}

function labelParts(
  valueM: number,
  prevValueM: number | null,
): { prefix: string; main: string } {
  const hundredKm = Math.floor(valueM / 100000);
  const kmInSquare = Math.floor((valueM % 100000) / 1000);
  const main = String(kmInSquare).padStart(2, "0");
  const showPrefix =
    prevValueM === null || Math.floor(prevValueM / 100000) !== hundredKm;
  return { prefix: showPrefix ? String(hundredKm) : "", main };
}

function buildTicks(valuesM: number[], toMm: (v: number) => number): Tick[] {
  let prevKm: number | null = null;
  const ticks: Tick[] = [];
  for (let i = 0; i < valuesM.length; i++) {
    const v = valuesM[i]!;
    const isLast = i + 1 >= valuesM.length;
    // Drop the last segment: it spans to the image edge rather than the next
    // grid crossing, making it a partial segment of unknown width.
    if (isLast) break;
    const major = v % 1000 === 0;
    const offset = toMm(v);
    const nextOffset = toMm(valuesM[i + 1]!);
    const tick: Tick = {
      major,
      offsetMm: offset,
      spanMm: nextOffset - offset,
      filled: Math.floor(v / 100) % 2 === 0,
    };
    if (major) {
      const { prefix, main } = labelParts(v, prevKm);
      tick.labelPrefix = prefix;
      tick.labelMain = main;
      prevKm = v;
    }
    ticks.push(tick);
  }
  return ticks;
}

export function computeEdgeTicks(
  nativeBounds: NonNullable<PageTile["nativeBounds"]>,
  imgWMm: number,
  imgHMm: number,
): EdgeTicks {
  const { minX: eMin, maxX: eMax, minY: nMin, maxY: nMax } = nativeBounds;
  const eSpan = eMax - eMin;
  const nSpan = nMax - nMin;
  const eToMm = (e: number) => ((e - eMin) / eSpan) * imgWMm;
  const nToMm = (n: number) => ((nMax - n) / nSpan) * imgHMm;
  const eVals = gridCrossings(eMin, eMax);
  const nValsDesc = gridCrossings(nMin, nMax).reverse();
  return {
    top: buildTicks(eVals, eToMm),
    bottom: buildTicks(eVals, eToMm),
    left: buildTicks(nValsDesc, nToMm),
    right: buildTicks(nValsDesc, nToMm),
  };
}

/** Draw label horizontally centered around x0
 * Label anchor is the corresponding bar point closest to the label
 */
function drawGridLabel(
  doc: Doc,
  prefix: string | undefined,
  main: string,
  side: "top" | "bottom" | "left" | "right",
  anchorX: number,
  anchorY: number,
) {
  doc.save();

  doc.font("SS3-Bold").fillColor(SCALE_COLOR);

  const edgePad = mm(0.8);
  const targetCapHeight = mm(LABELS_H_HEIGHT_MM) - edgePad * 2;

  // Compute font size to achieve target cap height
  doc.fontSize(targetCapHeight);
  const fsMain = (targetCapHeight / fontCapHeight(doc)) * targetCapHeight;
  const fsPrefix = fsMain * 0.8;

  // Measure text

  let prefixW = 0;
  doc.fontSize(fsPrefix);
  const prefixCapH = fontCapHeight(doc);
  if (prefix) prefixW = doc.widthOfString(prefix);

  doc.fontSize(fsMain);
  const mainW = doc.widthOfString(main);
  const mainCapH = fontCapHeight(doc);

  const totalW = prefixW + mainW;

  // Draw text

  if (side === "top" || side === "bottom") {
    let x = anchorX - totalW / 2;
    let y = side === "top" ? anchorY - edgePad : anchorY + edgePad + mainCapH;

    if (prefix) {
      doc.fontSize(fsPrefix);
      doc.text(prefix, x, y, { baseline: "alphabetic" });
      x += prefixW;
    }

    doc.fontSize(fsMain);
    doc.text(main, x, y, { baseline: "alphabetic" });
  } else {
    let x = side === "left" ? anchorX - totalW - edgePad : anchorX + edgePad;
    let y = anchorY;

    if (prefix) {
      doc.fontSize(fsPrefix);
      doc.text(prefix, x, y + prefixCapH / 2, {
        baseline: "alphabetic",
      });
      x += prefixW;
    }

    doc.fontSize(fsMain);
    doc.text(main, x, y, { baseline: "middle" });
  }

  doc.restore();
}

export function drawScaleBarH(doc: Doc, ticks: Tick[], side: "top" | "bottom") {
  const boxH = mm(SCALE_BOX_MM);

  let labelY: number;
  let boxY: number;
  if (side === "top") {
    boxY = mm(LABELS_H_HEIGHT_MM);
    labelY = boxY;
  } else {
    boxY = mm(EDGE_GAP_MM);
    labelY = boxY + boxH;
  }

  for (const tick of ticks) {
    const barX = mm(tick.offsetMm);
    const barW = mm(tick.spanMm);

    doc
      .rect(barX, boxY, barW, boxH)
      .lineWidth(STROKE_W)
      .fillAndStroke("white", SCALE_COLOR);

    if (tick.filled) {
      doc
        .moveTo(barX, boxY + boxH / 2)
        .lineTo(barX + barW, boxY + boxH / 2)
        .lineWidth(STROKE_W)
        .stroke(SCALE_COLOR);
    }

    if (tick.major) {
      doc
        .moveTo(barX, boxY)
        .lineTo(barX, boxY + boxH)
        .lineWidth(STROKE_W * 2)
        .stroke(SCALE_COLOR);
      if (tick.labelMain !== undefined) {
        drawGridLabel(
          doc,
          tick.labelPrefix,
          tick.labelMain,
          side,
          barX,
          labelY,
        );
      }
    }
  }
}

export function drawScaleBarV(doc: Doc, ticks: Tick[], side: "left" | "right") {
  const boxW = mm(SCALE_BOX_MM);

  let boxX: number;
  let labelAnchorX: number;
  if (side === "left") {
    boxX = mm(LABELS_V_WIDTH_MM);
    labelAnchorX = boxX;
  } else {
    boxX = mm(EDGE_GAP_MM);
    labelAnchorX = boxX + boxW;
  }

  for (const tick of ticks) {
    const boxY = mm(tick.offsetMm);
    const boxH = mm(tick.spanMm);

    doc
      .rect(boxX, boxY, boxW, boxH)
      .lineWidth(STROKE_W)
      .fillAndStroke("white", SCALE_COLOR);

    if (tick.filled) {
      doc
        .moveTo(boxX + boxW / 2, boxY)
        .lineTo(boxX + boxW / 2, boxY + boxH)
        .lineWidth(STROKE_W)
        .stroke(SCALE_COLOR);
    }

    if (tick.major) {
      doc
        .moveTo(boxX, boxY)
        .lineTo(boxX + boxW, boxY)
        .lineWidth(STROKE_W * 2)
        .stroke(SCALE_COLOR);
      if (tick.labelMain !== undefined) {
        drawGridLabel(
          doc,
          tick.labelPrefix,
          tick.labelMain,
          side,
          labelAnchorX,
          boxY,
        );
      }
    }
  }
}
