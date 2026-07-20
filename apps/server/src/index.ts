import { buildApp } from "./app.js";

const app = await buildApp();

await app.listen({
  host: process.env.HOST || "0.0.0.0",
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4310,
});
