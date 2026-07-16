# Library-root validation

## `POST /api/library/validate`

Validates a candidate library-root directory for the current request. The server does not save the selected path; the frontend may retain it in browser `localStorage` and resubmit it later.

### Request

```json
{
  "rootPath": "/absolute/path/to/ReferenceLibrary"
}
```

`rootPath` is required and must be a string.

### Success response — `200 OK`

```json
{
  "rootPath": "/canonical/absolute/path/to/ReferenceLibrary"
}
```

The returned path is resolved with the filesystem's canonical-path operation, so future endpoints operate on a stable representation even if the submitted path used a symlink.

### Errors

| Status | Error code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_LIBRARY_ROOT` | The input is empty, invalid, or resolves to a file instead of a directory. |
| `404` | `LIBRARY_ROOT_NOT_FOUND` | The requested path does not exist. |
| `400` | `LIBRARY_ROOT_NOT_ACCESSIBLE` | The process cannot access the requested path. |

### Filesystem effects

This endpoint only resolves and reads filesystem metadata for the candidate path. It creates, changes, and persists no files.
