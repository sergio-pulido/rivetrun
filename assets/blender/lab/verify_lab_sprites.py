"""Validate 256px lab atlas entries. Author: sergio.pulido@alodai.com."""
from pathlib import Path
import json
from PIL import Image,PngImagePlugin,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3]
manifest=json.loads((ROOT/'docs/inputs/lab-sprites.json').read_text())
expected={'robot_wheels','robot_offroad','robot_tracks','parcel','delivery_bay','forklift','soil_sample_marker','lander','flag_cyan','flag_orange','stairs','door','wall','floor_concrete','floor_regolith','floor_wood'}
assert {p['id'] for p in manifest['sprites']}==expected and len(manifest['sprites'])==16
for p in manifest['sprites']:
 path=ROOT/p['path']
 with Image.open(path) as im:
  rgba=im.convert('RGBA');assert rgba.size==(256,256)
  alpha=rgba.getchannel('A');assert alpha.getextrema()==(0,255)
  b=alpha.getbbox();assert 0<b[0]<b[2]<256 and 0<b[1]<b[3]<256,(p['id'],'clipped',b)
  assert (b[2]-b[0])*(b[3]-b[1])>10000,(p['id'],'too small')
  meta=PngImagePlugin.PngInfo();meta.add_text('Author','sergio.pulido@alodai.com');meta.add_text('Sprite',p['id']);rgba.save(path,optimize=True,pnginfo=meta)
 assert path.stat().st_size<64000,(p['id'],'mobile asset budget')
 p['bytes']=path.stat().st_size
(ROOT/'docs/inputs/lab-sprites.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Review sheet is an authoring artifact, not another game sprite.
labels=['Ruedas','Todoterreno','Orugas','Paquete','Entrega','Carretilla','Muestra','Lander','Bandera cian','Bandera naranja','Escalera','Puerta','Muro','Hormigón','Regolito','Madera']
canvas=Image.new('RGB',(896,1024),(13,20,29));draw=ImageDraw.Draw(canvas)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
for i,(p,label) in enumerate(zip(manifest['sprites'],labels)):
 x=(i%4)*224;y=(i//4)*256
 draw.rounded_rectangle((x+5,y+5,x+219,y+251),radius=12,fill=(24,35,47))
 with Image.open(ROOT/p['path']) as im:
  thumb=im.convert('RGBA').resize((192,192),Image.Resampling.LANCZOS);canvas.paste(thumb,(x+16,y+13),thumb)
 draw.text((x+112,y+223),label,font=font,fill=(224,236,239),anchor='mm')
canvas.save(ROOT/'assets/blender/lab/preview_sheet.png',optimize=True)
print('PASS: 16 lab sprites, transparent 256px, no clipping, each <64KB; total',sum(p['bytes'] for p in manifest['sprites']),'bytes.')
