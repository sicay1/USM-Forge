# Before publishing a prebuilt image

Building this Dockerfile locally and distributing its resulting image are different activities. This repository provides source and local build instructions. No public registry image is advertised or automatically published by its CI.

Before a binary release:

1. Record the final image digest, architecture, base-image digest, package versions, build configuration, and dependency inventory/SBOM. Tags and Debian package versions can move between builds.
2. Keep copyright and license notices for all included components, not just the application. Check the exact FFmpeg build and its linked libraries; the tested Debian build has GPL enabled.
3. Arrange a compliant way to provide corresponding source for covered binaries, including applicable distribution patches and build information. A version-matched source bundle with the binary release is a practical approach. An upstream homepage link alone is not a completed source-distribution process.
4. Include the CriCodecs permission record and check licenses/provenance of code incorporated upstream. A permissive statement from one maintainer is not a substitute for rights held by other authors.
5. Scan the final image and layers for secrets, user media, proprietary encoder components, and accidental development artifacts. Do not export a running user's data volume as part of an image release.
6. Publish license/source links alongside the exact binary image release, and retain the records for the required period under applicable terms.

References: [FFmpeg legal](https://ffmpeg.org/legal.html), [GNU on binary redistribution](https://www.gnu.org/licenses/gpl-faq.html#UnchangedJustBinary), [GNU on separate programs and aggregates](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation).

This checklist is not a certification of legal compliance. It has not been completed for a public USM Forge image release. Patent, trademark, media rights, and proprietary SDK agreements are separate from the application's MIT license.
