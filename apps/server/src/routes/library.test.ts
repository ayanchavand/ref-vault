import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  await writeFile(join(shotDirectory, "clips", "0.json"), "not read by this endpoint");
  await writeFile(join(nestedClipsDirectory, "1.mp4"), "");
  await writeFile(join(simpleVideoDirectory, "main.mp4"), "");
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
              metadataPath: "sequences/opening-shot/clips/0.json",
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
    join(clipsDirectory, "0.json"),
    JSON.stringify({ notes: "Camera settles.", rating: 4 }),
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
        clips: [
          {
            mediaPath: "video-a/clips/0.mp4",
            metadataPath: "video-a/clips/0.json",
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
