import express from "express";
import fs from "fs/promises";
import path from "path";
import { pinoHttp } from "pino-http";
import process from "process";
import { z } from "zod";
import { buildOptions, parsePath, HttpError } from "./parser.js";
import { renderStaticMap, type StaticMapSource } from "./staticmap.js";
import { logger } from "./logger.js";
import { handleError } from "./error.js";

const sourcesFile =
  process.env.SOURCES_FILE ?? path.resolve(process.cwd(), "sources.json");

const app = express();
app.disable("x-powered-by");
app.use(pinoHttp({ logger }));

const sourceSchema = z.object({
  tiles: z.string().array().min(1),
  tileSize: z.number().optional(),
  minzoom: z.number().optional(),
  maxzoom: z.number().optional(),
  attribution: z.string().optional(),
  crs: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toUpperCase() : v),
      z.enum(["EPSG:3857", "EPSG:27700"]),
    )
    .default("EPSG:3857"),
});

const sourcesSchema: z.ZodType<Record<string, StaticMapSource>> = z.record(
  z.string(),
  sourceSchema,
);

let cachedSources: {
  path: string;
  mtimeMs: number;
  sources: Record<string, StaticMapSource>;
} | null = null;

const publicDir = path.resolve(process.cwd(), "public");

app.get("/", async (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get(/^\/map:/, async (req, res) => {
  try {
    const sources = await loadSources(sourcesFile);
    const { sourceKey, commands } = parsePath(req.path);
    const source = sources[sourceKey];
    if (!source) {
      throw new HttpError(400, `Unknown source: ${sourceKey}`);
    }
    const options = buildOptions(commands, source);
    const buffer = await renderStaticMap(options);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=" + 60 * 60 * 24 * 365); // 1 year
    if (source.attribution) {
      res.setHeader("X-Map-Attribution", source.attribution);
    }

    res.status(200).send(buffer);
  } catch (error) {
    handleError(error, res);
  }
});

app.use((_req, res) => {
  res.status(404).send("Not found");
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  logger.info({ port }, "staticmap server listening");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function loadSources(
  sourcesPath: string,
): Promise<Record<string, StaticMapSource>> {
  const resolvedPath = path.resolve(sourcesPath);
  const stats = await fs.stat(resolvedPath);

  if (
    cachedSources &&
    cachedSources.path === resolvedPath &&
    cachedSources.mtimeMs === stats.mtimeMs
  ) {
    return cachedSources.sources;
  }

  const raw = await fs.readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  const sources = sourcesSchema.parse(parsed);

  cachedSources = { path: resolvedPath, mtimeMs: stats.mtimeMs, sources };
  return sources;
}
