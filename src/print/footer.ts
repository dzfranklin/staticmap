import PDFDocument from "pdfkit";

const PT_PER_MM = 72 / 25.4;
function mm(v: number) {
  return v * PT_PER_MM;
}

type Doc = InstanceType<typeof PDFDocument>;

export type DrawFooterOpts = {
  title: string;
  pageNum: number;
  total: number;
  attribution: string | undefined;
  neighbors: { top?: number; bottom?: number; left?: number; right?: number };
  footerX: number;
  footerY: number;
  footerW: number;
  footerH: number;
};

export function drawFooter(doc: Doc, opts: DrawFooterOpts) {
  const { title, pageNum, total, attribution, neighbors, footerX, footerY, footerW, footerH } = opts;
  const fontSize = 9 * PT_PER_MM;
  const textY = footerY + (footerH - fontSize) / 2;

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

export function drawPageGrid(
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
