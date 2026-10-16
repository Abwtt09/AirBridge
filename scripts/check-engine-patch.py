"""Check clean-source reproducibility and idempotency without changing the receiver."""
import hashlib
from pathlib import Path
import subprocess
import sys

workspace = Path(__file__).resolve().parents[1]
upstream = workspace / 'vendor/uxplay'
metadata = workspace / '.tools/uxplay-upstream.git'
if (upstream/'.git').exists(): metadata = upstream/'.git'
if not metadata.exists():
    metadata = workspace/'artifacts/upstream-source.git'
    metadata.parent.mkdir(parents=True, exist_ok=True)
    if not metadata.exists():
        subprocess.run(['git','init','--bare',str(metadata)],check=True,capture_output=True)
        subprocess.run(['git','--git-dir',str(metadata),'fetch','--depth=1','https://github.com/FDH2/UxPlay.git','ec203121355220dd90278a369eeabb0b8ba4f14a'],check=True)
scratch = workspace / 'artifacts/patch-repro-check'
files = [
    'uxplay.cpp', 'renderers/audio_renderer.c', 'renderers/audio_renderer.h',
    'lib/httpd.c', 'lib/http_request.c', 'lib/raop.c', 'lib/raop_handlers.h',
    'lib/netutils.c', 'lib/raop_ntp.c', 'lib/raop_rtp.c',
]
for name in files:
    content = subprocess.run(['git', '--git-dir', str(metadata), 'show', f'ec203121355220dd90278a369eeabb0b8ba4f14a:{name}'], check=True, capture_output=True).stdout
    target = scratch / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
subprocess.run([sys.executable, str(workspace/'scripts/patch-engine.py'), str(scratch)], check=True)
files.append('lib/airbridge_network.h')
def digest(root, name):
    # Ignore line-ending differences between Git's original data and Windows checkout.
    return hashlib.sha256((root/name).read_text(encoding='utf-8').encode()).hexdigest()
expected = {name:digest(upstream,name) for name in files}
actual = {name:digest(scratch,name) for name in files}
assert expected == actual, [name for name in files if expected[name] != actual[name]]
subprocess.run([sys.executable, str(workspace/'scripts/patch-engine.py'), str(scratch)], check=True)
assert actual == {name:digest(scratch,name) for name in files}, 'Second application changed patched source'
print('Clean-source reproduction and idempotency passed for all 11 native files.')
