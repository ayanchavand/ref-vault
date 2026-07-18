import { spawn } from "node:child_process";
import { stat, realpath, mkdir } from "node:fs/promises";
import { dirname, join, extname, basename, resolve, relative } from "node:path";
import * as crypto from "node:crypto";
import type { ApiErrorResponse, CaptureFrameResponse } from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";

type CaptureFrameResult =
  | { ok: true; value: CaptureFrameResponse }
  | { ok: false; error: ApiErrorResponse };

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", args);
    let stderr = "";
    process.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}. Stderr: ${stderr}`));
      }
    });
    process.on("error", (err) => {
      reject(err);
    });
  });
}

function isContainedPath(libraryRootPath: string, targetPath: string): boolean {
  const pathFromRoot = resolve(libraryRootPath, targetPath).startsWith(libraryRootPath)
    ? relative(libraryRootPath, targetPath)
    : "..";
  return pathFromRoot === "" || !pathFromRoot.startsWith("..");
}

function formatTimecodeForFilename(secs: number): string {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = Math.floor(secs % 60);
  const frames = Math.floor((secs % 1) * 24); // assuming 24fps
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
    String(frames).padStart(2, "0"),
  ].join("-");
}

export async function captureFrame(
  rootPath: string,
  mediaPath: string,
  timestamp: number,
  mediaRootPath?: string,
): Promise<CaptureFrameResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRoot = rootValidation.value.rootPath;
  let videoPath: string;
  try {
    videoPath = await realpath(resolve(libraryRoot, mediaPath));
  } catch {
    return {
      ok: false,
      error: {
        error: "MEDIA_NOT_FOUND",
        message: "The requested video file was not found.",
      },
    };
  }

  // Safety check: must stay within library root
  if (!isContainedPath(libraryRoot, videoPath)) {
    return {
      ok: false,
      error: {
        error: "MEDIA_NOT_FOUND",
        message: "mediaPath must stay within the library root.",
      },
    };
  }

  // Resolve target media library root
  let mediaRoot = libraryRoot;
  if (mediaRootPath) {
    const mediaRootValidation = await validateLibraryRoot(mediaRootPath);
    if (mediaRootValidation.ok) {
      mediaRoot = mediaRootValidation.value.rootPath;
    }
  } else {
    // If no mediaRootPath is provided, look for peer "media" directory next to libraryRoot
    const peerMediaDir = resolve(libraryRoot, "..", "media");
    try {
      const peerStats = await stat(peerMediaDir);
      if (peerStats.isDirectory()) {
        mediaRoot = await realpath(peerMediaDir);
      }
    } catch {
      // Peer "media" folder doesn't exist, keep mediaRoot = libraryRoot
    }
  }

  // Ensure Generated folder exists under mediaRoot
  const generatedDir = join(mediaRoot, "Generated");
  try {
    await mkdir(generatedDir, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "FRAME_CAPTURE_FAILED",
        message: `Failed to create Generated folder: ${(err as Error).message}`,
      },
    };
  }

  // Build frame output filename
  const timecode = formatTimecodeForFilename(timestamp);
  const shortUuid = crypto.randomUUID().substring(0, 8);
  const outputFilename = `frame_${timecode}_${shortUuid}.png`;
  const outputFilePath = join(generatedDir, outputFilename);

  // Command: ffmpeg -y -i <videoPath> -ss <timestamp> -vframes 1 -q:v 2 <outputFilePath>
  // Placing -ss after -i makes seek frame-accurate (slower but accurate).
  try {
    await runFfmpeg([
      "-y",
      "-i",
      videoPath,
      "-ss",
      String(timestamp),
      "-vframes",
      "1",
      "-q:v",
      "2",
      outputFilePath,
    ]);
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "FRAME_CAPTURE_FAILED",
        message: `ffmpeg frame capture failed: ${(err as Error).message}`,
      },
    };
  }

  // Verify file was written
  try {
    const fileStats = await stat(outputFilePath);
    if (fileStats.isFile() && fileStats.size > 0) {
      const savedPath = relative(mediaRoot, outputFilePath).replace(/\\/g, "/");
      return {
        ok: true,
        value: {
          success: true,
          savedPath,
        },
      };
    }
  } catch {
    // Fallthrough to error
  }

  return {
    ok: false,
    error: {
      error: "FRAME_CAPTURE_FAILED",
      message: "Frame file was not created or is empty.",
    },
  };
}
