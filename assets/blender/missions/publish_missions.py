"""Publish and verify the mission cards under their strict shipping budgets."""
from pathlib import Path
import json,sys
from PIL import Image,ImageDraw
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];OUT=ROOT/'apps/web/public/renders/missions';OUT.mkdir(parents=True,exist_ok=True)
ids=sys.argv[1:] or ['M7','M3','M6','M9'];records=json.loads((HERE/'mission-thumbs.json').read_text()) if (HERE/'mission-thumbs.json').exists() else []
for key in ids:
 master=HERE/(key+'.png');im=Image.open(master).convert('RGB');assert im.size==(1280,720)
 thumb=im.resize((640,360),Image.Resampling.LANCZOS);dest=OUT/(key+'.webp')
 for quality in [94,90,86,82,78,74,70,65,60]:
  thumb.save(dest,'WEBP',quality=quality,method=6)
  if dest.stat().st_size<=60000:break
 assert dest.stat().st_size<=60000,(key,dest.stat().st_size)
 assert Image.open(dest).size==(640,360)
 records=[r for r in records if r['id']!=key]+[{'id':key,'file':str(dest.relative_to(ROOT)),'master':str(master.relative_to(ROOT)),'blend':str((HERE/(key+'.blend')).relative_to(ROOT)),'width':640,'height':360,'bytes':dest.stat().st_size,'quality':quality,'robot':'all_rounder','camera':'shared 3/4 side','author':'sergio.pulido@alodai.com'}]
 print(key,dest.stat().st_size,'bytes',flush=True)
(HERE/'mission-thumbs.json').write_text(json.dumps(records,indent=2)+'\n')
core=['M7','M3','M6','M9'];sheet=Image.new('RGB',(1280,720))
for i,key in enumerate(core):
 if (OUT/(key+'.webp')).exists():sheet.paste(Image.open(OUT/(key+'.webp')),(i%2*640,i//2*360))
sheet.save(HERE/'core_contact_sheet.png')
