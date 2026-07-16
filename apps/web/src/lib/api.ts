import type {
  ApiErrorResponse,
  ScanLibraryResponse,
  ValidateLibraryRootResponse,
} from "@reference-vault/shared";

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function validateLibraryRoot(
  rootPath: string,
): Promise<ValidateLibraryRootResponse> {
  const response = await fetch("/api/library/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The library folder could not be validated.");
  }

  return payload as ValidateLibraryRootResponse;
}

export async function scanLibrary(rootPath: string): Promise<ScanLibraryResponse> {
  const response = await fetch("/api/library/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The library could not be scanned.");
  }

  return payload as ScanLibraryResponse;
}
