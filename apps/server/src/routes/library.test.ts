import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("recursively discovers video folders and clips without reading metadata", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const shotDirectory = join(library, "sequences", "opening-shot");
  const nestedClipsDirectory = join(shotDirectory, "clips", "alternates");
  const simpleVideoDirectory = join(library, "z-last");
  await mkdir(nestedClipsDirectory, { recursive: true });
  await mkdir(simpleVideoDirectory);
  await writeFile(join(shotDirectory, "main.mp4"), "");
  await writeFile(join(shotDirectory, "metadata.json"), "not read by this endpoint");
  await writeFile(join(shotDirectory, "thumbnail.jpg"), "");
  await writeFile(join(shotDirectory, "clips", "0.mp4"), "");
  await writeFile(join(nestedClipsDirectory, "1.mp4"), "");
  await writeFile(join(simpleVideoDirectory, "main.mp4"), "");
  await mkdir(join(simpleVideoDirectory, "clips"));
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/library/scan",
      payload: { rootPath: library },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      rootPath: library,
      videos: [
        {
          relativePath: "sequences/opening-shot",
          mainVideoPath: "sequences/opening-shot/main.mp4",
          metadataPath: "sequences/opening-shot/metadata.json",
          thumbnailPath: "sequences/opening-shot/thumbnail.jpg",
          clips: [
            {
              mediaPath: "sequences/opening-shot/clips/0.mp4",
            },
            {
              mediaPath: "sequences/opening-shot/clips/alternates/1.mp4",
            },
          ],
        },
        {
          relativePath: "z-last",
          mainVideoPath: "z-last/main.mp4",
          clips: [],
        },
      ],
    });
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("reads video and clip metadata without changing its future fields", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const videoDirectory = join(library, "video-a");
  const clipsDirectory = join(videoDirectory, "clips");
  await mkdir(clipsDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "main.mp4"), "");
  await writeFile(
    join(videoDirectory, "metadata.json"),
    JSON.stringify({ tags: ["cinematography"], futureField: { enabled: true } }),
  );
  await writeFile(join(clipsDirectory, "0.mp4"), "");
  await writeFile(
    join(videoDirectory, "clips.json"),
    JSON.stringify({
      "0": { notes: "Camera settles.", rating: 4 },
    }, null, 2),
  );
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/videos/detail",
      payload: { rootPath: library, videoRelativePath: "video-a" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      rootPath: library,
      video: {
        relativePath: "video-a",
        mainVideoPath: "video-a/main.mp4",
        metadata: {
          tags: ["cinematography"],
          futureField: { enabled: true },
        },
        clipsMetadataPath: "video-a/clips.json",
        clips: [
          {
            mediaPath: "video-a/clips/0.mp4",
            metadata: { notes: "Camera settles.", rating: 4 },
          },
        ],
      },
    });
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("serves media files from the library", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const videoDirectory = join(library, "video-a");
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "main.mp4"), "hello world");
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-a/main.mp4"),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "video/mp4");
    assert.equal(response.payload, "hello world");
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("rejects a video path that escapes the library root", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/videos/detail",
      payload: { rootPath: library, videoRelativePath: "../outside" },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "INVALID_VIDEO_PATH",
      message: "videoRelativePath must stay within the library root.",
    });
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("atomically creates the metadata JSON beside a verified clip", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const videoDirectory = join(library, "video-a");
  const clipsDirectory = join(videoDirectory, "clips");
  await mkdir(clipsDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "main.mp4"), "");
  await writeFile(join(clipsDirectory, "0.mp4"), "");
  const app = await buildApp();
  const metadata = {
    tags: ["animation"],
    notes: "Anticipation before the jump.",
    futureField: { source: "study" },
  };

  try {
    const response = await app.inject({
      method: "PUT",
      url: "/api/clips/metadata",
      payload: {
        rootPath: library,
        videoRelativePath: "video-a",
        clipMediaPath: "video-a/clips/0.mp4",
        metadata,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      metadataPath: "video-a/clips.json",
      metadata,
    });
    assert.deepEqual(
      JSON.parse(await readFile(join(videoDirectory, "clips.json"), "utf8")),
      { "0": metadata },
    );
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("atomically creates the metadata.json beside a verified video", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const videoDirectory = join(library, "video-a");
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "main.mp4"), "");
  const app = await buildApp();
  const metadata = {
    tags: ["camera movement", "neon"],
    notes: "Main video overview.",
    rating: 5,
  };

  try {
    const response = await app.inject({
      method: "PUT",
      url: "/api/videos/metadata",
      payload: {
        rootPath: library,
        videoRelativePath: "video-a",
        metadata,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      metadataPath: "video-a/metadata.json",
      metadata,
    });
    assert.deepEqual(
      JSON.parse(await readFile(join(videoDirectory, "metadata.json"), "utf8")),
      metadata,
    );
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("atomically creates the split_plan.json beside a verified video", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const videoDirectory = join(library, "video-a");
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "main.mp4"), "");
  const app = await buildApp();
  const segments = [
    { start: 0, end: 10, tags: ["first"] },
    { start: 10, end: 20, tags: ["second"] },
  ];

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/videos/split-plan",
      payload: {
        rootPath: library,
        videoRelativePath: "video-a",
        segments,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      splitPlanPath: "video-a/split_plan.json",
      success: true,
    });
    assert.deepEqual(
      JSON.parse(await readFile(join(videoDirectory, "split_plan.json"), "utf8")),
      {
        videoRelativePath: "video-a",
        mainVideoPath: "video-a/main.mp4",
        segments,
      },
    );
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("serves image files with Cache-Control and ETag, and supports 304 conditional request", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const videoDirectory = join(library, "video-a");
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "thumbnail.jpg"), "fake-image-content");
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-a/thumbnail.jpg"),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/jpeg");
    assert.equal(response.payload, "fake-image-content");
    assert.ok(response.headers["cache-control"]);
    assert.ok(response.headers["etag"]);

    const etag = response.headers["etag"] as string;

    const cacheResponse = await app.inject({
      method: "GET",
      url: "/api/media?rootPath=" + encodeURIComponent(library) +
        "&mediaPath=" + encodeURIComponent("video-a/thumbnail.jpg"),
      headers: {
        "if-none-match": etag,
      },
    });

    assert.equal(cacheResponse.statusCode, 304);
    assert.equal(cacheResponse.payload, "");
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

test("serves existing thumbnail via /api/media/thumbnail with Cache-Control and ETag", async () => {
  const library = await mkdtemp(join(tmpdir(), "reference-vault-"));
  const videoDirectory = join(library, "video-a");
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(join(videoDirectory, "thumbnail.jpg"), "existing-thumbnail");
  await writeFile(join(videoDirectory, "main.mp4"), "fake-video-content");
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: `/api/media/thumbnail?rootPath=${encodeURIComponent(library)}&mediaPath=video-a/main.mp4`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/jpeg");
    assert.equal(response.payload, "existing-thumbnail");
    assert.ok(response.headers["cache-control"]);
    assert.ok(response.headers["etag"]);

    const etag = response.headers["etag"] as string;

    const cacheResponse = await app.inject({
      method: "GET",
      url: `/api/media/thumbnail?rootPath=${encodeURIComponent(library)}&mediaPath=video-a/main.mp4`,
      headers: {
        "if-none-match": etag,
      },
    });

    assert.equal(cacheResponse.statusCode, 304);
    assert.equal(cacheResponse.payload, "");
  } finally {
    await app.close();
    await rm(library, { force: true, recursive: true });
  }
});

