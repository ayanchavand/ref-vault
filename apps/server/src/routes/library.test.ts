import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildApp } from "../app.js";

test("validates a directory and returns its canonical path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/library/validate",
      payload: { rootPath: directory },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { rootPath: directory });
  } finally {
    await app.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects a path to a file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const filePath = join(directory, "not-a-library");
  await writeFile(filePath, "");
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/library/validate",
      payload: { rootPath: filePath },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "INVALID_LIBRARY_ROOT",
      message: "rootPath must identify a directory.",
    });
  } finally {
    await app.close();
    await rm(directory, { force: true, recursive: true });
  }
});
