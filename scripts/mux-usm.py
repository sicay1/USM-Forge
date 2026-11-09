"""Native, version-pinned CRI mux bridge. Called with an elementary MPEG-1 stream."""
import json
import sys
from pathlib import Path
from cricodecs import usm

if len(sys.argv) not in (3, 4):
    raise SystemExit('Usage: mux-usm.py video.m1v output.usm [audio.adx]')
video, output = sys.argv[1:3]
tracks = [usm.UsmMuxAudioTrack(sys.argv[3], filename='audio.adx')] if len(sys.argv) == 4 else []
config = usm.UsmMuxConfig(video_path=video, video_filename='video.m1v', audio_tracks=tracks)
usm.mux(config, output)
print(json.dumps({'muxer': 'cricodecs', 'version': '1.2.0', 'bytes': Path(output).stat().st_size}))
