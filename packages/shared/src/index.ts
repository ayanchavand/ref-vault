export interface ValidateLibraryRootRequest {
  rootPath: string;
}

export interface ValidateLibraryRootResponse {
  rootPath: string;
}

export interface ScanLibraryRequest {
  rootPath: string;
}

export interface ScannedClip {
  mediaPath: string;
  metadataPath?: string;
}

export interface ScannedVideo {
  relativePath: string;
  mainVideoPath: string;
  metadataPath?: string;
  thumbnailPath?: string;
  clips: ScannedClip[];
}

export interface ScanLibraryResponse {
  rootPath: string;
  videos: ScannedVideo[];
}

export type LibraryRootValidationErrorCode =
  | "INVALID_LIBRARY_ROOT"
  | "LIBRARY_ROOT_NOT_FOUND"
  | "LIBRARY_ROOT_NOT_ACCESSIBLE"
  | "LIBRARY_SCAN_FAILED";

export interface ApiErrorResponse {
  error: LibraryRootValidationErrorCode;
  message: string;
}
