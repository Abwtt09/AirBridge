"""Generate public license inventories for the actual locked dependency set."""
import json
from pathlib import Path
import shutil
import subprocess
import uuid

root=Path(__file__).resolve().parents[1]
metadata=json.loads(subprocess.run(['cargo','metadata','--locked','--offline','--format-version','1','--manifest-path',str(root/'src-tauri/Cargo.toml')],check=True,capture_output=True,text=True,encoding='utf-8').stdout)
components=[]
rust_licenses=root/'docs/rust-licenses'
rust_licenses.mkdir(parents=True,exist_ok=True)
for package in metadata['packages']:
    if package.get('source') is None: continue
    directory=Path(package['manifest_path']).parent
    target=rust_licenses/f"{package['name']}-{package['version']}"
    for pattern in ['LICENSE*','LICENCE*','COPYING*','NOTICE*','UNLICENSE*']:
        for file in directory.glob(pattern):
            if file.is_file(): target.mkdir(parents=True,exist_ok=True);shutil.copyfile(file,target/file.name)
    entry={'type':'library','name':package['name'],'version':package['version'],'purl':f"pkg:cargo/{package['name']}@{package['version']}"}
    if package.get('license'): entry['licenses']=[{'expression':package['license']}]
    components.append(entry)
lock=json.loads((root/'package-lock.json').read_text())
for path,package in lock['packages'].items():
    if not path or 'version' not in package: continue
    name=path.split('node_modules/')[-1]
    entry={'type':'library','name':name,'version':package['version'],'purl':f"pkg:npm/{name.replace('@','%40')}@{package['version']}", 'scope':'excluded' if package.get('dev') else 'required'}
    if isinstance(package.get('license'),str): entry['licenses']=[{'expression':package['license']}]
    components.append(entry)
    if not package.get('dev'):
        directory=root/path
        for pattern in ['LICENSE*','LICENCE*','COPYING*','NOTICE*']:
            for file in directory.glob(pattern):
                if file.is_file():
                    target=root/'docs/frontend-licenses'/f"{name.replace('/','_').replace('@','')}-{file.name}"
                    shutil.copyfile(file,target)
native=json.loads((root/'docs/native-dependencies.json').read_text())
for package in native['packages']:
    entry={'type':'library','name':package['name'],'version':package['version'],'purl':f"pkg:alpm/msys2/{package['name']}@{package['version']}"}
    expression=' AND '.join(x.removeprefix('spdx:') for x in package['licenses'])
    if expression: entry['licenses']=[{'expression':expression}]
    components.append(entry)
version=json.loads((root/'package.json').read_text())['version']
sbom={'bomFormat':'CycloneDX','specVersion':'1.5','serialNumber':f'urn:uuid:{uuid.uuid4()}','version':1,'metadata':{'component':{'type':'application','name':'AirBridge','version':version}},'components':components}
(root/'docs/sbom.cdx.json').write_text(json.dumps(sbom,indent=2)+'\n',encoding='utf-8')
print(f'Wrote CycloneDX inventory with {len(components)} components and local license copies')
