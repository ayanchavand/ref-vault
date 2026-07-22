import { realpath, stat } from "node:fs/promises";

import type {
  ApiErrorResponse,
  ValidateLibraryRootResponse,
} from "@reference-vault/shared";

type LibraryRootValidationResult =
  | { ok: true; value: ValidateLibraryRootResponse }
  | { ok: false; error: ApiErrorResponse };

export async function validateLibraryRoot(
  rootPath?: string,
): Promise<LibraryRootValidationResult> {
  const pathToValidate =
    rootPath && rootPath.trim().length > 0
      ? rootPath.trim()
      : process.env.DEFAULT_LIBRARY_PATH || "";

  if (pathToValidate.length === 0) {
    return {
      ok: false,
      error: {
        error: "INVALID_LIBRARY_ROOT",
        message: "rootPath must not be empty.",
      },
    };
  }

  try {
    const canonicalRootPath = await realpath(pathToValidate);
    const rootStats = await stat(canonicalRootPath);

    if (!rootStats.isDirectory()) {
      return {
        ok: false,
        error: {
          error: "INVALID_LIBRARY_ROOT",
          message: "rootPath must identify a directory.",
        },
      };
    }

    return { ok: true, value: { rootPath: canonicalRootPath } };
  } catch (error: unknown) {
    // If explicit rootPath was specified but failed, check if DEFAULT_LIBRARY_PATH is set and valid as fallback
    if (
      rootPath &&
      rootPath.trim().length > 0 &&
      process.env.DEFAULT_LIBRARY_PATH &&
      process.env.DEFAULT_LIBRARY_PATH !== rootPath.trim()
    ) {
      try {
        const fallbackCanonical = await realpath(process.env.DEFAULT_LIBRARY_PATH);
        const fallbackStats = await stat(fallbackCanonical);
        if (fallbackStats.isDirectory()) {
          return { ok: true, value: { rootPath: fallbackCanonical } };
        }
      } catch {
        // Fallback check failed, proceed with original error handling
      }
    }

    const code = error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT" || code === "ENOTDIR") {
      return {
        ok: false,
        error: {
          error: "LIBRARY_ROOT_NOT_FOUND",
          message: "rootPath does not exist.",
        },
      };
    }

    return {
      ok: false,
      error: {
        error: "LIBRARY_ROOT_NOT_ACCESSIBLE",
        message: "rootPath could not be accessed.",
      },
    };
  }
}
