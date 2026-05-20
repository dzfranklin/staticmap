import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import PDFDocument from "pdfkit";
import { registerFonts } from "../print/fonts.js";
import { expect } from "vitest";
export interface SnapshotResult {
  name: string;
  success: boolean;
  message?: string;
  expected?: PNG;
  actual?: PNG;
  diff?: PNG;
  diffPixels?: number;
}

const snapshotUpdateNames: Set<string> = new Set(
  process.env.UPDATE_SNAPSHOTS
    ? process.env.UPDATE_SNAPSHOTS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [],
);
const createNewSnapshots = !!process.env.CREATE_NEW_SNAPSHOTS;

export function assertVisualSnapshot(
  snapshotDir: string,
  name: string,
  buffer: Buffer,
): SnapshotResult {
  const failureArtifactDir = path.join(snapshotDir, "__artifacts__");
  const result = snapshotTest(snapshotDir, name, buffer);
  if (snapshotUpdateNames.has(name)) {
    writeSnapshot(snapshotDir, name, buffer);
    console.warn(`Updated snapshot for ${name}`);
  } else if (createNewSnapshots && !result.expected) {
    writeSnapshot(snapshotDir, name, buffer);
    console.warn(
      `Created new snapshot for ${name} (it will be used in future test runs)`,
    );
  } else if (!result.success) {
    writeSnapshotFailureArtifacts(failureArtifactDir, result);
    expect
      .soft(false, result.message ?? `Snapshot assertion failed for ${name}`)
      .toBe(true);
  } else if (result.diffPixels) {
    console.warn(
      `Snapshot for ${name} has ${result.diffPixels} differing pixels. ` +
        `Consider updating the snapshot if this change is expected. (UPDATE_SNAPSHOTS=${name})`,
    );
  }

  return result;
}

export function snapshotTest(
  snapshotDir: string,
  name: string,
  buffer: Buffer,
  {
    threshold = 0.1,
    maxDiffRatio = 0.0003,
  }: { threshold?: number; maxDiffRatio?: number } = {},
): SnapshotResult {
  const r: SnapshotResult = { name, success: false };

  const snapshotPath = path.join(snapshotDir, `${name}.png`);
  try {
    r.expected = PNG.sync.read(fs.readFileSync(snapshotPath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ...r,
        message: `Missing snapshot for ${name}. Run with CREATE_NEW_SNAPSHOTS=true to create it.`,
      };
    } else {
      throw err;
    }
  }

  r.actual = PNG.sync.read(buffer);
  if (
    r.expected.width !== r.actual.width ||
    r.expected.height !== r.actual.height
  ) {
    const message =
      `Snapshot size mismatch for ${name}. ` +
      `Expected ${r.expected.width}x${r.expected.height}, got ${r.actual.width}x${r.actual.height}. Run with UPDATE_SNAPSHOTS=${name} to update the snapshot if this change is expected.`;
    return { ...r, message };
  }

  r.diff = new PNG({ width: r.expected.width, height: r.expected.height });
  r.diffPixels = pixelmatch(
    r.expected.data,
    r.actual.data,
    r.diff.data,
    r.expected.width,
    r.expected.height,
    { threshold },
  );

  const totalPixels = r.expected.width * r.expected.height;
  const diffRatio = r.diffPixels / totalPixels;

  if (diffRatio > maxDiffRatio) {
    const message =
      `Snapshot mismatch for ${name}. ` +
      `${(diffRatio * 100).toFixed(2)}% of pixels differ (${r.diffPixels} pixels), ` +
      `exceeding the threshold of ${(maxDiffRatio * 100).toFixed(2)}%. If this change is expected, run UPDATE_SNAPSHOTS=${name} npm test.`;
    return { ...r, message };
  }

  return { ...r, success: true };
}

function writeSnapshotFailureArtifacts(
  failureArtifactDir: string,
  r: SnapshotResult,
): void {
  if (r.success) throw new Error("bad state: success");

  const expectedPath = path.join(failureArtifactDir, `${r.name}.expected.png`);
  const actualPath = path.join(failureArtifactDir, `${r.name}.actual.png`);
  const diffPath = path.join(failureArtifactDir, `${r.name}.diff.png`);

  fs.mkdirSync(failureArtifactDir, { recursive: true });
  const writtenFiles: string[] = [];
  if (r.expected) {
    fs.writeFileSync(expectedPath, PNG.sync.write(r.expected));
    writtenFiles.push(expectedPath);
  }
  if (r.actual) {
    fs.writeFileSync(actualPath, PNG.sync.write(r.actual));
    writtenFiles.push(actualPath);
  }
  if (r.diff) {
    fs.writeFileSync(diffPath, PNG.sync.write(r.diff));
    writtenFiles.push(diffPath);
  }
  console.error(
    `Snapshot test failed for ${r.name}. ` +
      `Wrote failure artifacts to:\n` +
      writtenFiles.map((f) => `  ${f}`).join("\n"),
  );
}

export async function assertPDFRegionSnapshot(
  snapshotDir: string,
  name: string,
  drawFn: (doc: InstanceType<typeof PDFDocument>) => void,
  regionW: number,
  regionH: number,
  dpi = 150,
): Promise<void> {
  const doc = new PDFDocument({
    size: [regionW * 3, regionH * 3],
    margin: 0,
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  registerFonts(doc);
  doc.translate(regionW, regionH);
  drawFn(doc);
  doc.end();
  await done;

  const pdfBuffer = Buffer.concat(chunks);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-snapshot-"));
  try {
    const pdfPath = path.join(tmp, "page.pdf");
    fs.writeFileSync(pdfPath, pdfBuffer);
    execFileSync("pdftoppm", [
      "-r",
      String(dpi),
      "-png",
      "-f",
      "1",
      "-l",
      "1",
      pdfPath,
      path.join(tmp, "out"),
    ]);
    const fullPng = PNG.sync.read(fs.readFileSync(path.join(tmp, "out-1.png")));

    const scale = dpi / 72;
    const x0 = Math.ceil(regionW * scale) - 1;
    const y0 = Math.ceil(regionH * scale) - 1;
    const x1 = Math.ceil(regionW * 2 * scale) + 1;
    const y1 = Math.ceil(regionH * 2 * scale) + 1;

    // Check nothing was drawn outside the region (ignoring the red border we drew)
    const { width, height, data } = fullPng;
    let escaped = false;
    outer: for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (px >= x0 && px < x1 && py >= y0 && py < y1) continue;
        const idx = (py * width + px) * 4;
        const r = data[idx]!;
        const g = data[idx + 1]!;
        const b = data[idx + 2]!;
        const a = data[idx + 3]!;
        if (a === 0 || (r === 255 && g === 255 && b === 255)) continue;
        escaped = true;
        expect
          .soft(
            false,
            `draw escaped the allowed region at pixel (${px}, ${py})`,
          )
          .toBe(true);
        break outer;
      }
    }

    // Draw a 1px red border just outside the region on the full PNG for debugging
    for (let px = x0 - 1; px <= x1; px++) {
      for (const py of [y0 - 1, y1]) {
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const idx = (py * width + px) * 4;
        fullPng.data[idx] = 255;
        fullPng.data[idx + 1] = 0;
        fullPng.data[idx + 2] = 0;
        fullPng.data[idx + 3] = 255;
      }
    }
    for (let py = y0 - 1; py <= y1; py++) {
      for (const px of [x0 - 1, x1]) {
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const idx = (py * width + px) * 4;
        fullPng.data[idx] = 255;
        fullPng.data[idx + 1] = 0;
        fullPng.data[idx + 2] = 0;
        fullPng.data[idx + 3] = 255;
      }
    }

    if (escaped) {
      const failureArtifactDir = path.join(snapshotDir, "__artifacts__");
      fs.mkdirSync(failureArtifactDir, { recursive: true });
      const overflowPath = path.join(
        failureArtifactDir,
        `${name}.overflow.png`,
      );
      fs.writeFileSync(overflowPath, PNG.sync.write(fullPng));
      expect
        .soft(
          false,
          `draw escaped the allowed region for ${name}. Wrote full page to:\n  ${overflowPath}`,
        )
        .toBe(true);
    }

    // Crop to region + 1px on each side so the border is fully included
    const cx0 = x0 - 1;
    const cy0 = y0 - 1;
    const cx1 = x1 + 1;
    const cy1 = y1 + 1;
    if (cx0 < 0 || cy0 < 0 || cx1 > width || cy1 > height) {
      throw new Error(
        `Invalid crop region: (${cx0}, ${cy0}) to (${cx1}, ${cy1}) with image size ${width}x${height}`,
      );
    }
    const cropped = new PNG({ width: cx1 - cx0, height: cy1 - cy0 });
    for (let cy = 0; cy < cropped.height; cy++) {
      for (let cx = 0; cx < cropped.width; cx++) {
        const srcIdx = ((cy0 + cy) * width + (cx0 + cx)) * 4;
        const dstIdx = (cy * cropped.width + cx) * 4;
        cropped.data[dstIdx] = data[srcIdx]!;
        cropped.data[dstIdx + 1] = data[srcIdx + 1]!;
        cropped.data[dstIdx + 2] = data[srcIdx + 2]!;
        cropped.data[dstIdx + 3] = data[srcIdx + 3]!;
      }
    }
    assertVisualSnapshot(snapshotDir, name, PNG.sync.write(cropped));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function existingPDFSnapshotCount(snapshotDir: string, name: string): number {
  let count = 0;
  while (fs.existsSync(path.join(snapshotDir, `${name}.${count + 1}.png`)))
    count++;
  return count;
}

export function assertPDFSnapshot(
  snapshotDir: string,
  name: string,
  pdfBuffer: Buffer,
  dpi = 150,
): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-snapshot-"));
  const pdfPath = path.join(tmp, "page.pdf");
  const artifactDir = path.join(snapshotDir, "__artifacts__");
  let hasFailure = false;
  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    execFileSync("pdftoppm", [
      "-r",
      String(dpi),
      "-png",
      pdfPath,
      path.join(tmp, "out"),
    ]);
    const pngFiles = fs
      .readdirSync(tmp)
      .filter((f) => f.startsWith("out-") && f.endsWith(".png"))
      .sort();
    const existingCount = existingPDFSnapshotCount(snapshotDir, name);
    if (existingCount > 0) {
      expect(
        pngFiles.length,
        `Expected ${existingCount} pages but got ${pngFiles.length}`,
      ).toBe(existingCount);
    }
    for (let i = 0; i < pngFiles.length; i++) {
      const png = fs.readFileSync(path.join(tmp, pngFiles[i]!));
      const result = assertVisualSnapshot(snapshotDir, `${name}.${i + 1}`, png);
      hasFailure = hasFailure || !result.success;
    }
  } finally {
    if (hasFailure) {
      const pdfArtifactPath = path.join(artifactDir, `${name}.pdf`);
      fs.mkdirSync(artifactDir, { recursive: true });
      fs.copyFileSync(pdfPath, pdfArtifactPath);
      console.error(
        `Error occurred while processing PDF snapshot for ${name}. Artifact written to: ${pdfArtifactPath}`,
      );
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function writeSnapshot(
  snapshotDir: string,
  name: string,
  buffer: Buffer,
): void {
  const snapshotPath = path.join(snapshotDir, `${name}.png`);
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(snapshotPath, buffer);
}
