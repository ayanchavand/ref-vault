# Video detail

## `POST /api/videos/detail`

Reads one video directory and its clip metadata directly from the selected library. The endpoint does not cache, transform, or write JSON files.

## Request

```json
{
  "rootPath": "/absolute/path/to/ReferenceLibrary",
  "videoRelativePath": "Video_1"
}
```

`videoRelativePath` must be a non-empty relative path that resolves inside the canonical library root. Absolute paths, parent-directory traversal, and symlinks that resolve outside the library are rejected.

## Success response — `200 OK`

```json
{
  "rootPath": "/canonical/path/to/ReferenceLibrary",
  "video": {
    "relativePath": "Video_1",
    "mainVideoPath": "Video_1/main.mp4",
    "metadata": { "tags": ["camera movement"] },
    "clips": [
      {
        "mediaPath": "Video_1/clips/0.mp4",
        "metadataPath": "Video_1/clips/0.json",
        "metadata": { "notes": "Slow push in." }
      }
    ]
  }
}
```

`metadata` is optional when its file is absent. When present, it must be a valid JSON object; all fields, including unknown future fields, are returned unchanged.

`clipsMetadataPath` is optional when `clips.json` is absent. When present, `clips.json` contains an object with per-clip keys matching each clip basename (`0`, `1`, etc.).

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_VIDEO_PATH` | The video path is empty, absolute, or escapes the root. |
| `404` | `VIDEO_NOT_FOUND` | The directory is missing or does not contain `main.mp4`. |
| `422` | `INVALID_METADATA_JSON` | A discovered metadata file is not a valid JSON object. The response includes its relative `path`. |
