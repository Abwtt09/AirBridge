#!/usr/bin/env bash
set -euo pipefail
export PATH="/ucrt64/bin:/usr/bin:$PATH"
cd "$(cygpath -u "$AIRBRIDGE_WORKSPACE")"
gcc scripts/network-policy-probe.c -o artifacts/network-policy-probe.exe -lws2_32 -liphlpapi
./artifacts/network-policy-probe.exe
