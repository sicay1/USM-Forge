# Security scope

USM Forge is currently designed for a single user on a trusted machine. The supplied Compose configuration binds to `127.0.0.1`. It has no login, account isolation, or multi-user authorization. Do not expose it directly as a public upload service.

Every request must use an allowed Host. The defaults are `localhost`, `127.0.0.1`, and `[::1]`; ports may vary so Compose port mappings keep working. If an Origin header is supplied, it must match the request's scheme, host and port. Duplicate Host/Origin headers and cross-site browser mutations are rejected. Requests without Origin remain available to local command-line clients. Forwarded headers do not bypass these checks.

For a deliberate custom hostname, set `ALLOWED_HOSTS` to a comma-separated replacement list of exact hostnames, without schemes, ports, wildcards or trailing dots. Include the loopback names if you still need local access and container health checks. This setting controls accepted names, not authentication or network binding. The supplied server uses HTTP; TLS-terminating reverse proxies are not supported by the same-origin check as configured here.

CI runs tests, builds the container without publishing it, and scans the complete Git history with Gitleaks. Its only project-specific exception is an exact documentation SHA-256 value in `docs/legal/cricodecs-permission.json`; other findings in that file are still checked.

Video parsing runs inside FFmpeg and other native dependencies. Keep dependencies current, use input media you trust, and allow adequate memory/disk space. Limits bound upload size, duration, and mux stream size; they are not an operating-system memory quota.

Do not include credentials, private uploads, or confidential media in GitHub issues. If private vulnerability reporting is enabled on the repository, use it. Otherwise contact the repository owner to arrange private disclosure; do not post exploit details or private data publicly.

The source package is not a claim of a completed penetration test or vulnerability audit.
