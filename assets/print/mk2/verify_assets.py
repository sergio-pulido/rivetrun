"""Verify authored MK-II v2 outputs without certifying missing build interfaces.
Author: sergio.pulido@alodai.com.
"""
import json,struct,re
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
OUT=ROOT/'apps/web/public/models/mk2'
manifest=json.loads((OUT/'manifest.json').read_text())
printed=json.loads((ROOT/'docs/inputs/printed-parts.json').read_text())
print_ids={p['id'] for p in printed}
report={'author':'sergio.pulido@alodai.com','status':'partial_not_release_ready','stls':{},'modules':{},'missingModules':manifest['deferred'],'limitations':['No physical test print or assembly fit check.','Full contract coverage and phone FPS gate are pending.','Sensor GLBs are component envelopes awaiting printed mounting parts.','Motor bodies use the earlier real-parts reference; selected voltage variants need dimensional confirmation.']}
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
materials=set()
for id,entry in manifest['modules'].items():
    blob=(OUT/entry['file']).read_bytes()
    magic,version,size=struct.unpack_from('<4sII',blob)
    assert magic==b'glTF' and version==2 and size==len(blob)
    length,kind=struct.unpack_from('<I4s',blob,12);assert kind==b'JSON'
    doc=json.loads(blob[20:20+length])
    names=[node.get('name','') for node in doc['nodes']]
    assert all(re.fullmatch('[a-z0-9_]+',n) for n in names),(id,names)
    assert names.count('module_'+id)==1
    roots=doc['scenes'][doc.get('scene',0)]['nodes']
    assert len(roots)==1 and doc['nodes'][roots[0]]['name']=='module_'+id
    ids={re.sub(r'__\d+$','',n[6:]) for n in names if n.startswith('print_')}
    assert ids<=print_ids and ids==set(entry['printedParts'])
    assert not any(k in doc for k in ('cameras','animations','extensionsRequired'))
    assert not doc.get('extensionsUsed'),(id,doc.get('extensionsUsed'))
    assert not any('uri' in x for k in ('buffers','images') for x in doc.get(k,[]))
    primitives=[p for m in doc.get('meshes',[]) for p in m['primitives']]
    triangles=sum(doc['accessors'][p['indices']]['count']//3 for p in primitives)
    assert triangles==entry['triangles'] and len(primitives)==entry['meshes']
    assert triangles<=(8000 if entry['slot']=='locomotion' else 2500)
    assert entry['slot']=='locomotion' or len(primitives)<=6
    assert len(blob)<=400000
    materials.update(m['name'] for m in doc.get('materials',[]))
    if id=='wheels':
        pivots=[n for n in doc['nodes'] if n['name'].startswith('wheel_')]
        assert len(pivots)==4 and all('mesh' not in n and n.get('children') for n in pivots)
    report['modules'][id]={'triangles':triangles,'primitives':len(primitives),'bytes':len(blob),'printedParts':sorted(ids)}
assert len(materials)<=8
report['materials']=sorted(materials)
report['totalGlbBytes']=sum(p['bytes'] for p in report['modules'].values())
assert report['totalGlbBytes']<=3000000
# Only available modules: this is not a full preset/phone validation.
default=['chassis','wheels','motor_torque','battery_large','camera','ultrasonic']
report['availableAssembly']={k:sum(report['modules'][id][k] for id in default) for k in ('triangles','primitives','bytes')}
assert report['availableAssembly']['triangles']<=18000 and report['availableAssembly']['primitives']<=36 and report['availableAssembly']['bytes']<=900000
(HERE/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
