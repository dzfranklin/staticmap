import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

const fontsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fonts",
);
const FONT_REGULAR = path.join(fontsDir, "SourceSans3-Regular.ttf");
const FONT_BOLD = path.join(fontsDir, "SourceSans3-Bold.ttf");
const FONT_MEDIUM = path.join(fontsDir, "SourceSans3-Medium.ttf");
const FONT_ITALIC = path.join(fontsDir, "SourceSans3-Italic.ttf");

export function registerFonts(doc: InstanceType<typeof PDFDocument>) {
  doc.registerFont("SS3", FONT_REGULAR);
  doc.registerFont("SS3-Bold", FONT_BOLD);
  doc.registerFont("SS3-Medium", FONT_MEDIUM);
  doc.registerFont("SS3-Italic", FONT_ITALIC);
}
