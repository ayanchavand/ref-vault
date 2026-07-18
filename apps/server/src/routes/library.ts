import { createReadStream, createWriteStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  GetVideoDetailRequest,
  GetVideoDetailResponse,
  PutClipMetadataRequest,
  PutClipMetadataResponse,
  PutVideoMetadataRequest,
  PutVideoMetadataResponse,
  SaveSplitPlanRequest,
  SaveSplitPlanResponse,
  ScanLibraryRequest,
  ScanLibraryResponse,
  ValidateLibraryRootRequest,
  ValidateLibraryRootResponse,
  DeleteClipRequest,
  DeleteClipResponse,
  CreateVideoPlaceholderRequest,
  CreateVideoPlaceholderResponse,
  DeleteVideoRequest,
  DeleteVideoResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "../services/validate-library-root.js";
import { scanLibrary } from "../services/scan-library.js";
import { scanMedia } from "../services/scan-media.js";
import { readVideoDetail } from "../services/read-video-detail.js";
import { writeClipMetadata, deleteClip } from "../services/write-clip-metadata.js";
import { writeVideoMetadata } from "../services/write-video-metadata.js";
import { writeSplitPlan } from "../services/write-split-plan.js";
import { generateThumbnail } from "../services/generate-thumbnail.js";
import { createVideoPlaceholder, resolveUploadDirectory, deleteVideo } from "../services/import-video.js";


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

  // ── Media (Tinder-style browser) scan ──────────────────────────────────────
  app.post<{
    Body: import("@reference-vault/shared").ScanMediaRequest;
    Reply:
      | import("@reference-vault/shared").ScanMediaResponse
      | ApiErrorResponse;
  }>(
    "/api/media/scan",
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
      const result = await scanMedia(request.body.rootPath);

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

      const etag = `W/"${fileStats.size}-${fileStats.mtime.getTime()}"`;
      const lastModified = fileStats.mtime.toUTCString();

      if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
        reply
          .header("Cache-Control", "public, max-age=604800, must-revalidate")
          .header("ETag", etag)
          .header("Last-Modified", lastModified)
          .header("Accept-Ranges", "bytes");

        if (request.headers["if-none-match"] === etag) {
          return reply.code(304).send();
        }

        const ifModifiedSince = request.headers["if-modified-since"];
        if (ifModifiedSince) {
          try {
            const clientTime = Math.floor(new Date(ifModifiedSince).getTime() / 1000);
            const serverTime = Math.floor(fileStats.mtime.getTime() / 1000);
            if (clientTime >= serverTime) {
              return reply.code(304).send();
            }
          } catch {
            // Ignore invalid date formats
          }
        }
      }

      const rangeHeader = request.headers.range;
      let rangeRequested = !!rangeHeader;

      if (rangeHeader) {
        const ifRange = request.headers["if-range"];
        if (ifRange && typeof ifRange === "string") {
          if (ifRange.startsWith("W/") || ifRange.startsWith('"')) {
            if (ifRange !== etag) {
              rangeRequested = false;
            }
          } else {
            try {
              const parsedDate = new Date(ifRange).getTime();
              if (!Number.isNaN(parsedDate)) {
                const clientTime = Math.floor(parsedDate / 1000);
                const serverTime = Math.floor(fileStats.mtime.getTime() / 1000);
                if (clientTime < serverTime) {
                  rangeRequested = false;
                }
              } else {
                rangeRequested = false;
              }
            } catch {
              rangeRequested = false;
            }
          }
        }
      }

      if (rangeRequested && rangeHeader) {
        const rangeMatch = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)$/.exec(rangeHeader);

        if (!rangeMatch) {
          return reply.status(416).send({
            error: "INVALID_RANGE",
            message: "The requested range is invalid.",
          });
        }

        let start = 0;
        let end = fileStats.size - 1;

        if (rangeMatch[1] === "" && rangeMatch[2] !== "") {
          const suffixLength = Number(rangeMatch[2]);
          start = Math.max(0, fileStats.size - suffixLength);
        } else {
          start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
          if (rangeMatch[2]) {
            end = Number(rangeMatch[2]);
          }
        }

        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileStats.size) {
          reply
            .status(416)
            .header("Content-Range", `bytes */${fileStats.size}`)
            .send();
          return;
        }

        const MAX_CHUNK_SIZE = 2 * 1024 * 1024;
        if (end - start + 1 > MAX_CHUNK_SIZE) {
          end = start + MAX_CHUNK_SIZE - 1;
        }

        const chunkSize = end - start + 1;
        const stream = createReadStream(filePath, { start, end });

        return reply
          .code(206)
          .header("Content-Type", contentType)
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

  app.get<{
    Querystring: { rootPath: string; mediaPath: string };
  }>(
    "/api/media/thumbnail",
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
      const result = await generateThumbnail(
        request.query.rootPath,
        request.query.mediaPath,
      );

      if (!result.ok) {
        const statusCode =
          result.error.error === "LIBRARY_ROOT_NOT_FOUND" ||
          result.error.error === "VIDEO_NOT_FOUND" ||
          result.error.error === "MEDIA_NOT_FOUND"
            ? 404
            : 400;
        return reply.status(statusCode).send(result.error);
      }

      const { filePath, fileStats } = result.value;
      const etag = `W/"${fileStats.size}-${fileStats.mtime.getTime()}"`;

      reply
        .header("Content-Type", "image/jpeg")
        .header("Content-Length", String(fileStats.size))
        .header("Cache-Control", "public, max-age=604800, must-revalidate")
        .header("ETag", etag);

      if (request.headers["if-none-match"] === etag) {
        return reply.code(304).send();
      }

      const stream = createReadStream(filePath);
      return reply.code(200).send(stream);
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

    if (
      !filePath.endsWith(".mp4") &&
      !filePath.endsWith(".webm") &&
      !filePath.endsWith(".mov") &&
      !filePath.endsWith(".jpg") &&
      !filePath.endsWith(".jpeg") &&
      !filePath.endsWith(".png") &&
      !filePath.endsWith(".webp") &&
      !filePath.endsWith(".avif") &&
      !filePath.endsWith(".gif")
    ) {
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
      case ".webm":
        return "video/webm";
      case ".mov":
        return "video/quicktime";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".png":
        return "image/png";
      case ".webp":
        return "image/webp";
      case ".avif":
        return "image/avif";
      case ".gif":
        return "image/gif";
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

  app.post<{
    Body: SaveSplitPlanRequest;
    Reply: SaveSplitPlanResponse | ApiErrorResponse;
  }>(
    "/api/videos/split-plan",
    {
      schema: {
        body: {
          type: "object",
          required: ["rootPath", "videoRelativePath", "segments"],
          additionalProperties: false,
          properties: {
            rootPath: { type: "string" },
            videoRelativePath: { type: "string" },
            segments: {
              type: "array",
              items: {
                type: "object",
                required: ["start", "end", "tags"],
                properties: {
                  start: { type: "number" },
                  end: { type: "number" },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                  },
                  notes: { type: "string" },
                  rating: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await writeSplitPlan(
        request.body.rootPath,
        request.body.videoRelativePath,
        request.body.segments,
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

      return reply.status(200).send(result.value);
    },
  );

  app.post<{
    Body: DeleteClipRequest;
    Reply: DeleteClipResponse | ApiErrorResponse;
  }>(
    "/api/clips/delete",
    {
      schema: {
        body: {
          type: "object",
          required: ["rootPath", "videoRelativePath", "clipMediaPath"],
          additionalProperties: false,
          properties: {
            rootPath: { type: "string" },
            videoRelativePath: { type: "string" },
            clipMediaPath: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await deleteClip(
        request.body.rootPath,
        request.body.videoRelativePath,
        request.body.clipMediaPath,
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

      return reply.status(200).send(result.value);
    },
  );

  app.addContentTypeParser(
    "application/octet-stream",
    (request, payload, done) => {
      done(null, payload);
    },
  );

  app.post<{
    Body: CreateVideoPlaceholderRequest;
    Reply: CreateVideoPlaceholderResponse | ApiErrorResponse;
  }>(
    "/api/videos/create-placeholder",
    {
      schema: {
        body: {
          type: "object",
          required: ["rootPath", "title"],
          properties: {
            rootPath: { type: "string" },
            title: { type: "string" },
            artist: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            notes: { type: "string" },
            rating: { type: "number" },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await createVideoPlaceholder(request.body);

      if (!result.ok) {
        const statusCode =
          result.error.error === "LIBRARY_ROOT_NOT_FOUND" ? 404 : 400;
        return reply.status(statusCode).send(result.error);
      }

      return result.value;
    },
  );

  app.post<{
    Querystring: { rootPath: string; videoRelativePath: string };
  }>(
    "/api/videos/upload",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["rootPath", "videoRelativePath"],
          properties: {
            rootPath: { type: "string" },
            videoRelativePath: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { rootPath, videoRelativePath } = request.query;

      const rootValidation = await validateLibraryRoot(rootPath);
      if (!rootValidation.ok) {
        return reply.status(404).send(rootValidation.error);
      }

      const dirResult = await resolveUploadDirectory(
        rootValidation.value.rootPath,
        videoRelativePath,
      );

      if (!dirResult.ok) {
        const statusCode =
          dirResult.error.error === "VIDEO_NOT_FOUND" ? 404 : 400;
        return reply.status(statusCode).send(dirResult.error);
      }

      const targetFilePath = join(dirResult.value, "main.mp4");
      const writeStream = createWriteStream(targetFilePath);

      try {
        const bodyStream = request.body as any;
        await pipeline(bodyStream, writeStream);
        return { success: true };
      } catch (err) {
        return reply.status(500).send({
          error: "METADATA_WRITE_FAILED",
          message: `Failed to stream file to disk: ${(err as Error).message}`,
        });
      }
    },
  );

  app.post<{
    Querystring: { rootPath: string; fileName: string };
  }>(
    "/api/media/upload",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["rootPath", "fileName"],
          properties: {
            rootPath: { type: "string" },
            fileName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { rootPath, fileName } = request.query;

      const rootValidation = await validateLibraryRoot(rootPath);
      if (!rootValidation.ok) {
        return reply.status(404).send(rootValidation.error);
      }

      if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
        return reply.status(400).send({
          error: "INVALID_FILE_NAME",
          message: "Filename must not contain path traversal characters.",
        });
      }

      const targetFilePath = join(rootValidation.value.rootPath, fileName);
      const writeStream = createWriteStream(targetFilePath);

      try {
        const bodyStream = request.body as any;
        await pipeline(bodyStream, writeStream);
        return { success: true };
      } catch (err) {
        return reply.status(500).send({
          error: "MEDIA_WRITE_FAILED",
          message: `Failed to stream media file to disk: ${(err as Error).message}`,
        });
      }
    },
  );

  app.post<{
    Body: DeleteVideoRequest;
    Reply: DeleteVideoResponse | ApiErrorResponse;
  }>(
    "/api/videos/delete",
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
      const result = await deleteVideo(
        request.body.rootPath,
        request.body.videoRelativePath,
      );

      if (!result.ok) {
        const statusCode =
          result.error.error === "LIBRARY_ROOT_NOT_FOUND" ||
          result.error.error === "VIDEO_NOT_FOUND"
            ? 404
            : 400;
        return reply.status(statusCode).send(result.error);
      }

      return reply.status(200).send(result.value);
    },
  );
}
