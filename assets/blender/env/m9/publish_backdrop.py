"""Encode original Blender layers within mobile budgets. Author: sergio.pulido@alodai.com."""
import json
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3];OUT=ROOT/'apps/web/public/env/m9';MANIFEST=ROOT/'docs/inputs/m9-env.json'
manifest=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'version':1,'mission':'M9','name':'Polar Night','author':'sergio.pulido@alodai.com','layers':[],'props':[]}
entries=[]
for key,parallax,z in [('far_ice',.12,-140),('mid_station',.35,-95),('near_snow',.65,-60)]:
 png=OUT/(key+'.png');im=Image.open(png if png.exists() else OUT/(key+'.webp')).convert('RGBA');assert im.size==(4096,1024)
 path=OUT/(key+'.webp')
 if png.exists():
  for quality in [94,90,86,82,78]:
   im.save(path,format='WEBP',quality=quality,method=6)
   if path.stat().st_size<=600000:break
 assert path.stat().st_size<=600000,(key,path.stat().st_size)
 assert Image.open(path).convert('RGBA').getchannel('A').getextrema()==(0,255)
 entries.append({'id':key,'file':path.name,'url':'/env/m9/'+path.name,'sizeBytes':path.stat().st_size,'resolutionPx':[4096,1024],'suggestedScale':1,'suggestedWorldSizeM':[160,40],'parallaxFactor':parallax,'suggestedZ':z,'alpha':True,'cameraDepressionDegrees':15,'horizonFromTop':.4,'repeatX':False})
 if png.exists():png.unlink()
manifest['layers']=entries;manifest['backdropNotes']='Layer order far → mid → near; transparent artwork over the game sky. Far-ground horizon is around 40% from the top. Images share one 15-degree side camera. The foreground snowdrifts are deliberately low. Suggested parallax factors are integration guidance, not simulation changes.'
MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n')
# A source-only composite for art review; not an additional runtime texture.
preview=Image.new('RGBA',(4096,1024));p=preview.load()
for y in range(1024):
 t=min(1,y/(1024*.47));top=(7,13,29);horizon=(31,55,87)
 colour=tuple(round(top[i]*(1-t)+horizon[i]*t) for i in range(3))+(255,)
 for x in range(4096):p[x,y]=colour
for entry in entries:preview=Image.alpha_composite(preview,Image.open(OUT/entry['file']).convert('RGBA'))
preview.resize((2048,512),Image.Resampling.LANCZOS).save(HERE/'parallax_preview.png',optimize=True)
print('M9 layer bytes:',[(e['id'],e['sizeBytes']) for e in entries])
