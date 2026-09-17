import "dotenv/config";

import { createApp } from "./app.js";
import { parseHost, parsePort } from "./config.js";

const host = parseHost(process.env.HOST);
const port = parsePort(process.env.PORT);

const app = createApp();
const server = app.listen(port, host, () => {
  console.log(`Express server listening at http://${host}:${port}`);
});

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}; shutting down`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close((error) => {
    clearTimeout(forceExitTimer);

    if (error) {
      console.error(error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
