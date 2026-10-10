"""Lossless dimensions and transparency; palette-compress Blender PNGs to budget.
Author: sergio.pulido@alodai.com. Run with the bundled Pillow Python runtime.
"""
from pathlib import Path
import json
from PIL import Image, PngImagePlugin
ROOT=Path(__file__).resolve().parents[3]
owned_parts={p['id'] for p in json.loads((ROOT/'docs/inputs/printed-parts.json').read_text())}
owned_parts.update(p['key'] for p in json.loads((ROOT/'docs/inputs/bom-mk2.json').read_text())['items'])
owned_tools={'fdm_printer','laser_cutter','soldering_station','oscilloscope','laptop','workbench'}
folders={'parts':ROOT/'apps/web/public/renders/parts','tools':ROOT/'apps/web/public/renders/tools','envelopes':Path(__file__).resolve().parent/'envelope-renders'}
for folder,directory in folders.items():
    for path in directory.glob('*.png'):
        if path.stem not in (owned_tools if folder=='tools' else owned_parts):continue
        with Image.open(path) as source:
            rgba=source.convert('RGBA')
            assert rgba.size==(1024,1024),(path,rgba.size)
            assert rgba.getchannel('A').getextrema()[0]==0,(path,'not transparent')
            info=PngImagePlugin.PngInfo()
            info.add_text('Author','sergio.pulido@alodai.com')
            info.add_text('Source','Original Blender geometry; MK-II v2')
            for colors in (256,192,128,96,64):
                palette=rgba.quantize(colors=colors,method=Image.Quantize.FASTOCTREE)
                palette.save(path,optimize=True,pnginfo=info)
                if path.stat().st_size<=300_000:break
            assert path.stat().st_size<=300_000,(path,path.stat().st_size)
            print(path.name,path.stat().st_size)
