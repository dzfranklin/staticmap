export type Doc = InstanceType<typeof import("pdfkit")>;

interface PrivateFont {
  capHeight: number;
}

interface PrivateDoc extends Doc {
  _font: PrivateFont;
  _fontSize: number;
}

const unitsPerEm = 1000;

export function fontCapHeight(doc: Doc): number {
  const { _font, _fontSize } = doc as PrivateDoc;
  const value = (_font.capHeight / unitsPerEm) * _fontSize;
  if (isNaN(value)) {
    throw new Error("Unable to determine cap height");
  }
  return value;
}

export const PT_PER_MM = 72 / 25.4;

/** Convert millimeters to PDF points */
export function mm(mm: number) {
  return mm * PT_PER_MM;
}
