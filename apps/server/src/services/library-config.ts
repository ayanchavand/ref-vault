import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ApiErrorResponse,
  LibraryConfig,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";

type ConfigReadResult =
  | { ok: true; value: LibraryConfig }
  | { ok: false; error: ApiErrorResponse };

type ConfigWriteResult =
  | { ok: true; value: LibraryConfig }
  | { ok: false; error: ApiErrorResponse };

export async function readLibraryConfig(rootPath: string): Promise<ConfigReadResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRootPath = rootValidation.value.rootPath;
  const configPath = join(libraryRootPath, "library.json");

  try {
    const data = await readFile(configPath, "utf8");
    const parsed = JSON.parse(data) as LibraryConfig;

    if (!parsed || !Array.isArray(parsed.fields)) {
      return { ok: true, value: { fields: [] } };
    }

    return { ok: true, value: parsed };
  } catch (error: unknown) {
    const code = error instanceof Error && "code" in error ? (error as any).code : undefined;

    if (code === "ENOENT") {
      // Config file does not exist yet. Return default configuration.
      return { ok: true, value: { fields: [] } };
    }

    return {
      ok: false,
      error: {
        error: "CONFIG_READ_FAILED",
        message: "The library configuration could not be read.",
      },
    };
  }
}

export async function writeLibraryConfig(
  rootPath: string,
  config: LibraryConfig,
): Promise<ConfigWriteResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRootPath = rootValidation.value.rootPath;
  const configPath = join(libraryRootPath, "library.json");

  try {
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    return { ok: true, value: config };
  } catch {
    return {
      ok: false,
      error: {
        error: "CONFIG_WRITE_FAILED",
        message: "The library configuration could not be saved.",
      },
    };
  }
}
