#!/usr/bin/env bash
set -euo pipefail
export PATH="/ucrt64/bin:/usr/bin:$PATH"
cd "$(cygpath -u "$AIRBRIDGE_WORKSPACE")"
cmake -S vendor/uxplay -B vendor/uxplay/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DNO_MARCH_NATIVE=ON -DUSE_MDNS=ON
cmake --build vendor/uxplay/build -j 4
