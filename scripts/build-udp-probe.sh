#!/usr/bin/env bash
set -euo pipefail
export PATH="/ucrt64/bin:/usr/bin:$PATH"
cd "$(cygpath -u "$AIRBRIDGE_WORKSPACE")"
gcc scripts/udp-probe.c vendor/uxplay/build/lib/libairplay.a -o artifacts/udp-probe.exe $(pkg-config --cflags --libs libplist-2.0 openssl) -lws2_32 -liphlpapi -lpthread -lm
./artifacts/udp-probe.exe
