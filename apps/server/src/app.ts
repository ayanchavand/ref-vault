import Fastify, { type FastifyInstance } from "fastify";

import { registerLibraryRoutes } from "./routes/library.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(registerLibraryRoutes);
  return app;
}
