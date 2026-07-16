# Clip metadata write

## `PUT /api/clips/metadata`

Replaces the JSON metadata for one verified clip. The server derives the destination JSON filename from the clip media path (`0.mp4` becomes `0.json`); callers cannot choose an arbitrary write target.

The file is written to a temporary sibling and renamed into place. Readers therefore see either the previous complete JSON document or the new complete JSON document, never a partial write.

## Request

```json
{
  "rootPath": "/absolute/path/to/ReferenceLibrary",
  "videoRelativePath": "Video_1",
  "clipMediaPath": "Video_1/clips/0.mp4",
  "metadata": {
    "tags": ["camera movement"],
    "notes": "Slow push in.",
    "rating": 4
  }
}
```

`metadata` must be a JSON object. Unknown and future fields are preserved as submitted.

`clipMediaPath` must identify an existing `.mp4` file within the selected video's `clips/` directory; absolute paths, traversal, and paths resolving outside that directory are rejected.

## Success response — `200 OK`

```json
{
  "metadataPath": "Video_1/clips/0.json",
  "metadata": {
    "tags": ["camera movement"],
    "notes": "Slow push in.",
    "rating": 4
  }
}
```

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_CLIP_PATH` | The clip path is invalid or outside the video's clips directory. |
| `404` | `VIDEO_NOT_FOUND` / `CLIP_NOT_FOUND` | The expected video or clip is absent. |
| `500` | `METADATA_WRITE_FAILED` | The JSON could not be written or replaced atomically. |
