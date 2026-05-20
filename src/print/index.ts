import PDFDocument from "pdfkit";
import { parsePath, buildOptions } from "../parser.js";
import { renderStaticMap, type Source } from "../staticmap.js";
import { HttpError } from "../errors.js";
import { registerFonts } from "./fonts.js";
import { computePages } from "./pages.js";
import { computeEdgeTicks, drawScaleBarH, drawScaleBarV } from "./edge.js";
import { drawFooter } from "./footer.js";

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

    doc.image(mapResult.buffer, imgX, imgY, { width: imgWPt, height: imgHPt });

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
