"""Check rendered preset outputs and their declared source parts."""
from pathlib import Path
import json
from PIL import Image
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];inputs=json.loads((HERE/'render-inputs.json').read_text());manifest=json.loads((HERE/'preset-renders.json').read_text())
assert manifest['order']==[p['id'] for p in inputs['presets']]==['speedster','mud_crawler','all_rounder','deep_diver']
for preset,card in zip(inputs['presets'],manifest['cards']):
 b=preset['build'];wanted=['chassis','controller',b['locomotion'],b['motor'],b['battery'],*b['sensors'],*b['extras']];assert card['renderedParts']==[p for p in wanted if p not in card['missingParts']]
 assert card['missingParts']=={'speedster':[],'mud_crawler':['piston_jump'],'all_rounder':[],'deep_diver':['thruster_kit']}[preset['id']]
 for p in card['renderedParts']:assert (ROOT/inputs['models'][p]['source']).is_file()
 with Image.open(ROOT/card['master']) as image:assert image.size==(1024,1024) and image.convert('RGBA').getchannel('A').getextrema()==(0,255)
 path=ROOT/card['file'];assert path.stat().st_size==card['sizeBytes']<=150000
 with Image.open(path) as image:assert image.size==(768,768) and image.convert('RGBA').getchannel('A').getextrema()==(0,255)
assert manifest['sameCameraAndScale'] and json.loads((HERE/'assembly-manifest.json').read_text())['sameCameraAndScale']
for key,dims,budget,transparent in [('lineup',(2400,900),400000,True),('og',(1200,630),300000,False)]:
 if key not in manifest:continue
 item=manifest[key];path=ROOT/item['file'];assert path.stat().st_size==item['sizeBytes']<=budget
 with Image.open(path) as image:
  assert image.size==dims
  if transparent:assert image.convert('RGBA').getchannel('A').getextrema()==(0,255)
print('PASS exact source-part lists, disclosed absent piston_jump/thruster_kit, common camera/scale, RGBA masters and shipped sizes/budgets:',[c['sizeBytes'] for c in manifest['cards']],'; lineup/OG:',{k:manifest[k]['sizeBytes'] for k in ['lineup','og'] if k in manifest})

import hashlib
for key,sha in json.loads((HERE/"unchanged-card-hashes.json").read_text()).items():assert hashlib.sha256((ROOT/"apps/web/public/renders/presets"/(key+".webp")).read_bytes()).hexdigest()==sha,key
print("PASS all_rounder and deep_diver runtime cards remain byte-for-byte unchanged.")
