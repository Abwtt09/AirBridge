#!/usr/bin/env bash
set -euo pipefail
export PATH="/ucrt64/bin:/usr/bin:$PATH"
cd "$(cygpath -u "$AIRBRIDGE_WORKSPACE")"
gcc scripts/audio-probe.c vendor/uxplay/renderers/audio_renderer.c vendor/uxplay/lib/logger.c -o artifacts/audio-probe.exe $(pkg-config --cflags --libs gstreamer-1.0 gstreamer-app-1.0) -lm
