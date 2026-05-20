import PDFDocument from "pdfkit";
import { parsePath, buildOptions } from "../parser.js";
import { renderStaticMap, type Source } from "../staticmap.js";
import { HttpError } from "../errors.js";
import { registerFonts } from "./fonts.js";
import { computePages } from "./pagination.js";
import {
  computeEdgeTicks,
  drawScaleBarH,
  drawScaleBarV,
  EDGE_H_HEIGHT_MM,
  EDGE_V_WIDTH_MM,
} from "./edge.js";
import { drawFooter, FOOTER_MM } from "./footer.js";

const A4_W_MM = 210;
const A4_H_MM = 297;
const MM_PER_PX = 25.4 / 96; // 96 dpi
const DEFAULT_MARGIN_MM = 10;
const DEFAULT_PAGE_OVERLAP = 50;

const PT_PER_MM = 72 / 25.4;
function mm(v: number) {
  return v * PT_PER_MM;
}

export interface PrintRequest {
  map: string;
  title?: string;
  margin_mm?: number;
  style?: "os";
  pageOverlap?: number;
  filename?: string;
  debugMode?: boolean;
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
  const debugMode = req.debugMode ?? false;

  const imgWPx = Math.floor(
    (A4_W_MM - 2 * (marginMm + EDGE_V_WIDTH_MM)) / MM_PER_PX,
  );
  const imgHPx = Math.floor(
    (A4_H_MM - 2 * (marginMm + EDGE_H_HEIGHT_MM) - FOOTER_MM) / MM_PER_PX,
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

  const grid = new Map<string, number>();
  pages.forEach((p, i) => grid.set(`${p.row},${p.col}`, i + 1));

  const mapImages = await Promise.all(
    pages.map(async (page) => {
      const { commands: pageCmds } = parsePath(page.url);
      return renderStaticMap(buildOptions(pageCmds, source));
    }),
  );

  const A4_W_PT = mm(A4_W_MM);
  const A4_H_PT = mm(A4_H_MM);
  const marginPt = mm(marginMm);
  const innerWPt = A4_W_PT - 2 * marginPt;
  const innerHPt = A4_H_PT - 2 * marginPt;
  const edgeVWidthPt = mm(EDGE_V_WIDTH_MM);
  const edgeHHeightPt = mm(EDGE_H_HEIGHT_MM);
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
  doc.on("error", (err) => {
    throw err;
  });
  const done = new Promise<void>((resolve) => doc.on("end", resolve));

  const total = pages.length;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const mapResult = mapImages[i]!;

    doc.addPage({ size: [A4_W_PT, A4_H_PT], margin: 0 });

    if (!debugMode) {
      doc
        .rect(marginPt, marginPt, marginPt + innerWPt, marginPt + innerHPt)
        .clip();
    } else {
      doc
        .save()
        .fillColor("#debcbc")
        .rect(0, 0, A4_W_PT, marginPt) // top
        .rect(0, A4_H_PT - marginPt, A4_W_PT, marginPt) // bottom
        .rect(0, marginPt, marginPt, A4_H_PT - 2 * marginPt) // left
        .rect(A4_W_PT - marginPt, marginPt, marginPt, A4_H_PT - 2 * marginPt) // right
        .fill()
        .restore();
    }
    doc.translate(marginPt, marginPt);

    const imgX = edgeVWidthPt;
    const imgY = edgeHHeightPt;

    doc.image(mapResult.buffer, imgX, imgY, { width: imgWPt, height: imgHPt });

    if (osStyle && page.nativeBounds) {
      const ticks = computeEdgeTicks(page.nativeBounds, imgWMm, imgHMm);

      doc.save();
      doc.translate(imgX, 0);
      drawScaleBarH(doc, ticks.top, "top");
      doc.restore();

      doc.save();
      doc.translate(imgX, imgY + imgHPt);
      drawScaleBarH(doc, ticks.bottom, "bottom");
      doc.restore();

      doc.save();
      doc.translate(0, imgY);
      drawScaleBarV(doc, ticks.left, "left");
      doc.restore();

      doc.save();
      doc.translate(imgX + imgWPt, imgY);
      drawScaleBarV(doc, ticks.right, "right");
      doc.restore();
    }

    const neighbors = {
      top: grid.get(`${page.row - 1},${page.col}`),
      bottom: grid.get(`${page.row + 1},${page.col}`),
      left: grid.get(`${page.row},${page.col - 1}`),
      right: grid.get(`${page.row},${page.col + 1}`),
    };
    doc.save();
    doc.translate(0, imgY + imgHPt + edgeHHeightPt);
    drawFooter(doc, {
      title,
      pageNum: i + 1,
      total,
      attribution,
      neighbors,
      footerW: innerWPt,
      footerH: footerPt,
    });
    doc.restore();
  }

  doc.end();
  await done;

  return Buffer.concat(chunks);
}
