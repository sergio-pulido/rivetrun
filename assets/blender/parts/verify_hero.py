"""Hero image checks. Author: sergio.pulido@alodai.com."""
from pathlib import Path
from PIL import Image,PngImagePlugin
ROOT=Path(__file__).resolve().parents[3]
p=ROOT/'apps/web/public/renders/mk2/default_build_hero.png'
with Image.open(p) as im:
 assert im.size==(1920,1080)
 rgba=im.convert('RGBA');alpha=rgba.getchannel('A');assert alpha.getextrema()==(0,255)
 b=alpha.getbbox();fill=max((b[2]-b[0])/1920,(b[3]-b[1])/1080);assert .65<fill<.95
 info=PngImagePlugin.PngInfo();info.add_text('Author','sergio.pulido@alodai.com');info.add_text('Preset','all_rounder; exact game GLBs');rgba.save(p,optimize=True,pnginfo=info)
 print('Hero verified',im.size,'frame fill',round(fill,3))
