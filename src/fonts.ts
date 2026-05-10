import { registerFont } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const fontsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fonts",
);

function font(file: string, weight: string, style: "normal" | "italic") {
  const fontPath = path.join(fontsDir, file);
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Font file not found: ${fontPath}`);
  }
  registerFont(fontPath, { family: "Source Sans 3", weight, style });
}

font("SourceSans3-ExtraLight.ttf", "200", "normal");
font("SourceSans3-ExtraLightItalic.ttf", "200", "italic");
font("SourceSans3-Light.ttf", "300", "normal");
font("SourceSans3-LightItalic.ttf", "300", "italic");
font("SourceSans3-Regular.ttf", "400", "normal");
font("SourceSans3-Italic.ttf", "400", "italic");
font("SourceSans3-Medium.ttf", "500", "normal");
font("SourceSans3-MediumItalic.ttf", "500", "italic");
font("SourceSans3-SemiBold.ttf", "600", "normal");
font("SourceSans3-SemiBoldItalic.ttf", "600", "italic");
font("SourceSans3-Bold.ttf", "700", "normal");
font("SourceSans3-BoldItalic.ttf", "700", "italic");
font("SourceSans3-ExtraBold.ttf", "800", "normal");
font("SourceSans3-ExtraBoldItalic.ttf", "800", "italic");
font("SourceSans3-Black.ttf", "900", "normal");
font("SourceSans3-BlackItalic.ttf", "900", "italic");
