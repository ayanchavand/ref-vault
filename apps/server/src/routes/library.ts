import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  GetVideoDetailRequest,
  GetVideoDetailResponse,
  ScanLibraryRequest,
  ScanLibraryResponse,
  ValidateLibraryRootRequest,
  ValidateLibraryRootResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "../services/validate-library-root.js";
import { scanLibrary } from "../services/scan-library.js";
import { readVideoDetail } from "../services/read-video-detail.js";

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
}
