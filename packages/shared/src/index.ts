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
  clipsMetadataPath?: string;
  clips: ScannedClip[];
}

export interface ScanLibraryResponse {
  rootPath: string;
  videos: ScannedVideo[];
}

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface GetVideoDetailRequest {
  rootPath: string;
  videoRelativePath: string;
}

export interface DetailedClip extends ScannedClip {
  metadata?: JsonObject;
}

export interface VideoDetail {
  relativePath: string;
  mainVideoPath: string;
  metadata?: JsonObject;
  thumbnailPath?: string;
  clipsMetadataPath?: string;
  clips: DetailedClip[];
}

export interface GetVideoDetailResponse {
  rootPath: string;
  video: VideoDetail;
}

export interface PutClipMetadataRequest {
  rootPath: string;
  videoRelativePath: string;
  clipMediaPath: string;
  metadata: JsonObject;
}

export interface PutClipMetadataResponse {
  metadataPath: string;
  metadata: JsonObject;
}

export interface PutVideoMetadataRequest {
  rootPath: string;
  videoRelativePath: string;
  metadata: JsonObject;
}

export interface PutVideoMetadataResponse {
  metadataPath: string;
  metadata: JsonObject;
}

export interface SaveSplitPlanRequest {
  rootPath: string;
  videoRelativePath: string;
  segments: {
    start: number;
    end: number;
    tags: string[];
    notes?: string;
    rating?: number;
  }[];
}

export interface SaveSplitPlanResponse {
  splitPlanPath: string;
  success: boolean;
}

export type LibraryRootValidationErrorCode =
  | "INVALID_LIBRARY_ROOT"
  | "LIBRARY_ROOT_NOT_FOUND"
  | "LIBRARY_ROOT_NOT_ACCESSIBLE"
  | "LIBRARY_SCAN_FAILED"
  | "INVALID_VIDEO_PATH"
  | "VIDEO_NOT_FOUND"
  | "INVALID_METADATA_JSON"
  | "METADATA_READ_FAILED"
  | "INVALID_CLIP_PATH"
  | "CLIP_NOT_FOUND"
  | "MEDIA_NOT_FOUND"
  | "METADATA_WRITE_FAILED"
  | "INVALID_MEDIA_TYPE"
  | "THUMBNAIL_GENERATION_FAILED";

export interface ApiErrorResponse {
  error: LibraryRootValidationErrorCode;
  message: string;
  path?: string;
}
