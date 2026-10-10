"""Binary-STL and slicer verification. Author: sergio.pulido@alodai.com."""
import json,struct
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
printed=json.loads((ROOT/'docs/inputs/printed-parts.json').read_text())
report={'author':'sergio.pulido@alodai.com','status':'prototype_requires_insert_calibration_and_fit_test','stls':{}}
for part in printed:
    path=ROOT/part['stl'];blob=path.read_bytes();n=struct.unpack_from('<I',blob,80)[0]
    assert len(blob)==84+n*50,path
    edges=Counter();points=[];vol=0
    for i in range(n):
        values=struct.unpack_from('<12fH',blob,84+i*50)
        a,b,c=[tuple(round(x,5) for x in values[j:j+3]) for j in (3,6,9)]
        points.extend((a,b,c))
        for u,v in ((a,b),(b,c),(c,a)):edges[tuple(sorted((u,v)))]+=1
        vol+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
    assert all(v==2 for v in edges.values()),(path,'nonmanifold triangle edges')
    dims=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
    assert max(dims)<=180 and abs(min(p[2] for p in points))<.001,(path,dims)
    assert vol>0 and part['source']=='slicer' and part['hours']>0
    assert part['layerMm']==.2 and part['infillPct']==15 and not part['supports']
    report['stls'][part['id']]={'triangles':n,'dimensionsMm':dims,'manifold':True,'volumeMm3':round(vol,3),'grams':part['grams'],'hours':part['hours']}
(HERE/'print-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
