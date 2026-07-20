import type {
  ApiErrorResponse,
  ScanLibraryResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";
import { syncVaultCache, getCachedVideos } from "./cache-sync.js";

type ScanLibraryResult =
  | { ok: true; value: ScanLibraryResponse }
  | { ok: false; error: ApiErrorResponse };

export async function scanLibrary(rootPath: string): Promise<ScanLibraryResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  try {
    await syncVaultCache(rootValidation.value.rootPath);
    const videos = getCachedVideos(rootValidation.value.rootPath);

    return {
      ok: true,
      value: { rootPath: rootValidation.value.rootPath, videos },
    };
  } catch {
    return {
      ok: false,
      error: {
        error: "LIBRARY_SCAN_FAILED",
        message: "The library could not be scanned.",
      },
    };
  }
}
