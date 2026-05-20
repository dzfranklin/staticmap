import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import {
  parsePath,
  buildOptions,
  serializePath,
  prependCommandOnce,
  CenterCommand,
} from "./parser.js";
import {
  renderStaticMap,
  computeBbox,
  getCrs,
  type Source,
} from "./staticmap.js";
import { buildScene, type PixelRect } from "./scene.js";
import { HttpError } from "./errors.js";

const fontsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fonts",
);
const FONT_REGULAR = path.join(fontsDir, "SourceSans3-Regular.ttf");
const FONT_BOLD = path.join(fontsDir, "SourceSans3-Bold.ttf");
const FONT_ITALIC = path.join(fontsDir, "SourceSans3-Italic.ttf");

function registerFonts(doc: InstanceType<typeof PDFDocument>) {
  doc.registerFont("SS3", FONT_REGULAR);
  doc.registerFont("SS3-Bold", FONT_BOLD);
  doc.registerFont("SS3-Italic", FONT_ITALIC);
}

// ---------- Layout constants (match plantopo-print pdf.py) ----------

const A4_W_MM = 210;
const A4_H_MM = 297;
const MM_PER_PX = 25.4 / 96; // 96 dpi
const FOOTER_MM = 10;
const EDGE_MM = 2.7;
const SCALE_BOX_MM = 1.5;
const EDGE_GAP_MM = 0.5;
const DEFAULT_MARGIN_MM = 10;
const DEFAULT_PAGE_OVERLAP = 50;
const MAX_PAGES = 100;

const PT_PER_MM = 72 / 25.4;
function mm(v: number) {
  return v * PT_PER_MM;
}

// ---------- Page tile types ----------

interface PageTile {
  url: string;
  row: number;
  col: number;
  size: { width: number; height: number };
  center: { lng: number; lat: number };
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  nativeBounds?: {
    crs: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

// ---------- Page computation (inlined from former pages.ts) ----------

function computePages(
  sourceKey: string,
  commands: ReturnType<typeof parsePath>["commands"],
  source: Source,
  size: { width: number; height: number },
  pageOverlap: number,
): { pages: PageTile[]; attribution: string | undefined } {
  const options = buildOptions(
    [
      // Inject size as if the caller passed it in the URL
      ...commands.filter((c) => c.type !== "size" && c.type !== "pageOverlap"),
    ],
    source,
  );
  // Override size with the print-computed dimensions
  options.size = size;

  if (options.zoom === undefined) {
    throw new HttpError(400, "print requires a zoom command");
  }
  const zoom = options.zoom;

  if (pageOverlap >= size.width || pageOverlap >= size.height) {
    throw new HttpError(400, "pageOverlap must be less than page size");
  }

  if (options.features.length === 0) {
    throw new HttpError(400, "print requires at least one line command");
  }

  const bbox = computeBbox({ ...options, zoom });
  if (!bbox) {
    throw new HttpError(400, "print requires at least one line command");
  }

  const { minX, maxX, minY, maxY } = bbox;
  const strideX = size.width - pageOverlap;
  const strideY = size.height - pageOverlap;

  const numCols = Math.max(1, Math.ceil((maxX - minX) / strideX));
  const numRows = Math.max(1, Math.ceil((maxY - minY) / strideY));

  if (numCols * numRows > 10_000) {
    throw new HttpError(
      400,
      `Request too large: ${numCols} cols × ${numRows} rows (max 10,000 grid cells)`,
    );
  }

  const firstCenterX = minX + size.width / 2;
  const firstCenterY = minY + size.height / 2;

  const crs = getCrs(source);
  const nodes = buildScene(options, zoom, crs);

  // Commands for per-page URLs: strip size/pageOverlap (they become internal),
  // but keep everything else (zoom, features, styles, etc.)
  const baseCommands = commands.filter(
    (c) => c.type !== "size" && c.type !== "pageOverlap",
  );

  const pages: PageTile[] = [];
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cx = firstCenterX + col * strideX;
      const cy = firstCenterY + row * strideY;

      const pageRect: PixelRect = {
        minX: cx - size.width / 2,
        maxX: cx + size.width / 2,
        minY: cy - size.height / 2,
        maxY: cy + size.height / 2,
      };

      // Hit-test against the inner region only — buffer content is already
      // visible on the adjacent page.
      const innerRect: PixelRect = {
        minX: col === 0 ? pageRect.minX : pageRect.minX + pageOverlap,
        maxX: col === numCols - 1 ? pageRect.maxX : pageRect.maxX - pageOverlap,
        minY: row === 0 ? pageRect.minY : pageRect.minY + pageOverlap,
        maxY: row === numRows - 1 ? pageRect.maxY : pageRect.maxY - pageOverlap,
      };
      if (!nodes.some((n) => n.intersectsRect(innerRect))) continue;

      if (pages.length >= MAX_PAGES) {
        throw new HttpError(400, `Too many pages: result exceeds ${MAX_PAGES}`);
      }

      const center = crs.pixelToLngLat(cx, cy, zoom);
      const topLeft = crs.pixelToLngLat(pageRect.minX, pageRect.minY, zoom);
      const bottomRight = crs.pixelToLngLat(pageRect.maxX, pageRect.maxY, zoom);
      const bounds = {
        minLat: bottomRight.lat,
        minLng: topLeft.lng,
        maxLat: topLeft.lat,
        maxLng: bottomRight.lng,
      };

      const crsKey = source.crs ?? "EPSG:3857";
      let nativeBounds: PageTile["nativeBounds"];
      if (crsKey !== "EPSG:3857") {
        const nativeTopLeft = crs.pixelToNative(
          pageRect.minX,
          pageRect.minY,
          zoom,
        );
        const nativeBottomRight = crs.pixelToNative(
          pageRect.maxX,
          pageRect.maxY,
          zoom,
        );
        nativeBounds = {
          crs: crsKey,
          minX: nativeTopLeft.x,
          minY: nativeBottomRight.y,
          maxX: nativeBottomRight.x,
          maxY: nativeTopLeft.y,
        };
      }

      const pageCommands = prependCommandOnce(
        baseCommands,
        new CenterCommand({ lng: center.lng, lat: center.lat }),
      );
      const url = serializePath(sourceKey, pageCommands);

      pages.push({ url, row, col, center, size, bounds, nativeBounds });
    }
  }

  return { pages, attribution: source.attribution };
}

// ---------- OS National Grid scale bar helpers ----------

interface Tick {
  major: boolean;
  offsetMm: number;
  spanMm: number;
  filled: boolean;
  labelPrefix?: string;
  labelMain?: string;
}

interface EdgeTicks {
  top: Tick[];
  bottom: Tick[];
  left: Tick[];
  right: Tick[];
}

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

function computeEdgeTicks(
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

// ---------- PDFKit drawing ----------

const SCALE_COLOR = "#97cbeb";
const SCALE_TEXT_COLOR = "#06aeee";
const STROKE_W = mm(0.3);

type Doc = InstanceType<typeof PDFDocument>;

function drawScaleBarH(
  doc: Doc,
  ticks: Tick[],
  side: "top" | "bottom",
  edgeMm: number,
  scaleBoxMm: number,
  edgeGapMm: number,
  originX: number,
  originY: number,
) {
  const barY0 = side === "top" ? mm(edgeMm + edgeGapMm) : 0;
  const labelCy =
    side === "top"
      ? originY + mm(edgeMm / 2)
      : originY + mm(scaleBoxMm + edgeGapMm + edgeMm / 2);

  for (const tick of ticks) {
    const bx = originX + mm(tick.offsetMm);
    const by = originY + barY0;
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

function drawScaleBarV(
  doc: Doc,
  ticks: Tick[],
  side: "left" | "right",
  edgeMm: number,
  scaleBoxMm: number,
  edgeGapMm: number,
  originX: number,
  originY: number,
) {
  const barX0 = side === "left" ? mm(edgeMm + edgeGapMm) : 0;
  const labelCx =
    side === "left"
      ? originX + mm(edgeMm / 2)
      : originX + mm(scaleBoxMm + edgeGapMm + edgeMm / 2);
  const rotateDeg = side === "left" ? -90 : 90;

  for (const tick of ticks) {
    const bx = originX + barX0;
    const by = originY + mm(tick.offsetMm);
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

function drawFooter(
  doc: Doc,
  title: string,
  pageNum: number,
  total: number,
  attribution: string | undefined,
  neighbors: { top?: number; bottom?: number; left?: number; right?: number },
  footerX: number,
  footerY: number,
  footerW: number,
  footerH: number,
) {
  const fontSize = 9 * PT_PER_MM;
  const textY = footerY + (footerH - fontSize) / 2;

  // Left side: bold title + normal page count
  doc.fillColor("#1f1f1f").font("SS3-Bold").fontSize(fontSize);
  doc.text(title, footerX, textY, { lineBreak: false, continued: true });
  doc.font("SS3").text(` ${pageNum}/${total}`, { lineBreak: false });

  const cellMm = 4;
  const gapMm = 0.5;
  const hasNeighbors =
    neighbors.top !== undefined ||
    neighbors.bottom !== undefined ||
    neighbors.left !== undefined ||
    neighbors.right !== undefined;

  let rightEdge = footerX + footerW;

  if (hasNeighbors) {
    const gridW = mm(cellMm * 3 + gapMm * 2);
    const gridH = mm(cellMm * 3 + gapMm * 2);
    const gridX = rightEdge - gridW - mm(1);
    const gridY = footerY + (footerH - gridH) / 2;
    drawPageGrid(doc, pageNum, neighbors, gridX, gridY, cellMm, gapMm);
    rightEdge = gridX - mm(2);
  }

  if (attribution) {
    doc.font("SS3-Italic").fontSize(fontSize).fillColor("#444");
    const attrW = doc.widthOfString(attribution);
    doc.text(attribution, rightEdge - attrW, textY, { lineBreak: false });
  }
}

function drawPageGrid(
  doc: Doc,
  currentPageNum: number,
  neighbors: { top?: number; bottom?: number; left?: number; right?: number },
  originX: number,
  originY: number,
  cellMm: number,
  gapMm: number,
) {
  const cellPt = mm(cellMm);
  const gapPt = mm(gapMm);
  const labelFontSize = mm(cellMm * 0.55);

  const cells: Array<[number, number, number | undefined]> = [
    [1, 0, neighbors.top],
    [0, 1, neighbors.left],
    [1, 1, currentPageNum],
    [2, 1, neighbors.right],
    [1, 2, neighbors.bottom],
  ];

  for (const [gc, gr, num] of cells) {
    if (num === undefined) continue;
    const cx = originX + gc * (cellPt + gapPt);
    const cy = originY + gr * (cellPt + gapPt);
    const isCurrent = gc === 1 && gr === 1;

    doc
      .rect(cx, cy, cellPt, cellPt)
      .lineWidth(0.6)
      .fillAndStroke(isCurrent ? "#e8edf5" : "white", "#555");

    const label = String(num);
    doc
      .fillColor("#333")
      .font(isCurrent ? "SS3-Bold" : "SS3")
      .fontSize(labelFontSize);
    const lw = doc.widthOfString(label);
    doc.text(label, cx + (cellPt - lw) / 2, cy + (cellPt - labelFontSize) / 2, {
      lineBreak: false,
    });
  }
}

// ---------- Public API ----------

export interface PrintRequest {
  map: string;
  title?: string;
  margin_mm?: number;
  style?: "os";
  pageOverlap?: number;
}

export async function renderPrintPdf(
  req: PrintRequest,
  source: Source,
  sourceKey: string,
): Promise<Buffer> {
  const marginMm = req.margin_mm ?? DEFAULT_MARGIN_MM;
  const title = req.title ?? "Map";
  const osStyle = req.style === "os";
  const pageOverlap = req.pageOverlap ?? DEFAULT_PAGE_OVERLAP;

  const edgeTotalMm = EDGE_MM + (osStyle ? SCALE_BOX_MM : 0) + EDGE_GAP_MM;

  // Round to pixel boundary then back to mm to avoid sub-pixel overflow
  const imgWPx = Math.floor(
    (A4_W_MM - 2 * (marginMm + edgeTotalMm)) / MM_PER_PX,
  );
  const imgHPx = Math.floor(
    (A4_H_MM - 2 * (marginMm + edgeTotalMm) - FOOTER_MM) / MM_PER_PX,
  );
  const imgWMm = imgWPx * MM_PER_PX;
  const imgHMm = imgHPx * MM_PER_PX;

  const mapPath = req.map.replace(/\s+/g, "");
  const { sourceKey: parsedKey, commands } = parsePath(mapPath);
  if (parsedKey !== sourceKey) {
    throw new HttpError(
      400,
      `Map path source key "${parsedKey}" does not match source "${sourceKey}"`,
    );
  }

  const { pages, attribution } = computePages(
    sourceKey,
    commands,
    source,
    { width: imgWPx, height: imgHPx },
    pageOverlap,
  );

  if (pages.length === 0) {
    throw new HttpError(400, "No pages to render");
  }

  if (osStyle) {
    for (const page of pages) {
      if (!page.nativeBounds || page.nativeBounds.crs !== "EPSG:27700") {
        throw new HttpError(
          400,
          "style=os requires a map source using EPSG:27700",
        );
      }
    }
  }

  // Build (row,col) -> 1-based page number lookup for neighbour diagram
  const grid = new Map<string, number>();
  pages.forEach((p, i) => grid.set(`${p.row},${p.col}`, i + 1));

  // Render all map tile images in parallel
  const mapImages = await Promise.all(
    pages.map(async (page) => {
      const { commands: pageCmds } = parsePath(page.url);
      const opts = buildOptions(
        [
          ...pageCmds,
          // Inject the exact pixel size we computed
          ...pageCmds.filter(() => false), // no-op, size already absent from page url
        ],
        source,
      );
      opts.size = { width: imgWPx, height: imgHPx };
      return renderStaticMap(opts);
    }),
  );

  // Assemble PDF
  const A4_W_PT = mm(A4_W_MM);
  const A4_H_PT = mm(A4_H_MM);
  const marginPt = mm(marginMm);
  const edgePt = mm(edgeTotalMm);
  const footerPt = mm(FOOTER_MM);
  const imgWPt = mm(imgWMm);
  const imgHPt = mm(imgHMm);

  const doc = new PDFDocument({
    size: [A4_W_PT, A4_H_PT],
    margin: 0,
    autoFirstPage: false,
    info: { Title: title },
  });

  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on("end", resolve));

  const total = pages.length;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const mapResult = mapImages[i]!;

    doc.addPage({ size: [A4_W_PT, A4_H_PT], margin: 0 });

    const imgX = marginPt + edgePt;
    const imgY = marginPt + edgePt;

    // Map image
    doc.image(mapResult.buffer, imgX, imgY, { width: imgWPt, height: imgHPt });

    // OS scale bars
    if (osStyle && page.nativeBounds) {
      const ticks = computeEdgeTicks(page.nativeBounds, imgWMm, imgHMm);

      drawScaleBarH(
        doc,
        ticks.top,
        "top",
        EDGE_MM,
        SCALE_BOX_MM,
        EDGE_GAP_MM,
        imgX,
        marginPt,
      );
      drawScaleBarH(
        doc,
        ticks.bottom,
        "bottom",
        EDGE_MM,
        SCALE_BOX_MM,
        EDGE_GAP_MM,
        imgX,
        imgY + imgHPt,
      );
      drawScaleBarV(
        doc,
        ticks.left,
        "left",
        EDGE_MM,
        SCALE_BOX_MM,
        EDGE_GAP_MM,
        marginPt,
        imgY,
      );
      drawScaleBarV(
        doc,
        ticks.right,
        "right",
        EDGE_MM,
        SCALE_BOX_MM,
        EDGE_GAP_MM,
        imgX + imgWPt,
        imgY,
      );
    }

    // Footer
    const neighbors = {
      top: grid.get(`${page.row - 1},${page.col}`),
      bottom: grid.get(`${page.row + 1},${page.col}`),
      left: grid.get(`${page.row},${page.col - 1}`),
      right: grid.get(`${page.row},${page.col + 1}`),
    };
    const footerX = marginPt;
    const footerY = imgY + imgHPt + edgePt;
    const footerW = A4_W_PT - 2 * marginPt;

    drawFooter(
      doc,
      title,
      i + 1,
      total,
      attribution,
      neighbors,
      footerX,
      footerY,
      footerW,
      footerPt,
    );
  }

  doc.end();
  await done;

  return Buffer.concat(chunks);
}
