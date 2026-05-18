import http from "http";
import { Registry, collectDefaultMetrics, Histogram } from "prom-client";

const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const tileFetchDuration = new Histogram({
  name: "tile_fetch_duration_seconds",
  help: "Tile fetch duration in seconds",
  labelNames: ["tiles"] as const,
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const pagesComputeDuration = new Histogram({
  name: "pages_compute_duration_seconds",
  help: "Pages compute duration in seconds",
  labelNames: ["source_key", "commands_length"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const mapRenderDuration = new Histogram({
  name: "map_render_duration_seconds",
  help: "Map render duration in seconds",
  labelNames: ["source_key", "commands_length"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export function startMetricsServer(port: number): http.Server {
  const server = http.createServer(async (_req, res) => {
    const body = await register.metrics();
    res.writeHead(200, { "Content-Type": register.contentType });
    res.end(body);
  });
  server.listen(port);
  return server;
}
