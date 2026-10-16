from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]/'src-tauri'/'icons'
root.mkdir(parents=True,exist_ok=True)
im=Image.new('RGBA',(1024,1024));d=ImageDraw.Draw(im)
d.rounded_rectangle((24,24,1000,1000),radius=240,fill='#007AFF')
for box,width in [((222,204,802,784),45),((320,302,704,686),42)]:
    d.arc(box,205,335,fill='white',width=width)
d.rounded_rectangle((445,424,579,558),radius=67,fill='white')
d.polygon([(512,590),(338,791),(686,791)],fill='white')
for size in [32,128,256]: im.resize((size,size),Image.Resampling.LANCZOS).save(root/f'{size}x{size}.png')
im.save(root/'icon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
