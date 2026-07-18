import type {
  ApiErrorResponse,
  GetVideoDetailRequest,
  GetVideoDetailResponse,
  ScanLibraryResponse,
  ScanMediaResponse,
  ValidateLibraryRootResponse,
  PutClipMetadataRequest,
  PutClipMetadataResponse,
  PutVideoMetadataRequest,
  PutVideoMetadataResponse,
  SaveSplitPlanRequest,
  SaveSplitPlanResponse,
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

export async function getVideoDetail(
  request: GetVideoDetailRequest,
): Promise<GetVideoDetailResponse> {
  const response = await fetch("/api/videos/detail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The video details could not be loaded.");
  }

  return payload as GetVideoDetailResponse;
}

export async function putClipMetadata(
  request: PutClipMetadataRequest,
): Promise<PutClipMetadataResponse> {
  const response = await fetch("/api/clips/metadata", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The clip metadata could not be saved.");
  }

  return payload as PutClipMetadataResponse;
}

export async function putVideoMetadata(
  request: PutVideoMetadataRequest,
): Promise<PutVideoMetadataResponse> {
  const response = await fetch("/api/videos/metadata", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The video metadata could not be saved.");
  }

  return payload as PutVideoMetadataResponse;
}

export async function saveSplitPlan(
  request: SaveSplitPlanRequest,
): Promise<SaveSplitPlanResponse> {
  const response = await fetch("/api/videos/split-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The split plan could not be saved.");
  }

  return payload as SaveSplitPlanResponse;
}

export async function scanMedia(rootPath: string): Promise<ScanMediaResponse> {
  const response = await fetch("/api/media/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The media folder could not be scanned.");
  }

  return payload as ScanMediaResponse;
}
