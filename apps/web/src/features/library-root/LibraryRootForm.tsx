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
    <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="library-root" className="text-sm font-medium text-slate-200">
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
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
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
          className="w-full rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Checking folder…" : "Open library"}
        </button>
      </form>

      {activeRootPath ? (
        <div className="mt-5 border-t border-slate-800 pt-5">
          <p className="text-sm font-medium text-emerald-300">Library ready</p>
          <p className="mt-1 break-all font-mono text-xs leading-5 text-slate-400">
            {activeRootPath}
          </p>
        </div>
      ) : null}

      {initialRootPath ? (
        <button
          type="button"
          onClick={onForgetSavedRoot}
          className="mt-5 text-xs font-medium text-slate-500 transition hover:text-slate-300"
        >
          Forget saved location
        </button>
      ) : null}
    </div>
  );
}
