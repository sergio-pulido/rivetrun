"""Composite the matched Blender foreground over both full parallax sets, no gameplay edits."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
HERE=Path(__file__).resolve().parent
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',24)
small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',14)
for label in ['before','after']:
 canvas=Image.new('RGBA',(1280,720));d=ImageDraw.Draw(canvas)
 for y in range(720):
  if y<170:
   t=y/170;c=tuple(round(a+(b-a)*t) for a,b in zip((29,42,57),(46,61,76)))
  elif y>490:
   t=(y-490)/230;c=tuple(round(a+(b-a)*t) for a,b in zip((37,40,41),(25,29,31)))
  else:c=(46,61,76)
  d.line((0,y,1279,y),fill=c+(255,))
 pano=Image.open(HERE/(label+'_panorama.png')).convert('RGBA').resize((1280,320),Image.Resampling.LANCZOS);canvas.alpha_composite(pano,(0,170))
 foreground=Image.open(HERE/(label+'_foreground.png')).convert('RGBA');assert foreground.size==canvas.size;canvas.alpha_composite(foreground)
 d=ImageDraw.Draw(canvas);d.text((30,27),'ANTES · M7 actual' if label=='before' else 'PROPUESTA · M7 variación',font=font,fill=(224,229,230));d.text((30,64),'Misma cámara, iluminación y MK-II · revisión de assets',font=small,fill=(147,163,175));canvas.convert('RGB').save(HERE/(label+'_1280x720.png'),optimize=True)
