import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerInternalRoutes } from "./routes/internal.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowedOrigins = new Set([env.WEB_ORIGIN]);
      const isLocalViteOrigin = /^http:\/\/localhost:53\d{2}$/.test(origin);
      const isLoopbackViteOrigin = /^http:\/\/127\.0\.0\.1:53\d{2}$/.test(origin);
      callback(null, allowedOrigins.has(origin) || isLocalViteOrigin || isLoopbackViteOrigin);
    },
  });

  app.get("/health", async () => ({ ok: true }));
  await registerApiRoutes(app);
  await registerInternalRoutes(app);

  return app;
}
