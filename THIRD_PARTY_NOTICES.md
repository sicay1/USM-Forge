# Third-party notices

The root MIT license applies to the original USM Forge application code and documentation. It does not relicense third-party software, media, trademarks, or factual reference data. Dependencies retain their own terms. USM Forge is an independent project, not an official CRIWARE, Autodesk Scaleform, or Lineage II product.

## CriCodecs 1.2.0

- Project: https://github.com/Youjose/CriCodecs
- Package: https://pypi.org/project/cricodecs/1.2.0/
- Role: USM muxing, called by `scripts/mux-usm.py`.
- Status: no standard project-wide LICENSE/SPDX identifier was found in the checked v1.2.0 package and repository. Do not label this dependency MIT, Apache-2.0, or public domain.
- Permission: on 2026-11-01, repository owner Youjose publicly permitted use, editing, and redistribution in response to a question explicitly about the 1.2.0 package and bundling it in another application. Source: https://github.com/Youjose/CriCodecs/issues/25#issuecomment-6552929658
- A short evidence record is in [docs/legal/cricodecs-permission.json](docs/legal/cricodecs-permission.json). It is a local record, not a trusted timestamp, standard license text, or independent legal certification.

The maintainer describes origins in other tools/ports. That statement does not resolve the rights of every third-party contributor or component. An exhaustive upstream provenance review has not been completed. Requirements pin the package and wheel hashes; they do not certify licensing or security.

`lib/usm.mjs` implements USM/@UTF handling with layout references to CriCodecs and generated Medianoche metadata. `test/usm.test.mjs` contains a small cue metadata fixture, not game video/audio or proprietary encoder code. No downloaded CriCodecs implementation source is vendored in this repository.

## FFmpeg

- Project and licensing: https://ffmpeg.org/legal.html
- Installed from Debian by the Dockerfile, executed as a separate program.
- Encodes MPEG-1 and ADX for USM; H.264/AAC for browser previews; also handles input decoding and validation.

The Debian build tested with this project enables GPL components, including x264/x265. Do not describe that build as LGPL-only. Exact terms depend on the installed build and libraries. Preserve `/usr/share/doc/*/copyright` and applicable license texts. Distributing a prebuilt image entails obligations for the binaries it contains, including corresponding-source requirements where applicable. Merely linking upstream or publishing the USM Forge source does not by itself discharge those obligations.

See [the image distribution checklist](docs/IMAGE_DISTRIBUTION.md). This source repository does not supply a completed corresponding-source bundle for a public binary-image release.

## Runtime and base image

- Node.js: https://github.com/nodejs/node/blob/main/LICENSE — the main project uses MIT; bundled components have additional notices.
- Python: https://docs.python.org/3/license.html — Python and incorporated software have their respective terms.
- Debian packages: individual copyright/license records under `/usr/share/doc/` in the image. The base image is not covered by a single USM Forge license.

## Development dependencies

`package-lock.json` records the development-only npm dependencies used by the tests. Their declared licenses at preparation time are:

| Package | Version | Declared license |
|---|---|---|
| happy-dom | 21.0.4 | MIT |
| entities | 7.0.1 | BSD-2-Clause |
| @types/node | 26.6.6 | MIT |
| @types/whatwg-mimetype | 3.0.2 | MIT |
| @types/ws | 8.18.2 | MIT |
| buffer-image-size | 0.6.4 | MIT |
| undici-types | 8.9.0 | MIT |
| whatwg-mimetype | 3.0.0 | MIT |
| ws | 8.22.2 | MIT |

Their installed packages contain the relevant notices. No `node_modules` directory or copies of these development packages are included in the source archive or runtime image.

## Optional proprietary backend and input media

The legacy Windows adapter can call a separately installed Medianoche encoder via `ENCODER_PATH`. No encoder, DLL, SDK, or right to obtain or redistribute one is provided. Users of that adapter must have appropriate rights under their own applicable terms. The Linux native image does not require it.

Users retain responsibility for rights to their input media. No game assets, user uploads, generated game-background samples, fonts, or official logos are bundled. Example videos used by the public smoke tests are generated locally from FFmpeg test patterns and a sine wave.
