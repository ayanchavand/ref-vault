# API contracts

Before implementing a user-facing feature, add a focused contract document here. It should define:

- Endpoint and HTTP method
- Request and response shapes
- Filesystem effects and validation rules
- Error cases
- Whether the response is a direct filesystem read or a derived, in-memory result

The contract must preserve the filesystem as the only authoritative data store. The server binds locally and exposes filesystem access only through explicitly designed endpoints.

Initial contracts will cover library-root selection, scanning, video and clip reads, metadata writes, global search, and filesystem-change notifications.
