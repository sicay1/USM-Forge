# Security scope

USM Forge is currently designed for a single user on a trusted machine. The supplied Compose configuration binds to `127.0.0.1`. It has no login, account isolation, or multi-user authorization. Do not expose it directly as a public upload service.

Every request must use an allowed Host. The defaults are `localhost`, `127.0.0.1`, and `[::1]`; ports may vary so Compose port mappings keep working. If an Origin header is supplied, it must match the request's scheme, host and port. Duplicate Host/Origin headers and cross-site browser mutations are rejected. Requests without Origin remain available to local command-line clients. Forwarded headers do not bypass these checks.

Cross-site browser requests to `/api/` are rejected even for reads (including frame extraction and media downloads). Opening the editor itself from a documentation link remains possible. Responses use same-origin resource policy and no-referrer; rejected JSON requests close the connection so an unread body cannot contaminate a subsequent keep-alive request. JSON payloads must be objects and content types must match exactly, with optional parameters such as `charset`.

For a deliberate custom hostname, set `ALLOWED_HOSTS` to a comma-separated replacement list of exact hostnames, without schemes, ports, wildcards or trailing dots. Include the loopback names if you still need local access and container health checks. This setting controls accepted names, not authentication or network binding. The supplied server uses HTTP; TLS-terminating reverse proxies are not supported by the same-origin check as configured here.

CI runs tests, builds the container without publishing it, and scans the complete Git history with Gitleaks. Its only project-specific exception is an exact documentation SHA-256 value in `docs/legal/cricodecs-permission.json`; other findings in that file are still checked.

Video parsing runs inside FFmpeg and other native dependencies. Keep dependencies current, use input media you trust, and allow adequate memory/disk space. Limits bound upload size, duration, and mux stream size; they are not an operating-system memory quota.

Uploads use fixed server-generated paths; user filenames are display-only. Media subprocesses use argument arrays with `shell: false`, a file/pipe-only protocol allowlist and an explicit input-format allowlist that excludes playlists such as HLS/concat. Downloads are restricted to completed results and fixed allowlisted filenames; original uploads and process logs are not download routes. Processing jobs share a bounded serial queue. These controls do not sandbox native codec memory access or eliminate disk-exhaustion risk from a trusted local client.

Do not include credentials, private uploads, or confidential media in GitHub issues. If private vulnerability reporting is enabled on the repository, use it. Otherwise contact the repository owner to arrange private disclosure; do not post exploit details or private data publicly.

The source package is not a claim of a completed penetration test or vulnerability audit.
