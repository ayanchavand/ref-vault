export interface ValidateLibraryRootRequest {
  rootPath: string;
}

export interface InitLibraryRequest {
  targetPath: string;
}

export interface InitLibraryResponse {
  success: boolean;
  videoPath: string;
  mediaPath: string;
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
  metadata?: JsonObject;
}

export interface ScannedVideo {
  relativePath: string;
  mainVideoPath: string;
  metadataPath?: string;
  metadata?: JsonObject;
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
  width?: number;
  height?: number;
  framerate?: string;
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

// ─── Media (Tinder-style) browser types ──────────────────────────────────────

export interface ScanMediaRequest {
  rootPath: string;
}

export type ScannedMediaType = "image" | "gif" | "video";

export interface ScannedMediaItem {
  /** Path relative to the scanned rootPath */
  relativePath: string;
  /** Inferred media type */
  type: ScannedMediaType;
  /** Byte size of the file */
  sizeBytes: number;
}

export interface ScanMediaResponse {
  rootPath: string;
  items: ScannedMediaItem[];
}

// ─── Error codes ──────────────────────────────────────────────────────────────

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
  | "THUMBNAIL_GENERATION_FAILED"
  | "MEDIA_SCAN_FAILED"
  | "FRAME_CAPTURE_FAILED"
  | "CONFIG_READ_FAILED"
  | "CONFIG_WRITE_FAILED";

export interface ApiErrorResponse {
  error: LibraryRootValidationErrorCode;
  message: string;
  path?: string;
}

export interface DeleteClipRequest {
  rootPath: string;
  videoRelativePath: string;
  clipMediaPath: string;
}

export interface DeleteClipResponse {
  success: boolean;
}

export interface CreateVideoPlaceholderRequest {
  rootPath: string;
  title: string;
  artist?: string;
  tags?: string[];
  notes?: string;
  rating?: number;
}

export interface CreateVideoPlaceholderResponse {
  success: boolean;
  videoRelativePath: string;
}

export interface DeleteVideoRequest {
  rootPath: string;
  videoRelativePath: string;
}

export interface DeleteVideoResponse {
  success: boolean;
}

export interface CaptureFrameRequest {
  rootPath: string;
  mediaPath: string;
  timestamp: number;
  mediaRootPath?: string;
}

export interface CaptureFrameResponse {
  success: boolean;
  savedPath: string;
}

// ─── Library Configuration Types ──────────────────────────────────────────────

export interface LibraryConfigField {
  name: string;
  type: "video" | "clip";
  isMulti: boolean;
  values: string[];
}

export interface LibraryConfig {
  fields: LibraryConfigField[];
}

export interface GetLibraryConfigRequest {
  rootPath: string;
}

export interface GetLibraryConfigResponse {
  config: LibraryConfig;
}

export interface PutLibraryConfigRequest {
  rootPath: string;
  config: LibraryConfig;
}

export interface PutLibraryConfigResponse {
  success: boolean;
  config: LibraryConfig;
}


