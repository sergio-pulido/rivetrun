from pathlib import Path
import json
from PIL import Image
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
records=json.loads((HERE/'mission-thumbs.json').read_text());assert {'M7','M3','M6','M9'} <= {r['id'] for r in records}
for r in records:
 p=ROOT/r['file'];im=Image.open(p);assert im.format=='WEBP' and im.size==(640,360);assert p.stat().st_size==r['bytes']<=60000;assert Image.open(ROOT/r['master']).size==(1280,720);assert (ROOT/r['blend']).is_file();assert r['robot']=='all_rounder';print(r['id'],r['bytes'],'PASS')
print(len(records),'mission cards verified')
