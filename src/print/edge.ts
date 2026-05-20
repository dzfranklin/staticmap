import PDFDocument from "pdfkit";
import type { PageTile } from "./pagination.js";

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

const PT_PER_MM = 72 / 25.4;
function mm(v: number) {
  return v * PT_PER_MM;
}

const SCALE_COLOR = "#97cbeb";
const SCALE_TEXT_COLOR = "#06aeee";
const STROKE_W = mm(0.3);

type Doc = InstanceType<typeof PDFDocument>;

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

function buildTicks(
  valuesM: number[],
  toMm: (v: number) => number,
  totalMm: number,
): Tick[] {
  let prevKm: number | null = null;
  return valuesM.map((v, i) => {
    const major = v % 1000 === 0;
    const offset = toMm(v);
    const next = i + 1 < valuesM.length ? toMm(valuesM[i + 1]!) : totalMm;
    const tick: Tick = {
      major,
      offsetMm: offset,
      spanMm: next - offset,
      filled: Math.floor(v / 100) % 2 === 0,
    };
    if (major) {
      const { prefix, main } = labelParts(v, prevKm);
      tick.labelPrefix = prefix;
      tick.labelMain = main;
      prevKm = v;
    }
    return tick;
  });
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
    top: buildTicks(eVals, eToMm, imgWMm),
    bottom: buildTicks(eVals, eToMm, imgWMm),
    left: buildTicks(nValsDesc, nToMm, imgHMm),
    right: buildTicks(nValsDesc, nToMm, imgHMm),
  };
}

function drawGridLabel(
  doc: Doc,
  prefix: string,
  main: string,
  cx: number,
  cy: number,
  edgeMm: number,
  rotateDeg: number,
) {
  const fsMain = mm(edgeMm * 0.85);
  const fsPrefix = fsMain * 0.667;
  const prefixW = prefix
    ? (doc.fontSize(fsPrefix).font("SS3"), doc.widthOfString(prefix))
    : 0;
  const labelCx = cx + prefixW / 2;

  doc.save();
  if (rotateDeg !== 0) {
    doc.translate(cx, cy).rotate(rotateDeg).translate(-cx, -cy);
  }

  doc.fillColor(SCALE_TEXT_COLOR);
  if (prefix) {
    doc
      .fontSize(fsPrefix)
      .font("SS3")
      .text(prefix, labelCx - prefixW, cy - fsMain * 0.15 - fsPrefix / 2, {
        lineBreak: false,
      });
  }
  doc
    .fontSize(fsMain)
    .font("SS3-Bold")
    .text(main, labelCx - doc.widthOfString(main) / 2, cy - fsMain / 2, {
      lineBreak: false,
    });

  doc.restore();
}

export function drawScaleBarH(
  doc: Doc,
  ticks: Tick[],
  side: "top" | "bottom",
  edgeMm: number,
  scaleBoxMm: number,
  edgeGapMm: number,
) {
  const barY0 = side === "top" ? mm(edgeMm + edgeGapMm) : 0;
  const labelCy =
    side === "top" ? mm(edgeMm / 2) : mm(scaleBoxMm + edgeGapMm + edgeMm / 2);

  for (const tick of ticks) {
    const bx = mm(tick.offsetMm);
    const by = barY0;
    const bw = mm(tick.spanMm);
    const bh = mm(scaleBoxMm);

    doc
      .rect(bx, by, bw, bh)
      .lineWidth(STROKE_W)
      .fillAndStroke("white", SCALE_COLOR);

    if (tick.filled) {
      doc
        .moveTo(bx, by + bh / 2)
        .lineTo(bx + bw, by + bh / 2)
        .lineWidth(STROKE_W)
        .stroke(SCALE_COLOR);
    }

    if (tick.major) {
      doc
        .moveTo(bx, by)
        .lineTo(bx, by + bh)
        .lineWidth(STROKE_W * 2)
        .stroke(SCALE_COLOR);
      if (tick.labelMain !== undefined) {
        drawGridLabel(
          doc,
          tick.labelPrefix ?? "",
          tick.labelMain,
          bx,
          labelCy,
          edgeMm,
          0,
        );
      }
    }
  }
}

export function drawScaleBarV(
  doc: Doc,
  ticks: Tick[],
  side: "left" | "right",
  edgeMm: number,
  scaleBoxMm: number,
  edgeGapMm: number,
) {
  const barX0 = side === "left" ? mm(edgeMm + edgeGapMm) : 0;
  const labelCx =
    side === "left" ? mm(edgeMm / 2) : mm(scaleBoxMm + edgeGapMm + edgeMm / 2);
  const rotateDeg = side === "left" ? -90 : 90;

  for (const tick of ticks) {
    const bx = barX0;
    const by = mm(tick.offsetMm);
    const bw = mm(scaleBoxMm);
    const bh = mm(tick.spanMm);

    doc
      .rect(bx, by, bw, bh)
      .lineWidth(STROKE_W)
      .fillAndStroke("white", SCALE_COLOR);

    if (tick.filled) {
      doc
        .moveTo(bx + bw / 2, by)
        .lineTo(bx + bw / 2, by + bh)
        .lineWidth(STROKE_W)
        .stroke(SCALE_COLOR);
    }

    if (tick.major) {
      doc
        .moveTo(bx, by)
        .lineTo(bx + bw, by)
        .lineWidth(STROKE_W * 2)
        .stroke(SCALE_COLOR);
      if (tick.labelMain !== undefined) {
        drawGridLabel(
          doc,
          tick.labelPrefix ?? "",
          tick.labelMain,
          labelCx,
          by,
          edgeMm,
          rotateDeg,
        );
      }
    }
  }
}
