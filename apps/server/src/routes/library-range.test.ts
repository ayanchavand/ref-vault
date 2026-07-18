import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildApp } from "../app.js";

test("serves full video file with 200 OK and caching headers when no range is requested", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-range-"));
  const videoDirectory = join(library, "video-range-1");
  await mkdir(videoDirectory, { recursive: true });
  const content = "0123456789"; // 10 bytes
  await writeFile(join(videoDirectory, "main.mp4"), content);
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-1/main.mp4"),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "video/mp4");
    assert.equal(response.headers["content-length"], "10");
    assert.equal(response.headers["accept-ranges"], "bytes");
    assert.ok(response.headers["etag"]);
    assert.ok(response.headers["last-modified"]);
    assert.equal(response.headers["cache-control"], "public, max-age=604800, must-revalidate");
    assert.equal(response.payload, content);
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("serves partial video file with 206 Partial Content for range request", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-range-"));
  const videoDirectory = join(library, "video-range-2");
  await mkdir(videoDirectory, { recursive: true });
  const content = "0123456789"; // 10 bytes
  await writeFile(join(videoDirectory, "main.mp4"), content);
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-2/main.mp4"),
      headers: {
        range: "bytes=2-6",
      },
    });

    assert.equal(response.statusCode, 206);
    assert.equal(response.headers["content-type"], "video/mp4");
    assert.equal(response.headers["content-range"], "bytes 2-6/10");
    assert.equal(response.headers["content-length"], "5");
    assert.equal(response.payload, "23456");
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("supports suffix range requests (e.g. bytes=-4 for last 4 bytes)", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-range-"));
  const videoDirectory = join(library, "video-range-3");
  await mkdir(videoDirectory, { recursive: true });
  const content = "0123456789"; // 10 bytes
  await writeFile(join(videoDirectory, "main.mp4"), content);
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-3/main.mp4"),
      headers: {
        range: "bytes=-4",
      },
    });

    assert.equal(response.statusCode, 206);
    assert.equal(response.headers["content-type"], "video/mp4");
    assert.equal(response.headers["content-range"], "bytes 6-9/10");
    assert.equal(response.headers["content-length"], "4");
    assert.equal(response.payload, "6789");
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("limits range chunks to MAX_CHUNK_SIZE (2MB)", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-range-"));
  const videoDirectory = join(library, "video-range-4");
  await mkdir(videoDirectory, { recursive: true });
  
  // Create a 3MB file
  const size = 3 * 1024 * 1024;
  const chunk = Buffer.alloc(size, "a");
  await writeFile(join(videoDirectory, "main.mp4"), chunk);
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-4/main.mp4"),
      headers: {
        range: "bytes=0-",
      },
    });

    const expectedChunkSize = 2 * 1024 * 1024; // 2MB

    assert.equal(response.statusCode, 206);
    assert.equal(response.headers["content-type"], "video/mp4");
    assert.equal(response.headers["content-range"], `bytes 0-${expectedChunkSize - 1}/${size}`);
    assert.equal(response.headers["content-length"], String(expectedChunkSize));
    assert.equal(response.rawPayload.length, expectedChunkSize);
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("supports 304 conditional request validation with ETag and Last-Modified", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-range-"));
  const videoDirectory = join(library, "video-range-5");
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "main.mp4"), "0123456789");
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-5/main.mp4"),
    });

    assert.equal(response.statusCode, 200);
    const etag = response.headers["etag"] as string;
    const lastModified = response.headers["last-modified"] as string;
    assert.ok(etag);
    assert.ok(lastModified);

    // Test If-None-Match
    const responseNoneMatch = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-5/main.mp4"),
      headers: {
        "if-none-match": etag,
      },
    });
    assert.equal(responseNoneMatch.statusCode, 304);

    // Test If-Modified-Since
    const responseModifiedSince = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-5/main.mp4"),
      headers: {
        "if-modified-since": lastModified,
      },
    });
    assert.equal(responseModifiedSince.statusCode, 304);
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("negotiates range requests with If-Range header", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-range-"));
  const videoDirectory = join(library, "video-range-6");
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "main.mp4"), "0123456789");
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-6/main.mp4"),
    });

    const etag = response.headers["etag"] as string;

    // Test If-Range matches ETag (should return 206 Partial Content)
    const rangeMatch = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-6/main.mp4"),
      headers: {
        range: "bytes=2-5",
        "if-range": etag,
      },
    });
    assert.equal(rangeMatch.statusCode, 206);
    assert.equal(rangeMatch.payload, "2345");

    // Test If-Range does NOT match ETag (should ignore Range and return 200 OK with full file)
    const rangeMismatch = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-range-6/main.mp4"),
      headers: {
        range: "bytes=2-5",
        "if-range": "outdated-etag",
      },
    });
    assert.equal(rangeMismatch.statusCode, 200);
    assert.equal(rangeMismatch.payload, "0123456789");
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});
