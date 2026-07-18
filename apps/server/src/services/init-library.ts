import { mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import type {
  ApiErrorResponse,
  InitLibraryResponse,
} from "@reference-vault/shared";

type InitLibraryResult =
  | { ok: true; value: InitLibraryResponse }
  | { ok: false; error: ApiErrorResponse };

export async function initLibraryStructure(
  targetPath: string,
): Promise<InitLibraryResult> {
  if (!targetPath || targetPath.trim().length === 0) {
    return {
      ok: false,
      error: {
        error: "INVALID_LIBRARY_ROOT",
        message: "targetPath must not be empty.",
      },
    };
  }

  const resolvedPath = resolve(targetPath);

  try {
    // 1. Ensure target directory exists (create it if not)
    await mkdir(resolvedPath, { recursive: true });

    // 2. Read directory contents to see if it is empty
    const entries = await readdir(resolvedPath);
    const filteredEntries = entries.filter((e) => e !== ".DS_Store" && e !== "Thumbs.db");
    const isEmpty = filteredEntries.length === 0;

    // Determine container path: if not empty, group inside "refvault" folder
    const containerPath = isEmpty ? resolvedPath : join(resolvedPath, "refvault");

    const videoPath = join(containerPath, "refVault_Videos");
    const mediaPath = join(containerPath, "refVault_Media");

    // Create both library folders
    await mkdir(videoPath, { recursive: true });
    await mkdir(mediaPath, { recursive: true });

    // Initialize media skeleton folders under refVault_Media
    await mkdir(join(mediaPath, "images"), { recursive: true });
    await mkdir(join(mediaPath, "gifs"), { recursive: true });
    await mkdir(join(mediaPath, "videos"), { recursive: true });

    return {
      ok: true,
      value: {
        success: true,
        videoPath,
        mediaPath,
      },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: `Failed to initialize library structure: ${(error as Error).message}`,
      },
    };
  }
}
