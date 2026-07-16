# Reference Vault

A self-hosted, local-first application for organizing and searching video references.

The filesystem is the source of truth. Media and its JSON metadata remain together in a user-selected library folder; Reference Vault does not use a database or copy metadata into an application store.

See [the architecture notes](docs/architecture.md) and [the API-contract workflow](docs/api/README.md).

## Development

Run the backend and frontend in separate terminals:

```sh
npm run dev --workspace=@reference-vault/server
npm run dev --workspace=@reference-vault/web
```

The Vite development server proxies `/api` requests to the local Fastify server on port `4310`.
