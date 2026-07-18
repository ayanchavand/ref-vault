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
  DeleteClipRequest,
  DeleteClipResponse,
  CreateVideoPlaceholderRequest,
  CreateVideoPlaceholderResponse,
  DeleteVideoRequest,
  DeleteVideoResponse,
  CaptureFrameRequest,
  CaptureFrameResponse,
  InitLibraryRequest,
  InitLibraryResponse,
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

export async function deleteClip(
  request: DeleteClipRequest,
): Promise<DeleteClipResponse> {
  const response = await fetch("/api/clips/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The clip could not be deleted.");
  }

  return payload as DeleteClipResponse;
}

export async function createVideoPlaceholder(
  request: CreateVideoPlaceholderRequest,
): Promise<CreateVideoPlaceholderResponse> {
  const response = await fetch("/api/videos/create-placeholder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The video directory could not be created.");
  }

  return payload as CreateVideoPlaceholderResponse;
}

export function uploadVideo(
  rootPath: string,
  videoRelativePath: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ success: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `/api/videos/upload?rootPath=${encodeURIComponent(
      rootPath,
    )}&videoRelativePath=${encodeURIComponent(videoRelativePath)}`;

    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          resolve({ success: true });
        }
      } else {
        let errorMessage = "The video file could not be uploaded.";
        try {
          const error = JSON.parse(xhr.responseText) as ApiErrorResponse;
          errorMessage = error.message || errorMessage;
        } catch {
          // Keep default
        }
        reject(new ApiError(errorMessage));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError("A network error occurred during the upload."));
    };

    xhr.send(file);
  });
}

export async function deleteVideo(
  request: DeleteVideoRequest,
): Promise<DeleteVideoResponse> {
  const response = await fetch("/api/videos/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The video directory could not be deleted.");
  }

  return payload as DeleteVideoResponse;
}

export function uploadMediaFile(
  rootPath: string,
  fileName: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ success: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `/api/media/upload?rootPath=${encodeURIComponent(
      rootPath,
    )}&fileName=${encodeURIComponent(fileName)}`;

    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          resolve({ success: true });
        }
      } else {
        let errorMessage = "The media file could not be uploaded.";
        try {
          const error = JSON.parse(xhr.responseText) as ApiErrorResponse;
          errorMessage = error.message || errorMessage;
        } catch {
          // Keep default
        }
        reject(new ApiError(errorMessage));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError("A network error occurred during the upload."));
    };

    xhr.send(file);
  });
}

export async function captureFrame(
  request: CaptureFrameRequest,
): Promise<CaptureFrameResponse> {
  const response = await fetch("/api/videos/capture-frame", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The frame could not be captured.");
  }

  return payload as CaptureFrameResponse;
}

export async function initLibrary(
  request: InitLibraryRequest,
): Promise<InitLibraryResponse> {
  const response = await fetch("/api/library/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = payload as ApiErrorResponse;
    throw new ApiError(error.message || "The library directory structure could not be initialized.");
  }

  return payload as InitLibraryResponse;
}



