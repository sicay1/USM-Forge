# USM Forge

**Convert videos to USM. Preview loops. Add cue points.**

A local web app for converting common video formats to CRI USM, with frame-by-frame inspection, cue-point editing, and loop preview before export. The Linux container runs the whole pipeline using FFmpeg and CriCodecs. No Wine or proprietary Windows encoder is required.

The current interface is in Vietnamese. This is an independent community project, not an official CRIWARE or Lineage II tool.

## Features

- Upload MP4, WebM, MOV, MKV, AVI and other supported video containers.
- Play the normalized preview or inspect individual frames.
- Add/edit cue points; import and export `cue_point.txt`.
- Preview A–B loops, intro-then-loop playback, and a rendered clip across the loop boundary.
- Export MPEG-1 video with optional stereo ADX audio in a USM container, with cue points embedded.
- Download USM, cue text, project JSON, and a structural/decoder verification report.

## Quick start

Install Docker with Compose, or Podman with a working Compose provider. On Windows/macOS, initialize and start the container virtual machine first if needed. Use an x86-64 machine for the tested configuration.

From the project folder:

```sh
podman compose up -d --build
```

Or:

```sh
docker compose up -d --build
```

Open **http://localhost:3213**. The first build needs internet access. FFmpeg, Python and the muxer are installed inside the image; there is no encoder directory to download or mount separately.

The named volume `usm-data` stores uploads, projects and exports. `compose down` keeps it; `compose down -v` deletes it. Back up the volume separately from the source repository.

If port 3213 is occupied, set `USM_PORT` before starting. For example, in PowerShell:

```powershell
$env:USM_PORT = '3214'
podman compose up -d --build
```

Without Compose:

```sh
podman build --format docker -t localhost/usm-forge:0.2.0 .
podman run -d --name usm-forge -p 127.0.0.1:3213:3210 -v usm-forge-data:/data --init localhost/usm-forge:0.2.0
```

This repository supplies source and local build instructions. It does not advertise a prebuilt public image. See [image distribution requirements](docs/IMAGE_DISTRIBUTION.md) before publishing one yourself.

## Using the editor

1. Upload a video and wait for normalization. Preview, frame inspection, cue positions and export all use the same constant-frame-rate master.
2. Use Space for play/pause and the left/right arrows to inspect frames. Frame numbering starts at zero.
3. Add cue points at the current frame or enter frame numbers. Save cue changes before switching projects.
4. Select loop endpoints A and B. Playback includes A and stops before B: `[A, B)`. A cue at `totalFrames` denotes the end boundary.
5. Use **Xem đoạn nối** (seam preview) to render the last part before B followed by the first part after A. This avoids browser seek latency when judging the visual join; this short clip is silent.
6. If you change resolution or FPS, apply the settings. Cues are remapped to the nearest frame by time; select loop endpoints again after the rebuild.
7. Export and download the result. Each export stores a snapshot of settings and cues.

The loop controls simulate the interval you select. They do not infer game behavior from names such as `loop_point`. Actual cue handling is up to the game client.

## Cue and project files

The first line of `cue_point.txt` is the timebase in ticks per second. Each subsequent line contains `time,id,name`:

```text
1000
0,0,start
500,1,loop_point
6500,2,loop_start
7000,0,end
```

Imports are snapped to the nearest frame. Exports use 1000 ticks/second and rounded millisecond timestamps. Names must be unique and use Latin letters, digits, `_`, `-`, or `.`. IDs can repeat. Additional cue parameter columns are not supported.

Project JSON contains settings/cues/loop selection, not the source video. To restore on another machine, upload the same video, apply the matching resolution/FPS, then import the JSON. The `usm-studio/v1` schema identifier is intentionally retained for compatibility with earlier project files.

## Output and limits

The native pipeline is source → FFV1 master → MPEG-1 video / optional ADX audio → USM. It uses no AVI intermediate. The app embeds cue metadata and adjusts seek offsets, then checks media hashes, decoded frame count, dimensions, and audio format. `verification.json` explicitly records `gameClientTested: false`.

- Upload limit: 512 MiB by default (`MAX_UPLOAD_MB`); maximum source duration: 600 seconds.
- Mux budget: 256 MiB by default (`MAX_ENCODE_MB`). Estimates include 25% headroom; actual elementary stream sizes are checked too. This is not a container RAM limit. The muxer can use several times the stream size in memory.
- Master files can consume many GB. Export streams are removed after processing; projects and exports remain until deleted.
- Output: 24/25/30/50/60 fps; even width up to 4094, even height up to 2160. Aspect ratio is preserved with padding.
- No alpha preservation or HDR-specific processing. Browser looping may have seek latency.
- One media job queue. Interrupted jobs are marked failed after restart rather than automatically resumed.
- Linux amd64 is tested. ARM64 and direct playback/cue behavior inside a game client have not been validated.
- Designed for a trusted local user; no authentication or multi-user isolation. See [SECURITY.md](SECURITY.md).

## Development and tests

Node.js 22+ is required for development. Runtime video operations also need FFmpeg/FFprobe with USM demuxing. The Linux native backend needs Python 3.13 with the pinned dependencies in `requirements-native.txt`; using the supplied container is the easiest way to match them.

```sh
npm ci
npm test
```

For media/API checks, put FFmpeg and FFprobe on PATH (or set `FFMPEG_PATH` and `FFPROBE_PATH`), run the app, and generate synthetic fixtures:

```sh
npm run fixtures
node scripts/smoke.mjs
node scripts/smoke-audio.mjs
node scripts/smoke-avi.mjs
```

Smoke scripts default to `http://127.0.0.1:3213`; set `BASE_URL` to test another port. The first script accepts `SMOKE_VIDEO` for another 8-second, 30-fps test input. Smoke tests create projects/exports on the server; use a test instance. The basic smoke test intentionally retains its project for inspection; the audio/AVI tests clean up their projects on success.

`scripts/native-matrix.mjs` checks native encoding at all five supported frame rates in a configured Linux environment. Generated files stay in ignored `test-output/`; no sample game footage is needed.

An optional legacy Windows adapter remains in the source: set `USM_BACKEND=medianoche` and `ENCODER_PATH` to your own legally obtained encoder, plus FFmpeg/FFprobe as needed. No proprietary executable or SDK is supplied. The default Linux backend is native; this optional adapter is not required for the container.

## License and attribution

Original USM Forge code and documentation are under [MIT](LICENSE). Third-party components retain their respective terms; read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

CriCodecs has a public maintainer permission statement recorded in `docs/legal/`; it is not labeled MIT or Apache by this project. The Debian FFmpeg build uses GPL components. No game assets, private uploads, proprietary encoders, or downloaded upstream implementation source are included in this repository.

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Validation scope: [docs/VALIDATION.md](docs/VALIDATION.md).
