from PIL import Image
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[4]
for label,folder in [('before',ROOT/'apps/web/public/env/m7'),('after',HERE/'candidate')]:
 canvas=Image.new('RGBA',(2048,512));pix=canvas.load()
 stops=[(0,(46,61,76)),(.4,(109,117,117)),(.68,(92,86,76)),(1,(37,40,41))]
 for y in range(512):
  t=y/511
  for (a,c),(b,d) in zip(stops,stops[1:]):
   if a<=t<=b:
    f=(t-a)/(b-a);colour=tuple(round(c[i]+(d[i]-c[i])*f) for i in range(3))+(255,);break
  for x in range(2048):pix[x,y]=colour
 for k in ['far_skyline','mid_ruins','near_rubble']:
  path=folder/(k+'.webp');path=path if path.exists() else folder/(k+'.png')
  assert path.exists(),path
  canvas.alpha_composite(Image.open(path).convert('RGBA').resize(canvas.size,Image.Resampling.LANCZOS))
 canvas.convert('RGB').save(HERE/(label+'_panorama.png'))
