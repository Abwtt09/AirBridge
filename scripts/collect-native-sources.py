"""Collect exact MSYS2 source archives for every redistributed native binary.
Builds an inventory from the local pacman database, not a hand-written license list.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
app_version=json.loads((root/'package.json').read_text())['version']
parser = argparse.ArgumentParser()
parser.add_argument('--msys-root', type=Path, default=root/'.tools/msys64')
parser.add_argument('--plan-only', action='store_true')
args = parser.parse_args()
def sections(path):
    result = {}; field = None
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.startswith('%') and line.endswith('%'): field=line.strip('%'); result[field]=[]
        elif line and field: result[field].append(line)
    return result
owners = {}
for directory in (args.msys_root/'var/lib/pacman/local').iterdir():
    if not (directory/'desc').exists() or not (directory/'files').exists(): continue
    info=sections(directory/'desc')
    for name in sections(directory/'files').get('FILES',[]):
        if name.startswith('ucrt64/') and name.lower().endswith(('.dll','.exe')):
            owners[Path(name).name.lower()]=info
packages={}
for binary in sorted((root/'engine/runtime').rglob('*')):
    if binary.suffix.lower() not in {'.dll','.exe'} or binary.name.lower()=='uxplay.exe': continue
    info=owners.get(binary.name.lower())
    if not info: raise RuntimeError(f'No native package owns {binary.name}')
    name=info['NAME'][0]; base=info.get('BASE',[name])[0]; version=info['VERSION'][0]
    packages.setdefault(name,{'name':name,'base':base,'version':version,'licenses':info.get('LICENSE',[]),'upstream':info.get('URL',[''])[0],'binaries':[]})['binaries'].append(binary.relative_to(root/'engine/runtime').as_posix())
archives={}
for package in packages.values():
    filename=f"{package['base']}-{package['version'].split(':')[-1]}.src.tar.zst"
    archives.setdefault(filename, {'filename':filename,'url':f'https://repo.msys2.org/mingw/sources/{filename}','packages':[]})['packages'].append(package['name'])
inventory={'formatVersion':1,'repository':'https://github.com/Abwtt09/AirBridge','packages':list(packages.values()),'sourceArchives':list(archives.values())}
(root/'docs/native-dependencies.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf-8')
print(f'Inventoried {len(packages)} native packages / {len(archives)} source archives',flush=True)
if args.plan_only: raise SystemExit(0)
destination=root/'artifacts/native-sources'; destination.mkdir(parents=True,exist_ok=True)
def fetch(item):
    target=destination/item['filename']
    if not target.exists():
        request=urllib.request.Request(item['url'],headers={'User-Agent':'AirBridge-release-source-collector/0.1'})
        with urllib.request.urlopen(request,timeout=90) as response, target.with_suffix('.part').open('wb') as output:
            while block:=response.read(1024*1024): output.write(block)
        target.with_suffix('.part').replace(target)
    item['sha256']=hashlib.file_digest(target.open('rb'),'sha256').hexdigest()
    item['bytes']=target.stat().st_size
    return item
failures=[]
with ThreadPoolExecutor(max_workers=5) as pool:
    tasks={pool.submit(fetch,item):item for item in inventory['sourceArchives']}
    for future in as_completed(tasks):
        item=tasks[future]
        try:
            result=future.result(); print(f"Source ready: {result['filename']} ({result['bytes']/1024**2:.1f} MiB)",flush=True)
        except Exception as error:
            failures.append(item['filename']); print(f"Source unavailable: {item['filename']}: {error}",flush=True)
(root/'docs/native-dependencies.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf-8')
if failures: raise RuntimeError(f'Missing corresponding source archives: {failures}')
release=root/'artifacts/release'; release.mkdir(parents=True,exist_ok=True)
part=1; size=0; archive=None
try:
    for item in inventory['sourceArchives']:
        if archive is None or size+item['bytes']>700*1024**2:
            if archive: archive.close()
            archive=zipfile.ZipFile(release/f'AirBridge-{app_version}-native-sources-part{part}.zip','w',zipfile.ZIP_STORED)
            archive.write(root/'docs/native-dependencies.json','native-dependencies.json')
            archive.write(root/'docs/BUILD.md','BUILD.md'); size=0; part+=1
        archive.write(destination/item['filename'],item['filename']); size+=item['bytes']
finally:
    if archive: archive.close()
print(f'Packaged {part-1} corresponding-source assets',flush=True)
