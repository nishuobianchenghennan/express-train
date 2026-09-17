import path from "node:path";

import express from "express";

import { resolveStaticRoot } from "./config.js";

export function createApp() {
  const app = express();
  const staticRoot = resolveStaticRoot();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((_request, response, next) => {
    response.set({
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)",
    });
    next();
  });

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use(express.static(staticRoot, {
    extensions: ["html"],
    setHeaders(response, filePath) {
      if (filePath.endsWith("sw.js") || filePath.endsWith("manifest.webmanifest")) {
        response.setHeader("Cache-Control", "no-cache");
      } else if (/\.(?:js|css|svg)$/.test(filePath)) {
        response.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  }));

  app.use((request, response) => {
    const acceptsHtml = request.method === "GET" && (request.get("accept") ?? "").includes("text/html");
    if (acceptsHtml) {
      return response.sendFile(path.join(staticRoot, "index.html"));
    }
    return response.status(404).json({ error: "Not Found" });
  });

  app.use((error, _request, response, next) => {
    if (response.headersSent) {
      return next(error);
    }
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) {
      console.error(error);
    }
    return response.status(status).json({
      error: status >= 500 ? "Internal Server Error" : error.message,
    });
  });

  return app;
}
