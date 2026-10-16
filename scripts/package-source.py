"""Package AirBridge plus the actual modified UxPlay sources for review.
Third-party runtime corresponding source is a separate public-release obligation.
"""
from pathlib import Path
import zipfile
import json
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
destination=root/f'artifacts/AirBridge-{version}-source.zip'
files=['README.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore','.gitattributes']
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name in files:archive.write(root/name,'AirBridge/'+name)
    for directory in ['src','src-tauri','docs','scripts','engine','vendor/uxplay','.github']:
        if not (root/directory).exists():continue
        for p in sorted((root/directory).rglob('*')):
            if not p.is_file():continue
            rel=p.relative_to(root)
            if any(part in {'.git','target','build','gen','runtime','__pycache__'} for part in rel.parts):continue
            archive.write(p,'AirBridge/'+rel.as_posix())
print(destination)
