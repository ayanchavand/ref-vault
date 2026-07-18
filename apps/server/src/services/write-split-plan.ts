import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  ApiErrorResponse,
  SaveSplitPlanResponse,
  SaveSplitPlanRequest,
  JsonObject,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";
import {
  resolveVideoDirectory,
  writeJsonAtomically,
  toLibraryRelativePath,
} from "./write-clip-metadata.js";

type WriteSplitPlanResult =
  | { ok: true; value: SaveSplitPlanResponse }
  | { ok: false; error: ApiErrorResponse };

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", args);
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    process.on("error", (err) => {
      reject(err);
    });
  });
}

async function getNextClipIndex(clipsDir: string): Promise<number> {
  try {
    const files = await readdir(clipsDir);
    let maxIndex = 0;
    for (const file of files) {
      const match = file.match(/^scene_(\d+)\.mp4$/i);
      if (match) {
        const index = parseInt(match[1]!, 10);
        if (index > maxIndex) {
          maxIndex = index;
        }
      }
    }
    return maxIndex + 1;
  } catch {
    return 1;
  }
}

export async function writeSplitPlan(
  rootPath: string,
  videoRelativePath: string,
  segments: SaveSplitPlanRequest["segments"],
): Promise<WriteSplitPlanResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const videoDirectory = await resolveVideoDirectory(
    rootValidation.value.rootPath,
    videoRelativePath,
  );

  if (!videoDirectory.ok) {
    return videoDirectory;
  }

  const splitPlanPath = join(videoDirectory.value, "split_plan.json");
  const payload = {
    videoRelativePath,
    mainVideoPath: join(videoRelativePath, "main.mp4").replace(/\\/g, "/"),
    segments,
  };

  try {
    await writeJsonAtomically(splitPlanPath, payload);
  } catch {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: "Split plan could not be saved.",
      },
    };
  }

  const outputDir = join(videoDirectory.value, "clips");
  try {
    await mkdir(outputDir, { recursive: true });
  } catch {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: "Could not create clips directory.",
      },
    };
  }

  const clipsMetadata: JsonObject = {};
  const mainVideoPath = join(videoDirectory.value, "main.mp4");
  const startNum = await getNextClipIndex(outputDir);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const clipIndex = startNum + i;
    const clipName = `scene_${String(clipIndex).padStart(2, "0")}`;
    const outputFilePath = join(outputDir, `${clipName}.mp4`);

    const ffmpegArgs = [
      "-y",
      "-ss", String(seg.start),
      "-to", String(seg.end),
      "-i", mainVideoPath,
      "-c", "copy",
      outputFilePath,
    ];

    try {
      const mainVideoStats = await stat(mainVideoPath);
      if (mainVideoStats.size > 0) {
        await runFfmpeg(ffmpegArgs);
      }
    } catch (err) {
      return {
        ok: false,
        error: {
          error: "METADATA_WRITE_FAILED",
          message: `ffmpeg chopping failed for segment ${i + 1}: ${(err as Error).message}`,
        },
      };
    }

    const meta: JsonObject = {
      tags: seg.tags,
    };
    if (seg.notes) {
      meta.notes = seg.notes;
    }
    if (seg.rating) {
      meta.rating = seg.rating;
    }
    clipsMetadata[clipName] = meta;
  }

  const clipsMetadataPath = join(videoDirectory.value, "clips.json");
  let existingMetadata: JsonObject = {};
  try {
    const existingContents = await readFile(clipsMetadataPath, "utf8");
    const parsed = JSON.parse(existingContents);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      existingMetadata = parsed;
    }
  } catch {
    // Ignore error if file doesn't exist
  }

  const mergedMetadata = {
    ...existingMetadata,
    ...clipsMetadata,
  };

  try {
    await writeJsonAtomically(clipsMetadataPath, mergedMetadata);
  } catch {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: "Failed to write clips.json metadata.",
      },
    };
  }

  return {
    ok: true,
    value: {
      splitPlanPath: toLibraryRelativePath(
        rootValidation.value.rootPath,
        splitPlanPath,
      ),
      success: true,
    },
  };
}
