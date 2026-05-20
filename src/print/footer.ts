import { type Doc, fontCapHeight, mm } from "./util.js";

const NEIGHBOR_GRID_CELL_MM = 4;
const NEIGHBOR_GRID_SIZE_MM = NEIGHBOR_GRID_CELL_MM * 3;

export const FOOTER_H_MM = 14;

export type DrawFooterOpts = {
  title: string;
  pageNum: number;
  total: number;
  attribution: string | undefined;
  neighbors: { top?: number; bottom?: number; left?: number; right?: number };
  footerW: number;
  footerH: number;
};

const hasNeighbors = (neighbors: DrawFooterOpts["neighbors"]) =>
  neighbors.top !== undefined ||
  neighbors.bottom !== undefined ||
  neighbors.left !== undefined ||
  neighbors.right !== undefined;

export function drawFooter(doc: Doc, opts: DrawFooterOpts) {
  const h = mm(FOOTER_H_MM);

  const { title, pageNum, total, attribution, neighbors, footerW, footerH } =
    opts;

  doc.fillColor("#1f1f1f");

  if (hasNeighbors(neighbors)) {
    const gridX = footerW - mm(NEIGHBOR_GRID_SIZE_MM) - 1;
    const gridY = footerH - mm(NEIGHBOR_GRID_SIZE_MM) - 1;
    drawNeighborsGrid(doc, pageNum, neighbors, gridX, gridY);
  }

  const right = footerW - mm(NEIGHBOR_GRID_SIZE_MM) - mm(2) - 1;
  const left = 1;
  const width = right - left;

  doc.font("SS3-Bold").fontSize(16);
  const titleSpace = doc.widthOfString(title) < width * 0.75 ? footerW : width;
  doc.text(title, 1, 0, {
    baseline: "top",
    width: titleSpace,
    height: doc.currentLineHeight(),
    ellipsis: true,
    align: "center",
  });

  const pageText = `Page ${pageNum} of ${total}`;
  doc.font("SS3").fontSize(9);
  const pageTextW = doc.widthOfString(pageText);
  doc.text(pageText, 1, h, { baseline: "bottom" });

  if (attribution) {
    const left = pageTextW + mm(4);
    const width = right - left;
    doc.font("SS3-Italic").text(attribution, left, h, {
      baseline: "bottom",
      width,
      height: doc.currentLineHeight(),
      ellipsis: true,
    });
  }
}

export function drawNeighborsGrid(
  doc: Doc,
  currentPageNum: number,
  neighbors: { top?: number; bottom?: number; left?: number; right?: number },
  originX: number,
  originY: number,
) {
  doc.save();

  const cellPt = mm(NEIGHBOR_GRID_CELL_MM);

  const cells: Array<[number, number, number | undefined]> = [
    [1, 1, currentPageNum],
    [1, 0, neighbors.top],
    [0, 1, neighbors.left],
    [2, 1, neighbors.right],
    [1, 2, neighbors.bottom],
  ];

  for (const [gc, gr, num] of cells) {
    if (num === undefined) continue;
    const cx = originX + gc * cellPt;
    const cy = originY + gr * cellPt;
    const b = 0.25; // border width
    const isCurrent = num === currentPageNum;

    doc.rect(cx, cy, cellPt, cellPt).lineWidth(b).strokeColor("#333").stroke();

    const label = String(num);
    doc.fillColor("#333").font("SS3");
    if (isCurrent) doc.font("SS3-Bold");

    const textSpace = cellPt - b * 2 - 1;
    let fontSize = 7;
    doc.fontSize(fontSize);
    let lw = doc.widthOfString(label);
    if (lw > textSpace) {
      do {
        fontSize -= 0.5;
        doc.fontSize(fontSize);
        lw = doc.widthOfString(label);
      } while (lw > textSpace && fontSize > 3);
    }

    const lh = fontCapHeight(doc);
    doc.text(label, cx + (cellPt - lw) / 2 + b, cy + (cellPt + lh) / 2 + b, {
      lineBreak: false,
      width: cellPt,
      height: cellPt,
      baseline: "alphabetic",
    });
  }

  doc.restore();
}
