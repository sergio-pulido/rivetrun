"""Publish cards, ordered lineup and optional OG. Author sergio.pulido@alodai.com."""
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];OUT=ROOT/'apps/web/public/renders/presets';OUT.mkdir(parents=True,exist_ok=True);data=json.loads((HERE/'render-inputs.json').read_text());manifest_path=HERE/'preset-renders.json'
step=sys.argv[1];manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'author':data['author'],'presetSource':data['presetSource'],'order':[p['id'] for p in data['presets']],'cards':[],'sameCameraAndScale':True}
def webp(image,path,budget):
 for q in [95,92,89,86,82,78]:
  image.save(path,'WEBP',quality=q,method=6)
  if path.stat().st_size<=budget:return path.stat().st_size,q
 raise ValueError(str(path)+' exceeds budget')
if step=='cards':
 sheet=Image.new('RGBA',(600,172),(14,16,19,255));draw=ImageDraw.Draw(sheet);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',13);manifest['cards']=[]
 for i,preset in enumerate(data['presets']):
  key=preset['id'];master=Image.open(HERE/(key+'.png')).convert('RGBA');assert master.size==(1024,1024) and master.getchannel('A').getextrema()==(0,255)
  path=OUT/(key+'.webp');size,q=webp(master.resize((768,768),Image.Resampling.LANCZOS),path,150000)
  thumb=Image.open(path).convert('RGBA').resize((120,120),Image.Resampling.LANCZOS);sheet.alpha_composite(thumb,(i*150+15,8));draw.text((i*150+15,141),key,font=font,fill=(237,239,242,255))
  manifest['cards'].append({'id':key,'master':str((HERE/(key+'.png')).relative_to(ROOT)),'file':str(path.relative_to(ROOT)),'url':'/renders/presets/'+path.name,'sizeBytes':size,'resolutionPx':[768,768],'quality':q,'renderedParts':preset['renderedParts'],'missingParts':preset['missingParts']})
 sheet.convert('RGB').save(HERE/'readability_120px.png',optimize=True)
elif step=='lineup':
 image=Image.new('RGBA',(2400,900))
 for i,preset in enumerate(data['presets']):
  card=Image.open(HERE/(preset['id']+'.png')).convert('RGBA').resize((750,750),Image.Resampling.LANCZOS);image.alpha_composite(card,(i*550,75))
 image.save(HERE/'lineup.png',optimize=True);path=OUT/'lineup.webp';size,q=webp(image,path,400000);manifest['lineup']={'file':str(path.relative_to(ROOT)),'url':'/renders/presets/lineup.webp','sizeBytes':size,'resolutionPx':[2400,900],'quality':q,'order':manifest['order'],'placementPx':{'cardSize':750,'stepX':550,'top':75},'transparent':True}
elif step=='og':
 image=Image.new('RGB',(1200,630),(14,16,19));draw=ImageDraw.Draw(image);title=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',78);tag=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',29)
 draw.rectangle((68,60,130,67),fill=(255,122,26));draw.text((66,88),'RIVETRUN',font=title,fill=(237,239,242));draw.text((69,185),'Build a real robot. Let the AI drive.',font=tag,fill=(201,206,214))
 lineup=Image.open(OUT/'lineup.webp').convert('RGBA').resize((1160,435),Image.Resampling.LANCZOS);image.paste(lineup,(20,190),lineup);path=ROOT/'apps/web/public/og.png';image.save(path,optimize=True);assert path.stat().st_size<=300000,path.stat().st_size;manifest['og']={'file':'apps/web/public/og.png','sizeBytes':path.stat().st_size,'resolutionPx':[1200,630],'background':'#0e1013, app ground token','title':'RIVETRUN','tagline':'Build a real robot. Let the AI drive.'}
else:raise ValueError(step)
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n');print(step,json.dumps(manifest.get(step,manifest.get('cards')),ensure_ascii=False))
