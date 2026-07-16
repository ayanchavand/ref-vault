export interface ValidateLibraryRootRequest {
  rootPath: string;
}

export interface ValidateLibraryRootResponse {
  rootPath: string;
}

export type LibraryRootValidationErrorCode =
  | "INVALID_LIBRARY_ROOT"
  | "LIBRARY_ROOT_NOT_FOUND"
  | "LIBRARY_ROOT_NOT_ACCESSIBLE";

export interface ApiErrorResponse {
  error: LibraryRootValidationErrorCode;
  message: string;
}
