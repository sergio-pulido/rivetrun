"""Small original concrete texture for M7 props. Author: sergio.pulido@alodai.com."""
import random
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
HERE=Path(__file__).resolve().parent;OUT=HERE/'textures';OUT.mkdir(exist_ok=True)
r=random.Random(7007);n=256
im=Image.new('RGB',(n,n));pixels=im.load()
for y in range(n):
 for x in range(n):
  noise=r.gauss(0,9);stain=8*((x//32+y//40)%3-1)
  pixels[x,y]=(int(max(0,min(255,151+noise+stain))),int(max(0,min(255,147+noise+stain))),int(max(0,min(255,137+noise+stain))))
d=ImageDraw.Draw(im)
for i in range(1500):
 x=r.randrange(n);y=r.randrange(n);v=r.randrange(92,185);radius=r.choice([.3,.5,1,1.5]);d.ellipse((x-radius,y-radius,x+radius,y+radius),fill=(v,v,v-4))
im=im.filter(ImageFilter.GaussianBlur(.25));im.save(OUT/'concrete_basecolor.png',optimize=True)
print('Original concrete tile:',(OUT/'concrete_basecolor.png').stat().st_size,'bytes')
