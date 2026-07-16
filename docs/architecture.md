# Architecture

## Non-negotiable rule

The selected reference-library directory is the sole source of truth for media and metadata. Reference Vault must not introduce a SQL database, NoSQL database, sidecar application index, or metadata cache that can become authoritative.

Each video owns its `metadata.json`, thumbnail, and clip files. Each clip owns the corresponding JSON metadata file alongside its media. Reads use those files directly; edits are written atomically back to the relevant JSON file.

## Repository boundaries

| Area | Responsibility | Must not do |
| --- | --- | --- |
| `apps/web` | React UI, browser preference, API client, media presentation | Read or write the local library directly |
| `apps/server` | Fastify API, filesystem validation, scanning, watching, indexing, JSON writes | Maintain an authoritative copy of library metadata |
| `packages/shared` | TypeScript types and validation schemas shared by the API contract | Perform filesystem or browser work |
| `docs/api` | Versioned endpoint contracts agreed before UI implementation | Contain endpoint implementations |

## Library-root selection

The frontend may remember the last selected root path in browser `localStorage` as a convenience only. The server does not persist the root path. Each operation requiring a root receives it through the API and validates it before accessing the filesystem.

This preference is not library metadata and must never be treated as authoritative. If it is missing or invalid, the user selects a library folder again.

## Future search index

Fuse.js indexes are process-memory, derived structures generated from the current filesystem scan. They are discarded and rebuilt as needed; they are not persisted as a database or metadata cache. Chokidar invalidates or refreshes that derived index after filesystem changes.

## Development sequence

1. Define an API contract in `docs/api`.
2. Implement the Fastify endpoint and filesystem behavior.
3. Add focused frontend support for that contract.
4. Verify that the original JSON file reflects every metadata edit.
