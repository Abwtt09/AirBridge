"""Collect integrity-checked npm runtime sources matching the published UI."""
import base64
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
lock = json.loads((root / 'package-lock.json').read_text())
version = lock['version']
cache = root / 'artifacts/npm-sources'
cache.mkdir(parents=True, exist_ok=True)
release = root / 'artifacts/release'
release.mkdir(parents=True, exist_ok=True)
records = []
with zipfile.ZipFile(release / f'AirBridge-{version}-frontend-sources.zip', 'w', zipfile.ZIP_STORED) as archive:
    for package_path, package in lock['packages'].items():
        if not package_path or package.get('dev') or not package.get('resolved'):
            continue
        name = package_path.split('node_modules/')[-1]
        filename = f"{name.replace('/', '_').replace('@', '')}-{package['version']}.tgz"
        target = cache / filename
        url = package['resolved']
        assert url.startswith('https://registry.npmjs.org/'), url
        if not target.exists():
            with urllib.request.urlopen(url, timeout=60) as response:
                target.write_bytes(response.read())
        algorithm, expected = package['integrity'].split('-', 1)
        actual = base64.b64encode(hashlib.new(algorithm, target.read_bytes()).digest()).decode()
        assert actual == expected, f'Integrity mismatch: {name}'
        archive.write(target, filename)
        records.append({'name': name, 'version': package['version'], 'file': filename,
                        'integrity': package['integrity'], 'url': url})
    archive.writestr('packages.json', json.dumps(records, indent=2) + '\n')
    archive.writestr('README.txt', 'Exact npm runtime package sources. Extract each .tgz to inspect source and licenses. package-lock.json in the application source fixes the full build dependency set.\n')
print(f'Collected {len(records)} integrity-checked frontend source packages')
