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

## Not validated

- Playback or cue handling inside Lineage II or any other game client.
- Visual layout and interactive behavior in a real browser; DOM tests are not a replacement for visual testing.
- ARM64, every input codec, HDR/alpha, workloads near all resource limits, or a public multi-user service.
- Full security audit or legal clearance of all upstream binary components.

Successful USM structure/decoder tests do not certify compatibility with a specific game client. Exports report this explicitly in `verification.json`.
