# Library scan

## `POST /api/library/scan`

Reads a reference library from the supplied root path. It validates the root for this request, recursively discovers video folders, and returns file paths relative to the root. The endpoint writes nothing and does not parse or cache JSON metadata.

## Video and clip discovery rules

- A video is any directory containing a direct `main.mp4` file.
- Video folders can appear anywhere under the selected root.
- A video may have direct `metadata.json` and `thumbnail.jpg` files; their relative paths are reported when present.
- Videos must have a `clips/` directory alongside `main.mp4`.
- Clips are `.mp4` files anywhere under a video's `clips/` directory.
- Clip metadata is stored in one aggregated `clips.json` file in the video directory. When present, its relative path is reported as `clipsMetadataPath`.

## Request

```json
{
  "rootPath": "/absolute/path/to/ReferenceLibrary"
}
```

## Success response — `200 OK`

```json
{
  "rootPath": "/canonical/path/to/ReferenceLibrary",
  "videos": [
    {
      "relativePath": "Video_1",
      "mainVideoPath": "Video_1/main.mp4",
      "metadataPath": "Video_1/metadata.json",
      "thumbnailPath": "Video_1/thumbnail.jpg",
      "clips": [
        {
          "mediaPath": "Video_1/clips/0.mp4",
          "metadataPath": "Video_1/clips/0.json"
        }
      ]
    }
  ]
}
```

All returned paths use `/` separators and are relative to `rootPath`; the client uses `relativePath` as a stable video identifier for future API calls.

## Errors

The root-validation errors from [library-root validation](library-root-validation.md) apply. A scan that cannot traverse the library returns `400` with `LIBRARY_SCAN_FAILED`.
