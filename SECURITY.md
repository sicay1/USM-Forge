# Security scope

USM Forge is currently designed for a single user on a trusted machine. The supplied Compose configuration binds to `127.0.0.1`. It has no login, account isolation, or multi-user authorization. Do not expose it directly as a public upload service.

Video parsing runs inside FFmpeg and other native dependencies. Keep dependencies current, use input media you trust, and allow adequate memory/disk space. Limits bound upload size, duration, and mux stream size; they are not an operating-system memory quota.

Do not include credentials, private uploads, or confidential media in GitHub issues. If private vulnerability reporting is enabled on the repository, use it. Otherwise contact the repository owner to arrange private disclosure; do not post exploit details or private data publicly.

The source package is not a claim of a completed penetration test or vulnerability audit.
