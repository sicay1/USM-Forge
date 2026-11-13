# Validation scope

Prepared on 2026-11-09, based on the native 0.2.0 implementation.

The implementation has been exercised on Linux amd64 in Podman/WSL, including MPEG-1 video, ADX stereo audio, embedded cue metadata, and seek offsets. Unit tests cover cue/frame math, validation, serial jobs, DOM behavior, UTF tables, payload preservation and malformed metadata. Native encode checks cover 24, 25, 30, 50 and 60 fps, including empty cue lists, end-boundary cues and a 40 Mbps setting.

The clean source package uses generated test patterns and sine-wave audio for its public HTTP smoke tests. No game media is bundled. A small reference cue metadata table in a unit test is structural metadata only.

## Clean-package checks completed

- `npm ci --ignore-scripts` and all 16 unit/DOM tests passed.
- Podman built the renamed Linux image; health reported USM Forge 0.2.0 with the native encoder available.
- Compose configuration parsed successfully.
- Synthetic WebM: upload, normalization, frame inspection, HTTP range playback, cue import, seam generation, USM export, embedded cue/seek/hash verification and downloads passed (240 decoded frames).
- Synthetic MP4 with audio: FPS/resolution changes, cue remapping, JSON restore, error responses, ADX audio export and cleanup passed (48 decoded frames after conversion to 24 fps).
- Synthetic MJPEG AVI: upload, normalization and native USM export passed (60 decoded frames, verified cue times and seek offsets).
- A targeted credential/personal-path scan of release files found no matches. This limited check is not a full security audit.

## Reverse-conversion checks (2026-11-13)

- All 51 unit/DOM tests passed, including conversion option validation, English/Vietnamese labels, independent conversion controls, preserved unsaved A/B settings, source detection, completed download lists, and streaming ADX extraction with corrupt-input cleanup.
- `node scripts/smoke-convert.mjs` passed on Windows using local FFmpeg/FFprobe and its own isolated HTTP server, with no USM encoder available.
- Synthetic MPEG-1 + ADX and MPEG-2 (with B-frames), with and without audio, converted to MP4/H.264/AAC and AVI/MPEG-4/PCM. Each retained 25 original frames and source dimensions, even though the preview used a different frame grid. Source rates of 25 and 30000/1001 fps were retained.
- Extracted MPEG and ADX files matched the generated source streams byte-for-byte (including the ADX header); ADX/WAV and output video/audio were decoded with FFprobe.
- Silent output, extraction opt-out, unchanged source files, old-result downloads, HTTP range/HEAD requests, job locking, download allowlisting, a non-USM file named `.usm`, and rejection of incomplete USM frame counts passed.
- In-app browser check: selected a synthetic USM project, ran MP4 conversion through the new controls, observed disabled controls during the job, then verified the expanded video/M1V/ADX/WAV/report download area. This is a focused UI check, not a full responsive/browser matrix.
- These are generated fixtures, not a compatibility claim for encrypted USMs, all client variants or every FFmpeg build. The Linux image was not rebuilt for this change.

## Pre-push security review (2026-11-13)

- Gitleaks 8.30.1 (official release, archive SHA-256 verified) reported no leaks in all locally reachable Git history and in a snapshot of the tracked/non-ignored working files. The existing exact public-documentation hash exception was retained; no broad new allowlists were added. Ignored uploads, generated media and tools were excluded from the source snapshot and are not being committed.
- `npm audit --json` reported zero known advisories in the locked JavaScript dependencies. This does not cover Node, FFmpeg, Python, CriCodecs or the container OS.
- All 60 unit/DOM/HTTP tests passed after integrating the remote Host/Origin guard. Additional HTTP tests cover cross-site API reads, blocked private/log/download paths, encoded traversal attempts, wrong MIME types, non-object JSON, oversized upload headers, invalid ranges and project imports that attempt to replace internal paths.
- Rejected requests now close their connection when a body may remain unread; content types are matched exactly and all processing job types use the queue cap. The conversion FFmpeg/API checks also passed after these changes, including rejection of a disguised HLS playlist without contacting its local network canary.
- Source review found no new shell interpolation or filename-derived output paths in the reverse converter. Native parsing still needs patched, trusted runtimes and is not an isolation boundary.
- The audit host used Node 24.15.0 and FFmpeg 8.1.2. Node 24.15.0 predates the [October 2026 security updates](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases); update the host runtime to a patched supported release. Track [FFmpeg security fixes](https://ffmpeg.org/security.html) and [Debian FFmpeg advisories](https://security-tracker.debian.org/tracker/source-package/ffmpeg) separately. No host software upgrade, container rebuild or full native dependency/image vulnerability scan was performed here.

## Not validated

- Playback or cue handling inside Lineage II or any other game client.
- Full cross-browser and responsive-layout coverage; the focused reverse-conversion browser check above is not a complete UI regression test.
- ARM64, every input codec, HDR/alpha, workloads near all resource limits, or a public multi-user service.
- Full security audit or legal clearance of all upstream binary components.

Successful USM structure/decoder tests do not certify compatibility with a specific game client. Exports report this explicitly in `verification.json`.
