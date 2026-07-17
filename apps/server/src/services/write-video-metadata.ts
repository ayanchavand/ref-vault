import { join } from "node:path";
import type {
  ApiErrorResponse,
  JsonObject,
  PutVideoMetadataResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";
import {
  resolveVideoDirectory,
  writeJsonAtomically,
  toLibraryRelativePath,
} from "./write-clip-metadata.js";

type WriteVideoMetadataResult =
  | { ok: true; value: PutVideoMetadataResponse }
  | { ok: false; error: ApiErrorResponse };

export async function writeVideoMetadata(
  rootPath: string,
  videoRelativePath: string,
  metadata: JsonObject,
): Promise<WriteVideoMetadataResult> {
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

  const videoMetadataPath = join(videoDirectory.value, "metadata.json");

  try {
    await writeJsonAtomically(videoMetadataPath, metadata);
    return {
      ok: true,
      value: {
        metadataPath: toLibraryRelativePath(
          rootValidation.value.rootPath,
          videoMetadataPath,
        ),
        metadata,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: "Video metadata could not be saved.",
      },
    };
  }
}
