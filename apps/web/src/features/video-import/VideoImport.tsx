import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { UploadCloud } from "lucide-react";
import { createVideoPlaceholder, uploadVideo, uploadMediaFile, putVideoMetadata, ApiError } from "../../lib/api";
import { navigate } from "../../lib/router";
import type { LibraryConfig, LibraryConfigField, JsonObject } from "@reference-vault/shared";

interface VideoImportProps {
  rootPath: string;
  onImportSuccess(): void;
  onBack(): void;
  libraryConfig?: LibraryConfig;
}



export function VideoImport({ rootPath, onImportSuccess, onBack, libraryConfig }: VideoImportProps) {
  const [importType, setImportType] = useState<"video" | "media">("video");
  const mediaRoot = useMemo(() => window.localStorage.getItem("reference-vault.media-root") || "", []);

  const [files, setFiles] = useState<File[]>([]);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [uploadingFileIndex, setUploadingFileIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [structuredFields, setStructuredFields] = useState<Record<string, string | string[]>>({});

  const configuredVideoFields = useMemo(() => {
    return libraryConfig?.fields.filter((f: LibraryConfigField) => f.type === "video") ?? [];
  }, [libraryConfig]);

  useEffect(() => {
    const initial: Record<string, string | string[]> = {};
    configuredVideoFields.forEach((field) => {
      initial[field.name] = field.isMulti ? [] : "";
    });
    setStructuredFields(initial);
  }, [configuredVideoFields]);

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

  const handleFilesChange = async (selectedFiles: File[]) => {
    setErrorMessage(null);

    if (importType === "video") {
      const selectedFile = selectedFiles[0];
      if (!selectedFile) return;

      if (!selectedFile.type.startsWith("video/")) {
        setErrorMessage("Only video files (mp4, webm, etc.) are supported.");
        return;
      }

      setFiles([selectedFile]);

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
    } else {
      // Media Asset import supporting gif, video, images
      const validFiles: File[] = [];
      const invalidNames: string[] = [];

      for (const f of selectedFiles) {
        const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
        const isSupported = [
          ".gif",
          ".mp4", ".webm", ".mov",
          ".jpg", ".jpeg", ".png", ".webp", ".avif"
        ].includes(ext);

        if (isSupported) {
          validFiles.push(f);
        } else {
          invalidNames.push(f.name);
        }
      }

      if (invalidNames.length > 0) {
        setErrorMessage(`Some files were skipped (unsupported type): ${invalidNames.join(", ")}`);
      }

      if (validFiles.length > 0) {
        setFiles((prev) => {
          const existingNames = new Set(prev.map((x) => x.name));
          const newFiles = validFiles.filter((x) => !existingNames.has(x.name));
          const updated = [...prev, ...newFiles];

          if (updated.length === 1) {
            if (videoPreviewUrl) {
              URL.revokeObjectURL(videoPreviewUrl);
            }
            setVideoPreviewUrl(URL.createObjectURL(updated[0]!));
          }
          return updated;
        });
      }
    }
  };

  const handleRemoveFileAtIndex = (indexToRemove: number) => {
    setFiles((prev) => {
      const updated = prev.filter((_, idx) => idx !== indexToRemove);
      if (updated.length === 1) {
        if (videoPreviewUrl) {
          URL.revokeObjectURL(videoPreviewUrl);
        }
        setVideoPreviewUrl(URL.createObjectURL(updated[0]!));
      } else if (updated.length === 0) {
        if (videoPreviewUrl) {
          URL.revokeObjectURL(videoPreviewUrl);
          setVideoPreviewUrl(null);
        }
      }
      return updated;
    });
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
      const selectedFiles = Array.from(e.dataTransfer.files);
      handleFilesChange(selectedFiles);
    }
  }, [videoPreviewUrl, importType, files]);

  const handleAreaClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      handleFilesChange(selectedFiles);
    }
  };

  const handleClearVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles([]);
    setTitle("");
    setVideoPreviewUrl(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setErrorMessage("Please drop or select a file first.");
      return;
    }

    if (importType === "media") {
      setIsImporting(true);
      setErrorMessage(null);
      setUploadPercent(0);
      setImportStep("uploading_video");

      try {
        for (let i = 0; i < files.length; i++) {
          const currentFile = files[i]!;
          setUploadingFileName(currentFile.name);
          setUploadingFileIndex(i);

          await uploadMediaFile(
            rootPath,
            currentFile.name,
            currentFile,
            (percent) => {
              const overallPercent = Math.round(((i + percent / 100) / files.length) * 100);
              setUploadPercent(overallPercent);
            }
          );
        }

        setImportStep("done");
        setTimeout(() => {
          onImportSuccess();
        }, 500);
      } catch (err) {
        setImportStep("idle");
        setIsImporting(false);
        setErrorMessage(err instanceof ApiError ? err.message : "Failed to upload media asset.");
      }
      return;
    }

    // Video reference import
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
      setImportStep("creating_folders");
      const placeholder = await createVideoPlaceholder({
        rootPath,
        title,
        artist,
        tags,
        notes,
        rating,
      });

      const hasCustomFields = Object.keys(structuredFields).some((k) => {
        const val = structuredFields[k];
        return Array.isArray(val) ? val.length > 0 : !!val;
      });

      if (hasCustomFields) {
        const fullMetadata: JsonObject = {
          tags,
        };
        if (notes) fullMetadata.notes = notes;
        if (artist) fullMetadata.artist = artist;
        if (rating) fullMetadata.rating = rating;

        configuredVideoFields.forEach((field) => {
          const val = structuredFields[field.name];
          if (field.isMulti) {
            const arr = Array.isArray(val) ? val : [];
            if (arr.length > 0) {
              fullMetadata[field.name] = arr;
            }
          } else {
            const str = typeof val === "string" ? val : "";
            if (str) {
              fullMetadata[field.name] = str;
            }
          }
        });

        await putVideoMetadata({
          rootPath,
          videoRelativePath: placeholder.videoRelativePath,
          metadata: fullMetadata,
        });
      }

      setImportStep("uploading_video");
      await uploadVideo(
        rootPath,
        placeholder.videoRelativePath,
        files[0]!,
        (percent) => {
          setUploadPercent(percent);
        }
      );

      setImportStep("done");
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
    if (files.length === 0) return "";
    const size = files[0]!.size;
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }, [files]);

  const isImageOrGif = useMemo(() => {
    if (files.length === 0) return false;
    const ext = files[0]!.name.substring(files[0]!.name.lastIndexOf(".")).toLowerCase();
    return [".gif", ".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext);
  }, [files]);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full relative">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(232,163,61,0.7)]" />
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
              03 · Add reference
            </p>
            <p className="mt-1 font-mono text-sm text-white/50">
              {importType === "video" ? "Import video reference" : "Import media asset directly"}
            </p>
          </div>
        </div>

        {/* Switch toggle for import type */}
        <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => {
              setImportType("video");
              setFiles([]);
              setVideoPreviewUrl(null);
              setErrorMessage(null);
            }}
            className={`rounded-md px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-widest transition active:scale-[0.98] ${
              importType === "video"
                ? "bg-amber-400 font-semibold text-[#0A0B0D]"
                : "text-white/60 hover:text-white"
            }`}
          >
            Video Reference
          </button>
          <button
            type="button"
            onClick={() => {
              setImportType("media");
              setFiles([]);
              setVideoPreviewUrl(null);
              setErrorMessage(null);
            }}
            className={`rounded-md px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-widest transition active:scale-[0.98] ${
              importType === "media"
                ? "bg-amber-400 font-semibold text-[#0A0B0D]"
                : "text-white/60 hover:text-white"
            }`}
          >
            Media Asset
          </button>
        </div>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300"
        >
          {errorMessage}
        </p>
      )}

      {importType === "media" && !mediaRoot && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-300">
          ⚠️ Media library path is not configured. Set up a Media folder in settings to upload media assets.
        </div>
      )}

      {importType === "media" && mediaRoot && (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "16px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "16px",
            maxWidth: "672px",
            marginLeft: "auto",
            marginRight: "auto",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>📁</span>
            <span style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: 700, color: "#f0c060", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Media Library Directories
            </span>
          </div>
          <p style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.45)", margin: 0, lineHeight: "1.4" }}>
            In the media system, tags are generated implicitly based on subdirectories. Imported files are stored by file type in these folders:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "9px", fontWeight: 600, color: "rgba(255, 255, 255, 0.3)", textTransform: "uppercase", fontFamily: "monospace" }}>
                📸 Images Folder:
              </span>
              <code style={{ fontSize: "11px", fontFamily: "monospace", color: "#4ade80", wordBreak: "break-all", background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: "6px" }}>
                {mediaRoot + "/images"}
              </code>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "9px", fontWeight: 600, color: "rgba(255, 255, 255, 0.3)", textTransform: "uppercase", fontFamily: "monospace" }}>
                🎞️ GIFs Folder:
              </span>
              <code style={{ fontSize: "11px", fontFamily: "monospace", color: "#c084fc", wordBreak: "break-all", background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: "6px" }}>
                {mediaRoot + "/gifs"}
              </code>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "9px", fontWeight: 600, color: "rgba(255, 255, 255, 0.3)", textTransform: "uppercase", fontFamily: "monospace" }}>
                🎥 Videos Folder:
              </span>
              <code style={{ fontSize: "11px", fontFamily: "monospace", color: "#60a5fa", wordBreak: "break-all", background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: "6px" }}>
                {mediaRoot + "/videos"}
              </code>
            </div>
          </div>
          <p style={{ fontSize: "10px", color: "rgba(240, 192, 96, 0.7)", fontStyle: "italic", margin: "6px 0 0 0", lineHeight: "1.4" }}>
            💡 Tip: Create subdirectories inside these folders (e.g. <code style={{ fontSize: "10px", fontFamily: "monospace", color: "#f0c060" }}>/images/Lighting/Studio/</code>) and place your reference files there to automatically generate implicit tags and subtags in the browser!
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={importType === "video" ? "grid gap-6 md:grid-cols-[1fr_0.9fr]" : "flex flex-col gap-5 max-w-2xl mx-auto w-full"}>
        {/* Left Side: Drag & Drop Zone */}
        <div className="flex flex-col gap-3">
          <label className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
            {importType === "video" ? "Reference Video File" : "Media Asset Files"}
          </label>
          <input
            id="video-file-picker"
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept={importType === "video" ? "video/*" : "image/*,video/*,.gif"}
            className="hidden"
            multiple={importType === "media"}
            disabled={isImporting || (importType === "media" && !mediaRoot)}
          />
          <div
            onDragOver={onDragOverHandler}
            onDragLeave={onDragLeaveHandler}
            onDrop={onDropHandler}
            onClick={files.length === 0 && !isImporting && (importType === "video" || mediaRoot) ? handleAreaClick : undefined}
            className={`relative flex flex-col items-center justify-center min-h-[350px] rounded-2xl border transition-all duration-300 ${
              files.length > 0 ? "border-white/[0.08] bg-[#111316]/20" : "border-dashed border-white/20 bg-[#111316]/40 hover:border-amber-400/50 hover:bg-[#111316]/60 cursor-pointer"
            } ${isDragOver ? "border-amber-400 bg-amber-400/[0.02] scale-[0.99]" : ""} ${importType === "media" && !mediaRoot ? "opacity-30 cursor-not-allowed pointer-events-none" : ""}`}
          >
            {files.length > 0 ? (
              <div className="w-full h-full flex flex-col p-4 gap-4">
                {files.length === 1 ? (
                  <>
                    {videoPreviewUrl ? (
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/[0.04] flex items-center justify-center">
                        {isImageOrGif ? (
                          <img
                            src={videoPreviewUrl}
                            alt="Preview"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <video
                            src={videoPreviewUrl}
                            controls
                            className="w-full h-full object-contain"
                          />
                        )}
                        <button
                          type="button"
                          onClick={handleClearVideo}
                          disabled={isImporting}
                          className="absolute top-3 right-3 rounded-full bg-black/70 hover:bg-black p-2 text-white/70 hover:text-white transition duration-200"
                          title="Remove preview"
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
                      <p className="truncate font-semibold text-white/90 text-sm">{files[0]!.name}</p>
                      <div className="flex justify-between font-mono text-[0.65rem] text-white/40">
                        <span>{formattedFileSize}</span>
                        <span>{files[0]!.type || "file"}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col flex-1 w-full min-h-[250px] max-h-[400px]">
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-white/50 uppercase tracking-wider">
                          Selected Files ({files.length})
                        </span>
                        <button
                          type="button"
                          onClick={handleAreaClick}
                          disabled={isImporting}
                          className="text-xs text-amber-400 hover:text-amber-300 transition font-semibold"
                        >
                          + Add More
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearVideo}
                        disabled={isImporting}
                        className="text-xs text-rose-400 hover:text-rose-300 transition"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1 no-scrollbar">
                      {files.map((f, idx) => {
                        const sizeStr = f.size < 1024 * 1024
                          ? `${(f.size / 1024).toFixed(1)} KB`
                          : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
                        const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
                        const isImg = [".gif", ".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext);

                        return (
                          <div
                            key={`${f.name}-${idx}`}
                            className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 transition hover:bg-white/[0.04]"
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <span className="text-lg shrink-0">
                                {ext === ".gif" ? "🎞️" : isImg ? "🖼️" : "🎥"}
                              </span>
                              <div className="flex flex-col overflow-hidden">
                                <span className="truncate text-xs font-semibold text-white/80">{f.name}</span>
                                <span className="font-mono text-[0.6rem] text-white/30">{sizeStr}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isImporting}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFileAtIndex(idx);
                              }}
                              className="text-white/40 hover:text-rose-400 p-1.5 transition rounded-lg hover:bg-white/[0.04]"
                              title="Remove file"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-8 text-center pointer-events-none">
                <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center text-white/30 border border-white/[0.04]">
                  <UploadCloud className="h-6 w-6 text-white/40" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white/80">
                    Drag and drop your file here
                  </p>
                  <p className="text-xs text-white/40 font-mono">
                    or click to browse local files
                  </p>
                </div>
                <p className="text-[0.65rem] text-amber-300/40 font-mono mt-2">
                  {importType === "video" ? "MP4, WebM, or MOV formats" : "GIF, MP4, WebM, MOV, JPG, PNG, WebP, AVIF"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Metadata Form for Video References only */}
        {importType === "video" ? (
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

              {/* Configured Structured Fields */}
              {configuredVideoFields.map((field) => (
                <div key={field.name} className="space-y-1.5 animate-[rv-slide-down_0.2s_ease-out]">
                  <label className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                    {field.name}
                  </label>
                  {field.isMulti ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {field.values.map((val) => {
                        const isSelected = (structuredFields[field.name] as string[] ?? []).includes(val);
                        return (
                          <button
                            key={val}
                            type="button"
                            disabled={isImporting}
                            onClick={() => {
                              const current = (structuredFields[field.name] as string[] ?? []);
                              const next = isSelected
                                ? current.filter((c) => c !== val)
                                : [...current, val];
                              setStructuredFields({ ...structuredFields, [field.name]: next });
                            }}
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                              isSelected
                                ? "border-purple-400/50 bg-purple-400/10 text-purple-300 font-semibold"
                                : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"
                            }`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      value={structuredFields[field.name] as string ?? ""}
                      disabled={isImporting}
                      onChange={(e) => setStructuredFields({ ...structuredFields, [field.name]: e.target.value })}
                      className="w-full rounded-lg border border-white/[0.08] bg-[#111316] px-3.5 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50"
                    >
                      <option value="" className="text-white/40 bg-[#111316]">Select {field.name}...</option>
                      {field.values.map((val) => (
                        <option key={val} value={val} className="text-white bg-[#111316]">{val}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

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
              disabled={files.length === 0 || !title.trim() || isImporting}
              className="w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-[#0A0B0D] shadow-[0_4px_12px_rgba(251,191,36,0.3)] transition duration-300 hover:bg-amber-300 hover:shadow-[0_6px_20px_rgba(251,191,36,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-amber-400 disabled:shadow-none disabled:active:scale-100"
            >
              Import Reference
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={files.length === 0 || isImporting || !mediaRoot}
            className="w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-[#0A0B0D] shadow-[0_4px_12px_rgba(251,191,36,0.3)] transition duration-300 hover:bg-amber-300 hover:shadow-[0_6px_20px_rgba(251,191,36,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-amber-400 disabled:shadow-none disabled:active:scale-100 mt-2"
          >
            {files.length > 1 ? "Upload Assets to Media Library" : "Upload Asset to Media Library"}
          </button>
        )}
      </form>

      {/* Upload Progress Overlay */}
      {isImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[90%] max-w-md rounded-2xl border border-white/10 bg-[#111316] p-6 shadow-2xl flex flex-col items-center gap-4 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-3 border-amber-400/30 border-t-amber-400" />
            <div className="space-y-1.5 w-full">
              <h4 className="text-md font-semibold text-white">
                {importType === "video" ? (
                  importStep === "creating_folders"
                    ? "Initializing directory structure"
                    : importStep === "uploading_video"
                      ? "Uploading reference video"
                      : "Finalizing import"
                ) : (
                  files.length > 1
                    ? `Uploading media assets (${uploadingFileIndex + 1}/${files.length})`
                    : "Uploading media asset"
                )}
              </h4>
              <p className="text-xs text-white/50 truncate w-full px-2">
                {importType === "video" ? (
                  importStep === "creating_folders"
                    ? "Creating folders and writing metadata.json..."
                    : importStep === "uploading_video"
                      ? `Piping media stream... ${uploadPercent}%`
                      : "Import completed successfully!"
                ) : (
                  importStep === "done"
                    ? "Upload completed successfully!"
                    : `Uploading: ${uploadingFileName}`
                )}
              </p>
            </div>

            {uploadPercent > 0 && (
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
