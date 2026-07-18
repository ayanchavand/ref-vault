import { FormEvent, useEffect, useState } from "react";

import { ApiError, validateLibraryRoot } from "../../lib/api";

interface LibraryRootFormProps {
  initialRootPath: string;
  activeRootPath: string | null;
  onValidatedRoot(rootPath: string): void | Promise<void>;
  onForgetSavedRoot(): void;
}

export function LibraryRootForm({
  initialRootPath,
  activeRootPath,
  onValidatedRoot,
  onForgetSavedRoot,
}: LibraryRootFormProps) {
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setRootPath(initialRootPath);
  }, [initialRootPath]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await validateLibraryRoot(rootPath);
      setRootPath(result.rootPath);
      await Promise.resolve(onValidatedRoot(result.rootPath));
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Reference Vault could not validate this folder.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111316]/50 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] shadow-black/40 p-4 sm:p-6 shadow-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="library-root" className="text-sm font-medium text-white/80">
            Library folder path
          </label>
          <input
            id="library-root"
            name="library-root"
            type="text"
            value={rootPath}
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="/Volumes/References/ReferenceLibrary"
            autoComplete="off"
            spellCheck="false"
            className="mt-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 font-mono text-sm text-white outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10"
          />
          <p className="mt-2 text-xs leading-5 text-white/40">
            The path is saved only in this browser after validation.
          </p>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || rootPath.trim().length === 0}
          className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-[#0A0B0D] transition active:scale-[0.98] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
        >
          {isSubmitting ? "Checking folder…" : "Open library"}
        </button>
      </form>

      {activeRootPath ? (
        <div className="mt-5 border-t border-white/[0.06] pt-5">
          <p className="text-sm font-medium text-emerald-300">Library ready</p>
          <p className="mt-1 break-all font-mono text-xs leading-5 text-white/60">
            {activeRootPath}
          </p>
        </div>
      ) : null}

      {initialRootPath ? (
        <button
          type="button"
          onClick={onForgetSavedRoot}
          className="mt-5 text-xs font-medium text-white/40 transition hover:text-white/70"
        >
          Forget saved location
        </button>
      ) : null}
    </div>
  );
}
