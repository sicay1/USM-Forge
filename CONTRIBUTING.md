# Contributing

Run `npm ci` and `npm test` with Node.js 22 or newer. Runtime media checks require FFmpeg/FFprobe and the native Python dependencies; the Dockerfile supplies them.

Please explain the user-visible problem and relevant validation in a pull request. Add focused tests for changes to frame math, cue serialization, USM metadata, or media handling. Do not commit `node_modules`, user media, game assets, generated exports, or proprietary tools. Use `npm run fixtures` to create synthetic test inputs.

Only contribute code and assets you have the right to share. Original contributions are submitted under this repository's MIT license; third-party additions need their own compatible terms and attribution. Do not silently copy upstream code or assign MIT to someone else's dependency.

Project files retain the `usm-studio/v1` schema identifier for compatibility with existing projects. Display branding is USM Forge; changing the schema identifier would require an explicit migration.
