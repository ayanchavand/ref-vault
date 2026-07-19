import { FormEvent, useEffect, useState } from "react";
import { FolderOpen, Settings as SettingsIcon, CheckCircle, AlertCircle, Unlink, Plus, Trash2, Edit, X } from "lucide-react";
import { ApiError, validateLibraryRoot, initLibrary, putLibraryConfig } from "../../lib/api";
import type { LibraryConfig, LibraryConfigField } from "@reference-vault/shared";

const videoStorageKey = "reference-vault.library-root";
export const showTitleInListKey = "reference-vault.show-title-in-list";
export const showTitleInBoardKey = "reference-vault.show-title-in-board";
const mediaStorageKey = "reference-vault.media-root";

interface SettingsProps {
  onVideoLibraryChange(newPath: string): void | Promise<void>;
  onForgetVideoLibrary(): void;
  onMediaLibraryChange(newPath: string): void | Promise<void>;
  onForgetMediaLibrary(): void;
  videoLibraryPath: string;
  libraryConfig: LibraryConfig;
  onUpdateLibraryConfig(newConfig: LibraryConfig): void;
}

export function Settings({
  onVideoLibraryChange,
  onForgetVideoLibrary,
  onMediaLibraryChange,
  onForgetMediaLibrary,
  videoLibraryPath,
  libraryConfig,
  onUpdateLibraryConfig,
}: SettingsProps) {
  const [videoPathInput, setVideoPathInput] = useState(() => localStorage.getItem(videoStorageKey) ?? "");
  const [activeVideoPath, setActiveVideoPath] = useState(() => localStorage.getItem(videoStorageKey) ?? "");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoSubmitting, setIsVideoSubmitting] = useState(false);
  const [videoSuccess, setVideoSuccess] = useState(false);

  const [mediaPathInput, setMediaPathInput] = useState(() => localStorage.getItem(mediaStorageKey) ?? "");
  const [activeMediaPath, setActiveMediaPath] = useState(() => localStorage.getItem(mediaStorageKey) ?? "");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isMediaSubmitting, setIsMediaSubmitting] = useState(false);
  const [mediaSuccess, setMediaSuccess] = useState(false);

  const [initSuccessMessage, setInitSuccessMessage] = useState<string | null>(null);
  const [initErrorMessage, setInitErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Configurator state
  const [editingField, setEditingField] = useState<LibraryConfigField | null>(null);
  const [editingOriginalName, setEditingOriginalName] = useState<string | null>(null);
  const [newValueInput, setNewValueInput] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSavingField, setIsSavingField] = useState(false);

  function handleStartAdd(): void {
    setEditingOriginalName(null);
    setEditingField({ name: "", type: "video", isMulti: false, values: [] });
    setNewValueInput("");
    setFieldError(null);
  }

  function handleStartEdit(field: LibraryConfigField): void {
    setEditingOriginalName(field.name);
    setEditingField({ ...field, values: [...field.values] });
    setNewValueInput("");
    setFieldError(null);
  }

  function handleAddValue(): void {
    if (!newValueInput.trim()) return;
    const val = newValueInput.trim();
    if (editingField!.values.includes(val)) {
      setFieldError("Value already exists in this field.");
      return;
    }
    setEditingField({
      ...editingField!,
      values: [...editingField!.values, val],
    });
    setNewValueInput("");
    setFieldError(null);
  }

  function handleRemoveValue(val: string): void {
    setEditingField({
      ...editingField!,
      values: editingField!.values.filter((v) => v !== val),
    });
  }

  async function handleSaveField(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingField) return;
    const name = editingField.name.trim();
    if (!name) {
      setFieldError("Field category name is required.");
      return;
    }
    if (editingField.values.length === 0) {
      setFieldError("Please add at least one predefined value.");
      return;
    }

    const otherFields = libraryConfig.fields.filter(
      (f) => f.name !== editingOriginalName
    );
    if (otherFields.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      setFieldError("A field category with this name already exists.");
      return;
    }

    setIsSavingField(true);
    setFieldError(null);

    const newField: LibraryConfigField = {
      ...editingField,
      name,
    };

    let updatedFields: LibraryConfigField[] = [];
    if (editingOriginalName === null) {
      updatedFields = [...libraryConfig.fields, newField];
    } else {
      updatedFields = libraryConfig.fields.map((f) =>
        f.name === editingOriginalName ? newField : f
      );
    }

    const updatedConfig: LibraryConfig = { fields: updatedFields };

    try {
      const res = await putLibraryConfig({ rootPath: videoLibraryPath, config: updatedConfig });
      onUpdateLibraryConfig(res.config);
      setEditingField(null);
      setEditingOriginalName(null);
    } catch (cause) {
      setFieldError(
        cause instanceof ApiError
          ? cause.message
          : "Failed to save field configuration."
      );
    } finally {
      setIsSavingField(false);
    }
  }

  async function handleDeleteField(fieldName: string): Promise<void> {
    if (
      !window.confirm(
        `Are you sure you want to delete the field category "${fieldName}"? This will hide it from the metadata editors, but values already stored in files will remain intact.`
      )
    ) {
      return;
    }

    setIsSavingField(true);
    setFieldError(null);

    const updatedFields = libraryConfig.fields.filter((f) => f.name !== fieldName);
    const updatedConfig: LibraryConfig = { fields: updatedFields };

    try {
      const res = await putLibraryConfig({ rootPath: videoLibraryPath, config: updatedConfig });
      onUpdateLibraryConfig(res.config);
    } catch (cause) {
      setFieldError(
        cause instanceof ApiError
          ? cause.message
          : "Failed to delete field category."
      );
    } finally {
      setIsSavingField(false);
    }
  }

  async function handleVideoSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setVideoError(null);
    setVideoSuccess(false);
    setIsVideoSubmitting(true);

    try {
      const result = await validateLibraryRoot(videoPathInput);
      setVideoPathInput(result.rootPath);
      setActiveVideoPath(result.rootPath);
      localStorage.setItem(videoStorageKey, result.rootPath);
      setVideoSuccess(true);
      await Promise.resolve(onVideoLibraryChange(result.rootPath));
    } catch (cause) {
      setVideoError(
        cause instanceof ApiError
          ? cause.message
          : "Could not validate this folder path.",
      );
    } finally {
      setIsVideoSubmitting(false);
    }
  }

  function handleForgetVideo(): void {
    localStorage.removeItem(videoStorageKey);
    setVideoPathInput("");
    setActiveVideoPath("");
    setVideoSuccess(false);
    onForgetVideoLibrary();
  }

  async function handleMediaSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMediaError(null);
    setMediaSuccess(false);
    setIsMediaSubmitting(true);

    try {
      const result = await validateLibraryRoot(mediaPathInput);
      setMediaPathInput(result.rootPath);
      setActiveMediaPath(result.rootPath);
      localStorage.setItem(mediaStorageKey, result.rootPath);
      setMediaSuccess(true);
      await Promise.resolve(onMediaLibraryChange(result.rootPath));
    } catch (cause) {
      setMediaError(
        cause instanceof ApiError
          ? cause.message
          : "Could not validate this folder path.",
      );
    } finally {
      setIsMediaSubmitting(false);
    }
  }

  function handleForgetMedia(): void {
    localStorage.removeItem(mediaStorageKey);
    setMediaPathInput("");
    setActiveMediaPath("");
    setMediaSuccess(false);
    onForgetMediaLibrary();
  }

  async function handleInitializeLibrary(): Promise<void> {
    const targetPath = window.prompt(
      "Enter the absolute directory path where you want to initialize your libraries:\n\n(If the folder is empty, skeleton folders are created directly. Otherwise, 'refVault_Videos' and 'refVault_Media' subfolders will be created.)"
    );

    if (targetPath === null) {
      return; // Cancelled
    }

    if (targetPath.trim().length === 0) {
      setInitErrorMessage("The directory path cannot be empty.");
      return;
    }

    setInitErrorMessage(null);
    setInitSuccessMessage(null);
    setIsInitializing(true);

    try {
      const response = await initLibrary({ targetPath: targetPath.trim() });
      
      // Update Video Library Path
      setVideoPathInput(response.videoPath);
      setActiveVideoPath(response.videoPath);
      localStorage.setItem(videoStorageKey, response.videoPath);
      setVideoSuccess(true);
      await Promise.resolve(onVideoLibraryChange(response.videoPath));

      // Update Media Library Path
      setMediaPathInput(response.mediaPath);
      setActiveMediaPath(response.mediaPath);
      localStorage.setItem(mediaStorageKey, response.mediaPath);
      setMediaSuccess(true);
      await Promise.resolve(onMediaLibraryChange(response.mediaPath));

      setInitSuccessMessage(
        `Directory structures initialized successfully!\n\nVideo Library Path: ${response.videoPath}\nMedia Library Path: ${response.mediaPath}`
      );
    } catch (cause) {
      setInitErrorMessage(
        cause instanceof ApiError
          ? cause.message
          : "Failed to initialize the library structure."
      );
    } finally {
      setIsInitializing(false);
    }
  }

  // Library display preferences
  const [showTitleInList, setShowTitleInList] = useState(
    () => localStorage.getItem(showTitleInListKey) !== "false"
  );
  const [showTitleInBoard, setShowTitleInBoard] = useState(
    () => localStorage.getItem(showTitleInBoardKey) !== "false"
  );

  function handleToggleTitleInList(): void {
    const next = !showTitleInList;
    setShowTitleInList(next);
    localStorage.setItem(showTitleInListKey, String(next));
  }

  function handleToggleTitleInBoard(): void {
    const next = !showTitleInBoard;
    setShowTitleInBoard(next);
    localStorage.setItem(showTitleInBoardKey, String(next));
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-2 sm:px-0">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
            Preferences
          </p>
          <h2 className="text-3xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60 sm:text-4xl flex items-center gap-2.5">
            <SettingsIcon className="h-7 w-7 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.2)]" />
            System Libraries
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-white/50">
            Set up the source folders on your local machine. Files are read in-place directly from the filesystem without copying.
          </p>
        </div>
        <button
          type="button"
          disabled={isInitializing}
          onClick={handleInitializeLibrary}
          className="md:self-end rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-xs font-semibold text-[#0A0B0D] px-4 py-2.5 shadow-lg hover:shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 shrink-0"
        >
          <FolderOpen className="h-4 w-4" />
          {isInitializing ? "Initializing..." : "Initialize Structure"}
        </button>
      </div>

      {initErrorMessage && (
        <div role="alert" className="flex items-center gap-2.5 rounded-lg bg-rose-500/10 px-4 py-3 text-xs text-rose-300 leading-normal animate-[rv-shake_0.4s_ease-in-out_both] border border-rose-500/20">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <div>
            <span className="font-semibold block mb-0.5">Initialization Failed</span>
            {initErrorMessage}
          </div>
        </div>
      )}

      {initSuccessMessage && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300 leading-normal animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both] border border-emerald-500/20">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Libraries Initialized</span>
            <div className="whitespace-pre-line opacity-90">{initSuccessMessage}</div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Video Library Card */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-2xl p-5 sm:p-6 flex flex-col justify-between">
          <form onSubmit={handleVideoSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="video-root" className="text-sm font-semibold text-white/90 flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-amber-400/80" />
                  Video Library Root
                </label>
                {activeVideoPath && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider font-semibold text-emerald-400">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/40">
                Folder containing video reference folders (with main.mp4 and clips).
              </p>
              <input
                id="video-root"
                name="video-root"
                type="text"
                value={videoPathInput}
                onChange={(event) => setVideoPathInput(event.target.value)}
                placeholder="/path/to/my/video-refs"
                autoComplete="off"
                spellCheck="false"
                className="mt-3 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-mono text-xs text-white outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10"
              />
            </div>

            {videoError && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 leading-normal animate-[rv-shake_0.4s_ease-in-out_both]">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                {videoError}
              </p>
            )}

            {videoSuccess && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 leading-normal animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                Video library root updated successfully!
              </p>
            )}

            <button
              type="submit"
              disabled={isVideoSubmitting || videoPathInput.trim().length === 0}
              className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(251,191,36,0.4)] active:translate-y-px active:shadow-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isVideoSubmitting ? "Checking path…" : activeVideoPath ? "Update Path" : "Configure Path"}
            </button>
          </form>

          {activeVideoPath && (
            <div className="mt-5 border-t border-white/[0.06] pt-4 flex flex-col gap-3">
              <div>
                <p className="font-mono text-[0.6rem] uppercase tracking-wider text-white/30">Current path</p>
                <p className="mt-1 break-all font-mono text-xs text-white/60 leading-normal bg-black/20 p-2 rounded border border-white/[0.03]">
                  {activeVideoPath}
                </p>
              </div>
              <button
                type="button"
                onClick={handleForgetVideo}
                className="inline-flex items-center gap-1.5 self-start text-[0.68rem] font-medium text-white/40 hover:text-rose-400 transition"
              >
                <Unlink className="h-3 w-3" />
                Forget video library path
              </button>
            </div>
          )}
        </div>

        {/* Media Library Card */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-2xl p-5 sm:p-6 flex flex-col justify-between">
          <form onSubmit={handleMediaSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="media-root" className="text-sm font-semibold text-white/90 flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-amber-400/80" />
                  Media Library Root
                </label>
                {activeMediaPath && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider font-semibold text-emerald-400">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/40">
                Folder containing independent reference loops, GIFs, and images.
              </p>
              <input
                id="media-root"
                name="media-root"
                type="text"
                value={mediaPathInput}
                onChange={(event) => setMediaPathInput(event.target.value)}
                placeholder="/path/to/my/gifs-and-images"
                autoComplete="off"
                spellCheck="false"
                className="mt-3 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-mono text-xs text-white outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10"
              />
            </div>

            {mediaError && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 leading-normal animate-[rv-shake_0.4s_ease-in-out_both]">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                {mediaError}
              </p>
            )}

            {mediaSuccess && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 leading-normal animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                Media library root updated successfully!
              </p>
            )}

            <button
              type="submit"
              disabled={isMediaSubmitting || mediaPathInput.trim().length === 0}
              className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(251,191,36,0.4)] active:translate-y-px active:shadow-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isMediaSubmitting ? "Checking path…" : activeMediaPath ? "Update Path" : "Configure Path"}
            </button>
          </form>

          {activeMediaPath && (
            <div className="mt-5 border-t border-white/[0.06] pt-4 flex flex-col gap-3">
              <div>
                <p className="font-mono text-[0.6rem] uppercase tracking-wider text-white/30">Current path</p>
                <p className="mt-1 break-all font-mono text-xs text-white/60 leading-normal bg-black/20 p-2 rounded border border-white/[0.03]">
                  {activeMediaPath}
                </p>
              </div>
              <button
                type="button"
                onClick={handleForgetMedia}
                className="inline-flex items-center gap-1.5 self-start text-[0.68rem] font-medium text-white/40 hover:text-rose-400 transition"
              >
                <Unlink className="h-3 w-3" />
                Forget media library path
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Structured Metadata Fields Section */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-2xl p-5 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-white/90 flex items-center gap-1.5">
              <SettingsIcon className="h-5 w-5 text-amber-400" />
              Structured Metadata Fields
            </h3>
            <p className="text-xs text-white/40">
              Define custom dropdown categories for videos and clips (e.g. Lighting, Camera Angle, Motion).
            </p>
          </div>
          {videoLibraryPath && !editingField && (
            <button
              type="button"
              onClick={handleStartAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-semibold text-[#0A0B0D] hover:bg-amber-300 transition"
            >
              <Plus className="h-4 w-4" />
              Add Category
            </button>
          )}
        </div>

        {!videoLibraryPath ? (
          <div className="py-6 text-center text-sm text-white/40 border border-dashed border-white/[0.08] rounded-xl">
            Please configure and activate a Video Library Root to manage metadata fields.
          </div>
        ) : (
          <div className="space-y-6">
            {libraryConfig.fields.length === 0 && !editingField ? (
              <div className="py-8 text-center text-sm text-white/40 border border-dashed border-white/[0.08] rounded-xl space-y-3">
                <p>No structured metadata fields defined yet.</p>
                <button
                  type="button"
                  onClick={handleStartAdd}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/[0.04] px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/[0.08] hover:border-amber-400/60 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create your first category
                </button>
              </div>
            ) : (
              <>
                {!editingField && (
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Video Level Fields */}
                    <div className="space-y-3">
                      <span className="block font-mono text-[0.62rem] uppercase tracking-wider text-amber-300/80">Video-level Categories</span>
                      {libraryConfig.fields.filter(f => f.type === "video").length === 0 ? (
                        <p className="text-xs text-white/30 italic py-2">None defined</p>
                      ) : (
                        <div className="space-y-3">
                          {libraryConfig.fields.filter(f => f.type === "video").map(field => (
                            <FieldCategoryRow key={field.name} field={field} onEdit={handleStartEdit} onDelete={handleDeleteField} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Clip Level Fields */}
                    <div className="space-y-3">
                      <span className="block font-mono text-[0.62rem] uppercase tracking-wider text-sky-400/80">Clip-level Categories</span>
                      {libraryConfig.fields.filter(f => f.type === "clip").length === 0 ? (
                        <p className="text-xs text-white/30 italic py-2">None defined</p>
                      ) : (
                        <div className="space-y-3">
                          {libraryConfig.fields.filter(f => f.type === "clip").map(field => (
                            <FieldCategoryRow key={field.name} field={field} onEdit={handleStartEdit} onDelete={handleDeleteField} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {editingField && (
                  <form onSubmit={handleSaveField} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 space-y-4 animate-[rv-slide-down_0.25s_ease-out]">
                    <h4 className="font-mono text-xs uppercase tracking-wider text-amber-300">
                      {editingOriginalName ? `Edit Category: ${editingOriginalName}` : "Add New Field Category"}
                    </h4>

                    <div className="space-y-4">
                      {/* Name Input */}
                      <div className="space-y-1.5">
                        <label htmlFor="field-name" className="block font-mono text-[0.62rem] uppercase tracking-wider text-white/50">
                          Category Name
                        </label>
                        <input
                          id="field-name"
                          type="text"
                          value={editingField.name}
                          onChange={(e) => setEditingField({ ...editingField, name: e.target.value })}
                          placeholder="e.g. Lighting, Camera Angle"
                          disabled={isSavingField}
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10 disabled:opacity-50"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Level Selection */}
                        <div className="space-y-1.5">
                          <span className="block font-mono text-[0.62rem] uppercase tracking-wider text-white/50">
                            Metadata Level
                          </span>
                          <div className="flex gap-2">
                            {[
                              { value: "video" as const, label: "Video-level" },
                              { value: "clip" as const, label: "Clip-level" }
                            ].map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={isSavingField}
                                onClick={() => setEditingField({ ...editingField, type: opt.value })}
                                className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
                                  editingField.type === opt.value
                                    ? "border-amber-400/50 bg-amber-400/10 text-amber-300 font-semibold"
                                    : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Selection Mode Selection */}
                        <div className="space-y-1.5">
                          <span className="block font-mono text-[0.62rem] uppercase tracking-wider text-white/50">
                            Selection Mode
                          </span>
                          <div className="flex gap-2">
                            {[
                              { value: false, label: "Single-select" },
                              { value: true, label: "Multi-select" }
                            ].map(opt => (
                              <button
                                key={String(opt.value)}
                                type="button"
                                disabled={isSavingField}
                                onClick={() => setEditingField({ ...editingField, isMulti: opt.value })}
                                className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
                                  editingField.isMulti === opt.value
                                    ? "border-purple-400/50 bg-purple-400/10 text-purple-300 font-semibold"
                                    : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Predefined Values */}
                      <div className="space-y-2">
                        <span className="block font-mono text-[0.62rem] uppercase tracking-wider text-white/50">
                          Predefined Values (At least one required)
                        </span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newValueInput}
                            onChange={(e) => setNewValueInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddValue();
                              }
                            }}
                            placeholder="Type a value and press Enter or Click Add"
                            disabled={isSavingField}
                            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm text-white outline-none focus:border-amber-400/50"
                          />
                          <button
                            type="button"
                            onClick={handleAddValue}
                            disabled={isSavingField || newValueInput.trim().length === 0}
                            className="rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] px-4 text-xs font-semibold text-white transition"
                          >
                            Add Value
                          </button>
                        </div>

                        {/* Display values */}
                        <div className="flex flex-wrap gap-1.5 min-h-[3rem] p-3 rounded-lg bg-black/20 border border-white/[0.04]">
                          {editingField.values.length === 0 ? (
                            <span className="text-xs text-white/20 italic self-center">No values added yet.</span>
                          ) : (
                            editingField.values.map(val => (
                              <span key={val} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] pl-3 pr-1.5 py-1 font-mono text-[0.62rem] text-white/80">
                                <span>{val}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveValue(val)}
                                  disabled={isSavingField}
                                  className="p-0.5 rounded-full hover:bg-white/[0.1] text-white/40 hover:text-rose-400 transition"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {fieldError && (
                      <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 leading-normal animate-[rv-shake_0.4s_ease-in-out_both]">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                        {fieldError}
                      </p>
                    )}

                    <div className="flex items-center gap-3 border-t border-white/[0.06] pt-4">
                      <button
                        type="submit"
                        disabled={isSavingField}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-[#0A0B0D] hover:bg-amber-300 transition"
                      >
                        {isSavingField ? "Saving..." : "Save Category"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingField(null);
                          setEditingOriginalName(null);
                        }}
                        disabled={isSavingField}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/80 hover:bg-white/[0.06] transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Library Display Section */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-2xl p-5 sm:p-6 space-y-5">
        <div className="border-b border-white/[0.06] pb-4">
          <h3 className="text-lg font-semibold text-white/90 flex items-center gap-1.5">
            <SettingsIcon className="h-5 w-5 text-amber-400" />
            Library Display
          </h3>
          <p className="mt-1 text-xs text-white/40">
            Control which elements are visible on library cards.
          </p>
        </div>

        <div className="space-y-4">
          {/* Show title in List view */}
          <div className="flex items-center justify-between gap-4 py-1">
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium text-white/85">Show title in List view</p>
              <p className="text-xs text-white/40">Display the video folder name beneath the thumbnail in the List layout.</p>
            </div>
            <button
              id="toggle-title-in-list"
              type="button"
              role="switch"
              aria-checked={showTitleInList}
              onClick={handleToggleTitleInList}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] ${
                showTitleInList
                  ? "border-amber-400/70 bg-amber-400/20"
                  : "border-white/[0.12] bg-white/[0.05]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-lg transition-all duration-200 ease-in-out ${
                  showTitleInList
                    ? "translate-x-5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                    : "translate-x-0 bg-white/30"
                }`}
              />
            </button>
          </div>

          <div className="border-t border-white/[0.04]" />

          {/* Show title in Board view */}
          <div className="flex items-center justify-between gap-4 py-1">
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium text-white/85">Show title in Board view</p>
              <p className="text-xs text-white/40">Display the video folder name in the hover overlay of Board (moodboard) cards.</p>
            </div>
            <button
              id="toggle-title-in-board"
              type="button"
              role="switch"
              aria-checked={showTitleInBoard}
              onClick={handleToggleTitleInBoard}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] ${
                showTitleInBoard
                  ? "border-amber-400/70 bg-amber-400/20"
                  : "border-white/[0.12] bg-white/[0.05]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-lg transition-all duration-200 ease-in-out ${
                  showTitleInBoard
                    ? "translate-x-5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                    : "translate-x-0 bg-white/30"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldCategoryRow({
  field,
  onEdit,
  onDelete,
}: {
  field: LibraryConfigField;
  onEdit: (f: LibraryConfigField) => void;
  onDelete: (name: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 flex flex-col justify-between gap-3 group hover:border-white/[0.08] transition duration-200">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-sm text-white/90 truncate">{field.name}</p>
          <span className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[0.55rem] uppercase font-semibold ${
            field.isMulti
              ? "bg-purple-500/10 text-purple-300 border border-purple-500/20"
              : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
          }`}>
            {field.isMulti ? "Multi-select" : "Single-select"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onEdit(field)}
            className="p-1 rounded hover:bg-white/[0.08] text-white/60 hover:text-white transition"
            title="Edit"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(field.name)}
            className="p-1 rounded hover:bg-rose-500/10 text-white/60 hover:text-rose-400 transition"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {field.values.map(val => (
          <span key={val} className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[0.6rem] text-white/50 border border-white/[0.02]">
            {val}
          </span>
        ))}
      </div>
    </div>
  );
}
