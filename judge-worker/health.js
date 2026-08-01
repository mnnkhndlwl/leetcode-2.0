import http from "node:http";

/**
 * Start a minimal health server for ECS/ALB probes.
 * @param {string} addr e.g. "0.0.0.0:8080" or ":8080"
 */
export function startHealthServer(addr) {
  const host = "0.0.0.0";
  const port = Number(String(addr).replace(/^:/, "")) || 8080;

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, host);
  return server;
}
