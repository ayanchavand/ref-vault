import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  GetVideoDetailRequest,
  GetVideoDetailResponse,
  PutClipMetadataRequest,
  PutClipMetadataResponse,
  PutVideoMetadataRequest,
  PutVideoMetadataResponse,
  ScanLibraryRequest,
  ScanLibraryResponse,
  ValidateLibraryRootRequest,
  ValidateLibraryRootResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "../services/validate-library-root.js";
import { scanLibrary } from "../services/scan-library.js";
import { readVideoDetail } from "../services/read-video-detail.js";
import { writeClipMetadata } from "../services/write-clip-metadata.js";
import { writeVideoMetadata } from "../services/write-video-metadata.js";

export async function registerLibraryRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: ValidateLibraryRootRequest;
    Reply: ValidateLibraryRootResponse | ApiErrorResponse;
  }>(
    "/api/library/validate",
    {
      schema: {
        body: {
          type: "object",
          required: ["rootPath"],
          additionalProperties: false,
          properties: {
            rootPath: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await validateLibraryRoot(request.body.rootPath);

      if (!result.ok) {
        const statusCode =
          result.error.error === "LIBRARY_ROOT_NOT_FOUND" ? 404 : 400;
        return reply.status(statusCode).send(result.error);
      }

      return result.value;
    },
  );

  app.post<{
    Body: ScanLibraryRequest;
    Reply: ScanLibraryResponse | ApiErrorResponse;
  }>(
    "/api/library/scan",
    {
      schema: {
        body: {
          type: "object",
          required: ["rootPath"],
          additionalProperties: false,
          properties: {
            rootPath: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await scanLibrary(request.body.rootPath);

      if (!result.ok) {
        const statusCode =
          result.error.error === "LIBRARY_ROOT_NOT_FOUND" ? 404 : 400;
        return reply.status(statusCode).send(result.error);
      }

      return result.value;
    },
  );

  app.get<{
    Querystring: { rootPath: string; mediaPath: string };
  }>(
    "/api/media",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["rootPath", "mediaPath"],
          additionalProperties: false,
          properties: {
            rootPath: { type: "string" },
            mediaPath: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const validation = await validateLibraryRoot(request.query.rootPath);

      if (!validation.ok) {
        const statusCode =
          validation.error.error === "LIBRARY_ROOT_NOT_FOUND" ? 404 : 400;
        return reply.status(statusCode).send(validation.error);
      }

      const mediaResult = await resolveMediaFile(
        validation.value.rootPath,
        request.query.mediaPath,
      );

      if (!mediaResult.ok) {
        const statusCode =
          mediaResult.error.error === "MEDIA_NOT_FOUND" ? 404 : 400;
        return reply.status(statusCode).send(mediaResult.error);
      }

      const { filePath, fileStats, contentType } = mediaResult.value;
      const rangeHeader = request.headers.range;

      if (rangeHeader) {
        const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);

        if (!rangeMatch) {
          return reply.status(416).send({
            error: "INVALID_RANGE",
            message: "The requested range is invalid.",
          });
        }

        const start = (rangeMatch[1] ?? "").length > 0 ? Number(rangeMatch[1]) : 0;
        const end = (rangeMatch[2] ?? "").length > 0 ? Number(rangeMatch[2]) : fileStats.size - 1;

        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileStats.size) {
          reply
            .status(416)
            .header("Content-Range", `bytes */${fileStats.size}`)
            .send();
          return;
        }

        const chunkSize = end - start + 1;
        const stream = createReadStream(filePath, { start, end });

        return reply
          .code(206)
          .header("Content-Type", contentType)
          .header("Accept-Ranges", "bytes")
          .header("Content-Range", `bytes ${start}-${end}/${fileStats.size}`)
          .header("Content-Length", String(chunkSize))
          .send(stream);
      }

      const stream = createReadStream(filePath);
      return reply
        .code(200)
        .header("Content-Type", contentType)
        .header("Content-Length", String(fileStats.size))
        .header("Accept-Ranges", "bytes")
        .send(stream);
    },
  );

  app.post<{
    Body: GetVideoDetailRequest;
    Reply: GetVideoDetailResponse | ApiErrorResponse;
  }>(
    "/api/videos/detail",
    {
      schema: {
        body: {
          type: "object",
          required: ["rootPath", "videoRelativePath"],
          additionalProperties: false,
          properties: {
            rootPath: { type: "string" },
            videoRelativePath: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await readVideoDetail(
        request.body.rootPath,
        request.body.videoRelativePath,
      );

      if (!result.ok) {
        const statusCode =
          result.error.error === "LIBRARY_ROOT_NOT_FOUND" ||
          result.error.error === "VIDEO_NOT_FOUND"
            ? 404
            : result.error.error === "INVALID_METADATA_JSON"
              ? 422
              : 400;
        return reply.status(statusCode).send(result.error);
      }

      return result.value;
    },
  );

  async function resolveMediaFile(
    libraryRootPath: string,
    mediaPath: string,
  ): Promise<
    | { ok: true; value: { filePath: string; fileStats: import("node:fs").Stats; contentType: string } }
    | { ok: false; error: ApiErrorResponse }
  > {
    if (
      mediaPath.trim().length === 0 ||
      !isContainedPath(libraryRootPath, resolve(libraryRootPath, mediaPath))
    ) {
      return {
        ok: false,
        error: {
          error: "MEDIA_NOT_FOUND",
          message: "mediaPath must stay within the library root.",
        },
      };
    }

    const filePath = await realpath(resolve(libraryRootPath, mediaPath));

    if (!isContainedPath(libraryRootPath, filePath)) {
      return {
        ok: false,
        error: {
          error: "MEDIA_NOT_FOUND",
          message: "mediaPath must stay within the library root.",
        },
      };
    }

    if (!filePath.endsWith(".mp4") && !filePath.endsWith(".jpg") && !filePath.endsWith(".jpeg")) {
      return {
        ok: false,
        error: {
          error: "MEDIA_NOT_FOUND",
          message: "Only .mp4 and image files can be served as media.",
        },
      };
    }

    try {
      const fileStats = await stat(filePath);

      if (!fileStats.isFile()) {
        return {
          ok: false,
          error: {
            error: "MEDIA_NOT_FOUND",
            message: "The requested media file was not found.",
          },
        };
      }

      const contentType = getContentType(filePath);
      return { ok: true, value: { filePath, fileStats, contentType } };
    } catch {
      return {
        ok: false,
        error: {
          error: "MEDIA_NOT_FOUND",
          message: "The requested media file was not found.",
        },
      };
    }
  }

  function getContentType(filePath: string): string {
    const extension = extname(filePath).toLowerCase();

    switch (extension) {
      case ".mp4":
        return "video/mp4";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      default:
        return "application/octet-stream";
    }
  }

  function isContainedPath(libraryRootPath: string, targetPath: string): boolean {
    const pathFromRoot = resolve(libraryRootPath, targetPath).startsWith(libraryRootPath)
      ? relative(libraryRootPath, targetPath)
      : "..";
    return pathFromRoot === "" || (!pathFromRoot.startsWith(".."));
  }

  app.put<{
    Body: PutClipMetadataRequest;
    Reply: PutClipMetadataResponse | ApiErrorResponse;
  }>(
    "/api/clips/metadata",
    {
      schema: {
        body: {
          type: "object",
          required: ["rootPath", "videoRelativePath", "clipMediaPath", "metadata"],
          additionalProperties: false,
          properties: {
            rootPath: { type: "string" },
            videoRelativePath: { type: "string" },
            clipMediaPath: { type: "string" },
            metadata: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await writeClipMetadata(
        request.body.rootPath,
        request.body.videoRelativePath,
        request.body.clipMediaPath,
        request.body.metadata,
      );

      if (!result.ok) {
        const statusCode =
          result.error.error === "LIBRARY_ROOT_NOT_FOUND" ||
          result.error.error === "VIDEO_NOT_FOUND" ||
          result.error.error === "CLIP_NOT_FOUND"
            ? 404
            : result.error.error === "METADATA_WRITE_FAILED"
              ? 500
              : 400;
        return reply.status(statusCode).send(result.error);
      }

      return result.value;
    },
  );

  app.put<{
    Body: PutVideoMetadataRequest;
    Reply: PutVideoMetadataResponse | ApiErrorResponse;
  }>(
    "/api/videos/metadata",
    {
      schema: {
        body: {
          type: "object",
          required: ["rootPath", "videoRelativePath", "metadata"],
          additionalProperties: false,
          properties: {
            rootPath: { type: "string" },
            videoRelativePath: { type: "string" },
            metadata: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await writeVideoMetadata(
        request.body.rootPath,
        request.body.videoRelativePath,
        request.body.metadata,
      );

      if (!result.ok) {
        const statusCode =
          result.error.error === "LIBRARY_ROOT_NOT_FOUND" ||
          result.error.error === "VIDEO_NOT_FOUND"
            ? 404
            : result.error.error === "METADATA_WRITE_FAILED"
              ? 500
              : 400;
        return reply.status(statusCode).send(result.error);
      }

      return result.value;
    },
  );
}
