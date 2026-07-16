import { buildApp } from "./app.js";

const app = await buildApp();

await app.listen({
  host: "127.0.0.1",
  port: 4310,
});
