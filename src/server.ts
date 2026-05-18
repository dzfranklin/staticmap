import express from "express";
import fs from "fs/promises";
import path from "path";
import { pinoHttp } from "pino-http";
import process from "process";
import { z } from "zod";
import { buildOptions, parsePath } from "./parser.js";
import { renderStaticMap, type Source } from "./staticmap.js";
import { logger } from "./logger.js";
import {
  httpRequestDuration,
  mapRenderDuration,
  pagesComputeDuration,
  startMetricsServer,
} from "./metrics.js";
import { HttpError } from "./errors.js";
import { handleError, handleJsonError } from "./error-handlers.js";
import { computePages } from "./pages.js";
import schema from "./commands/schema.js";
import { generateDocs as generateReference } from "./docs/generator.js";

const sourcesFile =
  process.env.SOURCES_FILE ?? path.resolve(process.cwd(), "sources.json");

const app = express();
app.disable("x-powered-by");
app.use(pinoHttp({ logger }));

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.path.startsWith("/pages/map:")
      ? "/pages/map:*"
      : req.path.startsWith("/map:")
        ? "/map:*"
        : req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status_code: String(res.statusCode) },
      durationSec,
    );
  });
  next();
});

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

const sourcesSchema: z.ZodType<Record<string, Source>> = z.record(
  z.string(),
  sourceSchema,
);

let cachedSources: {
  path: string;
  mtimeMs: number;
  sources: Record<string, Source>;
} | null = null;

const publicDir = path.resolve(process.cwd(), "public");

app.use(express.static(publicDir));

app.get("/", async (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/playground", (_req, res) => {
  res.sendFile(path.join(publicDir, "playground.html"));
});

app.get("/schema.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json(schema);
});

app.get("/sources.json", async (_req, res) => {
  try {
    const sources = await loadSources(sourcesFile);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache");
    res.status(200).json(Object.keys(sources));
  } catch {
    res.status(200).json([]);
  }
});

app.get("/reference.html", (_req, res) => {
  const main = generateReference(schema);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Command Reference</title>
<link rel="stylesheet" href="/docs.css">
</head>
<body>
<header>
<h1><a href="/">Staticmap</a></h1>
<a href="https://github.com/dzfranklin/staticmap">GitHub</a>
</header>
${main}
</body>
</html>`;
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(html);
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
    const renderStart = process.hrtime.bigint();
    const map = await renderStaticMap(options);
    mapRenderDuration.observe(
      { source_key: sourceKey, commands_length: String(commands.length) },
      Number(process.hrtime.bigint() - renderStart) / 1e9,
    );

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=" + 60 * 60 * 24 * 365); // 1 year
    if (map.attribution) res.setHeader("X-Map-Attribution", map.attribution);
    res.setHeader(
      "X-Map-Bounds",
      `${map.bounds.minLat},${map.bounds.minLng},${map.bounds.maxLat},${map.bounds.maxLng}`,
    );

    res.status(200).send(map.buffer);
  } catch (error) {
    handleError(error, res);
  }
});

app.get(/^\/pages\/map:/, async (req, res) => {
  try {
    const sources = await loadSources(sourcesFile);
    const { sourceKey, commands } = parsePath(req.path.slice("/pages".length));
    const source = sources[sourceKey];
    if (!source) {
      throw new HttpError(400, `Unknown source: ${sourceKey}`);
    }
    const computeStart = process.hrtime.bigint();
    const result = computePages(sourceKey, commands, source);
    pagesComputeDuration.observe(
      { source_key: sourceKey, commands_length: String(commands.length) },
      Number(process.hrtime.bigint() - computeStart) / 1e9,
    );
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=" + 60 * 60 * 24);
    res.status(200).json(result);
  } catch (error) {
    handleJsonError(error, res);
  }
});

app.use((_req, res) => {
  res.status(404).send("Not found");
});

const port = Number(process.env.PORT ?? 3000);
const metricsPort = Number(process.env.METRICS_PORT ?? 3001);

app.listen(port, () => {
  logger.info({ port }, "staticmap server listening");
});

const metricsServer = startMetricsServer(metricsPort);
metricsServer.on("listening", () => {
  logger.info({ port: metricsPort }, "metrics server listening");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  metricsServer.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function loadSources(
  sourcesPath: string,
): Promise<Record<string, Source>> {
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
