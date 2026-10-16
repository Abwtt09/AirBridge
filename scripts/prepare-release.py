"""Prepare reviewable release assets. Does not publish or expose signing secrets."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tomllib
import zipfile

root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
config=json.loads((root/'src-tauri/tauri.conf.json').read_text(encoding='utf-8-sig'))
assert version==config['version']
assert version==tomllib.loads((root/'src-tauri/Cargo.toml').read_text())['package']['version']
release=root/'artifacts/release';release.mkdir(parents=True,exist_ok=True)
native_parts=list(release.glob(f'AirBridge-{version}-native-sources-part*.zip'))
assert native_parts,'Collect matching native source packages before preparing a release'
expected_sources={item['filename'] for item in json.loads((root/'docs/native-dependencies.json').read_text())['sourceArchives']}
provided_sources=set()
for part in native_parts:
    with zipfile.ZipFile(part) as archive:
        provided_sources.update(name for name in archive.namelist() if name.endswith('.src.tar.zst'))
assert provided_sources==expected_sources,'Native source archive set does not match the runtime inventory'
filename=f'AirBridge_{version}_x64-setup.exe'
installer=root/'src-tauri/target/release/bundle/nsis'/filename
signature=Path(str(installer)+'.sig')
assert installer.is_file() and signature.is_file(),'Build a signed updater installer first'
for file in [installer,signature]: shutil.copyfile(file,release/file.name)
notes=(root/f'docs/releases/v{version}.md').read_text(encoding='utf-8')
manifest={'version':version,'notes':notes,'pub_date':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'platforms':{'windows-x86_64':{'url':f'https://github.com/Abwtt09/AirBridge/releases/download/v{version}/{filename}','signature':signature.read_text().strip()}}}
(release/'latest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
subprocess.run(['python',str(root/'scripts/package-source.py')],check=True)
subprocess.run(['python',str(root/'scripts/collect-frontend-sources.py')],check=True)
shutil.copyfile(root/f'artifacts/AirBridge-{version}-source.zip',release/f'AirBridge-{version}-source.zip')
vendor=root/'artifacts/cargo-vendor'
assert vendor.is_dir(),'Collect locked Rust dependency sources with cargo vendor first'
with zipfile.ZipFile(release/f'AirBridge-{version}-rust-sources.zip','w',zipfile.ZIP_DEFLATED,compresslevel=4) as archive:
    for file in sorted(vendor.rglob('*')):
        if file.is_file(): archive.write(file,'vendor/'+file.relative_to(vendor).as_posix())
    archive.writestr('config.toml','[source.crates-io]\nreplace-with = "vendored-sources"\n[source.vendored-sources]\ndirectory = "../vendor"\n')
    archive.writestr('README.txt','Extract beside the AirBridge app source. Copy config.toml into AirBridge/.cargo/config.toml and place vendor/ beside AirBridge/. The offline config resolves that sibling vendor directory. Build instructions and lockfile are in the app source.\n')
shutil.copyfile(root/'docs/sbom.cdx.json',release/'AirBridge-SBOM.cdx.json')
shutil.copyfile(root/'docs/native-dependencies.json',release/'native-dependencies.json')
assets=sorted(file for file in release.iterdir() if file.is_file() and file.name!='SHA256SUMS.txt')
hashes=[f"{hashlib.file_digest(file.open('rb'),'sha256').hexdigest()}  {file.name}" for file in assets]
(release/'SHA256SUMS.txt').write_text('\n'.join(hashes)+'\n')
print(f'Prepared {len(assets)+1} release assets in {release}')
