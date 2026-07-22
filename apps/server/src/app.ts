import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

import { registerLibraryRoutes } from "./routes/library.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(registerLibraryRoutes);

  const webDistPath =
    process.env.WEB_DIST_PATH || resolve(__dirname, "../../web/dist");

  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/",
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url && request.raw.url.startsWith("/api")) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "API endpoint not found",
        });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

