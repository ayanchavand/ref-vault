package models

type ValidateLibraryRootRequest struct {
	RootPath string `json:"rootPath"`
}

type ValidateLibraryRootResponse struct {
	RootPath string `json:"rootPath"`
}

type InitLibraryRequest struct {
	TargetPath string `json:"targetPath"`
}

type InitLibraryResponse struct {
	Success   bool   `json:"success"`
	VideoPath string `json:"videoPath"`
	MediaPath string `json:"mediaPath"`
}

type ScanLibraryRequest struct {
	RootPath string `json:"rootPath"`
}

type ScannedClip struct {
	MediaPath    string                 `json:"mediaPath"`
	MetadataPath string                 `json:"metadataPath,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

type ScannedVideo struct {
	RelativePath      string                 `json:"relativePath"`
	MainVideoPath     string                 `json:"mainVideoPath"`
	MetadataPath      string                 `json:"metadataPath,omitempty"`
	Metadata          map[string]interface{} `json:"metadata,omitempty"`
	ThumbnailPath     string                 `json:"thumbnailPath,omitempty"`
	ClipsMetadataPath string                 `json:"clipsMetadataPath,omitempty"`
	Clips             []ScannedClip          `json:"clips"`
}

type ScanLibraryResponse struct {
	RootPath string         `json:"rootPath"`
	Videos   []ScannedVideo `json:"videos"`
}

type GetVideoDetailRequest struct {
	RootPath          string `json:"rootPath"`
	VideoRelativePath string `json:"videoRelativePath"`
}

type VideoDetail struct {
	RelativePath      string                 `json:"relativePath"`
	MainVideoPath     string                 `json:"mainVideoPath"`
	Metadata          map[string]interface{} `json:"metadata,omitempty"`
	ThumbnailPath     string                 `json:"thumbnailPath,omitempty"`
	ClipsMetadataPath string                 `json:"clipsMetadataPath,omitempty"`
	Clips             []ScannedClip          `json:"clips"`
	Width             *int                   `json:"width,omitempty"`
	Height            *int                   `json:"height,omitempty"`
	Framerate         *string                `json:"framerate,omitempty"`
}

type GetVideoDetailResponse struct {
	RootPath string      `json:"rootPath"`
	Video    VideoDetail `json:"video"`
}

type PutClipMetadataRequest struct {
	RootPath          string                 `json:"rootPath"`
	VideoRelativePath string                 `json:"videoRelativePath"`
	ClipMediaPath     string                 `json:"clipMediaPath"`
	Metadata          map[string]interface{} `json:"metadata"`
}

type PutClipMetadataResponse struct {
	MetadataPath string                 `json:"metadataPath"`
	Metadata     map[string]interface{} `json:"metadata"`
}

type PutVideoMetadataRequest struct {
	RootPath          string                 `json:"rootPath"`
	VideoRelativePath string                 `json:"videoRelativePath"`
	Metadata          map[string]interface{} `json:"metadata"`
}

type PutVideoMetadataResponse struct {
	MetadataPath string                 `json:"metadataPath"`
	Metadata     map[string]interface{} `json:"metadata"`
}

type SplitSegment struct {
	Start  float64  `json:"start"`
	End    float64  `json:"end"`
	Tags   []string `json:"tags"`
	Notes  *string  `json:"notes,omitempty"`
	Rating *float64 `json:"rating,omitempty"`
}

type SaveSplitPlanRequest struct {
	RootPath          string         `json:"rootPath"`
	VideoRelativePath string         `json:"videoRelativePath"`
	Segments          []SplitSegment `json:"segments"`
}

type SaveSplitPlanResponse struct {
	SplitPlanPath string `json:"splitPlanPath"`
	Success       bool   `json:"success"`
}

type ScanMediaRequest struct {
	RootPath string `json:"rootPath"`
}

type ScannedMediaItem struct {
	RelativePath string   `json:"relativePath"`
	Type         string   `json:"type"`
	SizeBytes    int64    `json:"sizeBytes"`
	Tags         []string `json:"tags"`
}

type ScanMediaResponse struct {
	RootPath string             `json:"rootPath"`
	Items    []ScannedMediaItem `json:"items"`
}

type ApiErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Path    string `json:"path,omitempty"`
}

type DeleteClipRequest struct {
	RootPath          string `json:"rootPath"`
	VideoRelativePath string `json:"videoRelativePath"`
	ClipMediaPath     string `json:"clipMediaPath"`
}

type DeleteClipResponse struct {
	Success bool `json:"success"`
}

type CreateVideoPlaceholderRequest struct {
	RootPath string   `json:"rootPath"`
	Title    string   `json:"title"`
	Artist   *string  `json:"artist,omitempty"`
	Tags     []string `json:"tags,omitempty"`
	Notes    *string  `json:"notes,omitempty"`
	Rating   *float64 `json:"rating,omitempty"`
}

type CreateVideoPlaceholderResponse struct {
	Success           bool   `json:"success"`
	VideoRelativePath string `json:"videoRelativePath"`
}

type DeleteVideoRequest struct {
	RootPath          string `json:"rootPath"`
	VideoRelativePath string `json:"videoRelativePath"`
}

type DeleteVideoResponse struct {
	Success bool `json:"success"`
}

type DeleteMediaRequest struct {
	RootPath          string `json:"rootPath"`
	MediaRelativePath string `json:"mediaRelativePath"`
}

type DeleteMediaResponse struct {
	Success bool `json:"success"`
}

type CaptureFrameRequest struct {
	RootPath      string  `json:"rootPath"`
	MediaPath     string  `json:"mediaPath"`
	Timestamp     float64 `json:"timestamp"`
	MediaRootPath *string `json:"mediaRootPath,omitempty"`
}

type CaptureFrameResponse struct {
	Success   bool   `json:"success"`
	SavedPath string `json:"savedPath"`
}

type LibraryConfigField struct {
	Name    string   `json:"name"`
	Type    string   `json:"type"`
	IsMulti bool     `json:"isMulti"`
	Values  []string `json:"values"`
}

type LibraryConfig struct {
	Fields []LibraryConfigField `json:"fields"`
}

type GetLibraryConfigRequest struct {
	RootPath string `json:"rootPath"`
}

type GetLibraryConfigResponse struct {
	Config LibraryConfig `json:"config"`
}

type PutLibraryConfigRequest struct {
	RootPath string        `json:"rootPath"`
	Config   LibraryConfig `json:"config"`
}

type PutLibraryConfigResponse struct {
	Success bool          `json:"success"`
	Config  LibraryConfig `json:"config"`
}

type CategorizeMediaRequest struct {
	RootPath          string  `json:"rootPath"`
	MediaRelativePath string  `json:"mediaRelativePath"`
	Category          *string `json:"category"`
}

type CategorizeMediaResponse struct {
	Success         bool     `json:"success"`
	NewRelativePath string   `json:"newRelativePath"`
	Tags            []string `json:"tags"`
}

type GenerateThumbnailRequest struct {
	RootPath          string `json:"rootPath"`
	VideoRelativePath string `json:"videoRelativePath"`
}

type GenerateThumbnailResponse struct {
	Success       bool   `json:"success"`
	ThumbnailPath string `json:"thumbnailPath"`
}
