"""Verify the screen-first Tier 1/2 sheets. Author: sergio.pulido@alodai.com."""
import json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
a=json.loads((ROOT/'docs/inputs/component-models.json').read_text());b=json.loads((ROOT/'assets/blender/parts/tier2-render-manifest.json').read_text());entries={p['key']:p for p in a+b}
keys={p['key'] for p in json.loads((ROOT/'docs/inputs/bom-mk2.json').read_text())['items']}
for key,p in entries.items():
 assert key in keys
 path=ROOT/p['render'];assert path.stat().st_size<=300000
 with Image.open(path) as im:
  assert im.size==(1024,1024)
  alpha=im.convert('RGBA').getchannel('A');assert alpha.getextrema()==(0,255)
  bounds=alpha.getbbox();fill=max(bounds[2]-bounds[0],bounds[3]-bounds[1])/1024
  assert .55<=fill<=.9,(key,fill)
for key in ['ambient_light_veml7700','geiger_counter_mightyohm','brushless_motor_dfrobot_fit0441']:
 p=next(p for p in a if p['key']==key);assert p['approximate'] is True and p['glb'] is None and p['dimsSource']=='not published; proportions from product photos'
 assert not (ROOT/'apps/web/public/models/parts'/(key+'.glb')).exists()
print('PASS:',len(entries),'BOM part renders, 1024px, alpha, <=300KB; approximate items have no GLB.')
