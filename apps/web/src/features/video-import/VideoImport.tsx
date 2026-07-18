import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createVideoPlaceholder, uploadVideo, ApiError } from "../../lib/api";
import { navigate } from "../../lib/router";

interface VideoImportProps {
  rootPath: string;
  onImportSuccess(): void;
  onBack(): void;
}

export function VideoImport({ rootPath, onImportSuccess, onBack }: VideoImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [importStep, setImportStep] = useState<"idle" | "creating_folders" | "uploading_video" | "done">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Clean up Object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  const handleFileChange = (selectedFile: File) => {
    if (!selectedFile.type.startsWith("video/")) {
      setErrorMessage("Only video files (mp4, webm, etc.) are supported.");
      return;
    }
    setErrorMessage(null);
    setFile(selectedFile);

    // Auto-fill title from filename (minus extension)
    const lastDotIndex = selectedFile.name.lastIndexOf(".");
    const suggestedTitle =
      lastDotIndex !== -1
        ? selectedFile.name.substring(0, lastDotIndex)
        : selectedFile.name;
    setTitle(suggestedTitle);

    // Create local video preview URL
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const onDragOverHandler = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeaveHandler = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onDropHandler = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]!);
    }
  }, [videoPreviewUrl]);

  const handleAreaClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileChange(e.target.files[0]!);
    }
  };

  const handleClearVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setTitle("");
    setVideoPreviewUrl(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMessage("Please drop or select a video file first.");
      return;
    }
    if (!title.trim()) {
      setErrorMessage("Title is required.");
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    setUploadPercent(0);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      // Step 1: Create placeholder folders and save metadata
      setImportStep("creating_folders");
      const placeholder = await createVideoPlaceholder({
        rootPath,
        title,
        artist,
        tags,
        notes,
        rating,
      });

      // Step 2: Stream video file upload
      setImportStep("uploading_video");
      await uploadVideo(
        rootPath,
        placeholder.videoRelativePath,
        file,
        (percent) => {
          setUploadPercent(percent);
        }
      );

      setImportStep("done");
      // Give a tiny moment to let user see 100% completion before returning
      setTimeout(() => {
        onImportSuccess();
      }, 500);
    } catch (err) {
      setImportStep("idle");
      setIsImporting(false);
      setErrorMessage(err instanceof ApiError ? err.message : "Failed to import video.");
    }
  };

  const formattedFileSize = useMemo(() => {
    if (!file) return "";
    const size = file.size;
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }, [file]);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full relative">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] px-5 py-4 flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(232,163,61,0.7)]" />
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
              03 · Add reference
            </p>
            <p className="mt-1 font-mono text-sm text-white/50">Import video to library</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          disabled={isImporting}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs sm:text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300"
        >
          {errorMessage}
        </p>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-[1fr_0.9fr]">
        {/* Left Side: Drag & Drop Zone */}
        <div className="flex flex-col gap-3">
          <label className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
            Reference Video File
          </label>
          <input
            id="video-file-picker"
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept="video/*"
            className="hidden"
            disabled={isImporting}
          />
          <div
            onDragOver={onDragOverHandler}
            onDragLeave={onDragLeaveHandler}
            onDrop={onDropHandler}
            onClick={!file && !isImporting ? handleAreaClick : undefined}
            className={`relative flex flex-col items-center justify-center min-h-[350px] rounded-2xl border transition-all duration-300 ${
              file ? "border-white/[0.08] bg-[#111316]/20" : "border-dashed border-white/20 bg-[#111316]/40 hover:border-amber-400/50 hover:bg-[#111316]/60 cursor-pointer"
            } ${isDragOver ? "border-amber-400 bg-amber-400/[0.02] scale-[0.99]" : ""}`}
          >
            {file ? (
              <div className="w-full h-full flex flex-col p-4">
                {videoPreviewUrl ? (
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/[0.04]">
                    <video
                      src={videoPreviewUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={handleClearVideo}
                      disabled={isImporting}
                      className="absolute top-3 right-3 rounded-full bg-black/70 hover:bg-black p-2 text-white/70 hover:text-white transition duration-200"
                      title="Remove video"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="aspect-video w-full flex items-center justify-center bg-black/40 rounded-xl">
                    <span className="font-mono text-xs text-white/40">Loading preview…</span>
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-1 border-t border-white/[0.04] pt-3">
                  <p className="truncate font-semibold text-white/90 text-sm">{file.name}</p>
                  <div className="flex justify-between font-mono text-[0.65rem] text-white/40">
                    <span>{formattedFileSize}</span>
                    <span>{file.type || "video/mp4"}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-8 text-center pointer-events-none">
                <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center text-white/30 border border-white/[0.04]">
                  ↓
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white/80">
                    Drag and drop your reference video
                  </p>
                  <p className="text-xs text-white/40 font-mono">
                    or click to browse local files
                  </p>
                </div>
                <p className="text-[0.65rem] text-amber-300/40 font-mono mt-2">
                  MP4, WebM, or MOV formats supported
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Metadata Form */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h3 className="font-mono text-xs uppercase tracking-wider text-amber-300">
              Metadata Details
            </h3>
            <p className="text-[0.68rem] text-white/40">
              Vault folders and metadata.json are created in place.
            </p>
          </div>

          <div className="space-y-4 flex-1">
            {/* Title Field */}
            <div className="space-y-1.5">
              <label htmlFor="video-title" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                Title <span className="text-amber-400">*</span>
              </label>
              <input
                id="video-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Reference name..."
                required
                disabled={isImporting}
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2 text-sm text-white placeholder-white/20 transition focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 disabled:opacity-50"
              />
            </div>

            {/* Artist Field */}
            <div className="space-y-1.5">
              <label htmlFor="video-artist" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                Artist / Studio
              </label>
              <input
                id="video-artist"
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Creator..."
                disabled={isImporting}
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2 text-sm text-white placeholder-white/20 transition focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 disabled:opacity-50"
              />
            </div>

            {/* Rating Field */}
            <div className="space-y-1.5">
              <span className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                Rating
              </span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    disabled={isImporting}
                    className={`text-2xl transition-all duration-300 focus:outline-none hover:scale-125 active:scale-90 ${
                      star <= rating
                        ? "text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]"
                        : "text-white/20 hover:text-amber-400/50"
                    }`}
                  >
                    ★
                  </button>
                ))}
                {rating > 0 && (
                  <button
                    type="button"
                    onClick={() => setRating(0)}
                    disabled={isImporting}
                    className="ml-2 font-mono text-[0.65rem] uppercase tracking-widest text-white/30 hover:text-white/60 focus:outline-none focus:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Tags Field */}
            <div className="space-y-1.5">
              <label htmlFor="video-tags" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                Tags (comma separated)
              </label>
              <input
                id="video-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="cinematic, lighting, animation..."
                disabled={isImporting}
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2 text-sm text-white placeholder-white/20 transition focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 disabled:opacity-50"
              />
            </div>

            {/* Notes Field */}
            <div className="space-y-1.5">
              <label htmlFor="video-notes" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                Notes / Reference Log
              </label>
              <textarea
                id="video-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations, details, description..."
                disabled={isImporting}
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2 text-sm text-white placeholder-white/20 transition focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 disabled:opacity-50 resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!file || !title.trim() || isImporting}
            className="w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-[#0A0B0D] shadow-[0_4px_12px_rgba(251,191,36,0.3)] transition duration-300 hover:bg-amber-300 hover:shadow-[0_6px_20px_rgba(251,191,36,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-amber-400 disabled:shadow-none disabled:active:scale-100"
          >
            Import Reference
          </button>
        </div>
      </form>

      {/* Upload Progress Overlay */}
      {isImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[90%] max-w-md rounded-2xl border border-white/10 bg-[#111316] p-6 shadow-2xl flex flex-col items-center gap-4 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-3 border-amber-400/30 border-t-amber-400" />
            <div className="space-y-1.5">
              <h4 className="text-md font-semibold text-white">
                {importStep === "creating_folders"
                  ? "Initializing directory structure"
                  : importStep === "uploading_video"
                    ? "Uploading reference video"
                    : "Finalizing import"}
              </h4>
              <p className="text-xs text-white/50">
                {importStep === "creating_folders"
                  ? "Creating folders and writing metadata.json..."
                  : importStep === "uploading_video"
                    ? `Piping media stream... ${uploadPercent}%`
                    : "Import completed successfully!"}
              </p>
            </div>

            {importStep === "uploading_video" && (
              <div className="w-full space-y-2 mt-2">
                {/* Horizontal Progress Bar */}
                <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-400 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
                <span className="font-mono text-[0.65rem] text-white/30">
                  {uploadPercent}% uploaded
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
