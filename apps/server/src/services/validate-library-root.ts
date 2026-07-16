import { realpath, stat } from "node:fs/promises";

import type {
  ApiErrorResponse,
  ValidateLibraryRootResponse,
} from "@reference-vault/shared";

type LibraryRootValidationResult =
  | { ok: true; value: ValidateLibraryRootResponse }
  | { ok: false; error: ApiErrorResponse };

export async function validateLibraryRoot(
  rootPath: string,
): Promise<LibraryRootValidationResult> {
  if (rootPath.trim().length === 0) {
    return {
      ok: false,
      error: {
        error: "INVALID_LIBRARY_ROOT",
        message: "rootPath must not be empty.",
      },
    };
  }

  try {
    const canonicalRootPath = await realpath(rootPath);
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
