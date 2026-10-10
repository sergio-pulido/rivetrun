"""Compress only M9 props and populate the environment manifest. Author: sergio.pulido@alodai.com."""
import json,struct,subprocess,tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3];OUT=ROOT/'apps/web/public/env/m9'
CLI='/tmp/rivetrun-meshopt-runtime/node_modules/.bin/gltf-transform'
records=json.loads((HERE/'prop_records.json').read_text())
with tempfile.TemporaryDirectory(prefix='m9-props-') as temporary:
 for record in records:
  path=OUT/record['file'];target=Path(temporary)/path.name
  subprocess.run([CLI,'meshopt',str(path),str(target),'--level','high'],check=True,capture_output=True,text=True);target.replace(path)
  data=path.read_bytes();doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
  assert 'EXT_meshopt_compression' in doc.get('extensionsUsed',[]) and 'KHR_draco_mesh_compression' not in doc.get('extensionsUsed',[])
  record['sizeBytes']=len(data);record['triangles']=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']);record['compression']='meshopt'
triangles=sum(p['triangles'] for p in records);size=sum(p['sizeBytes'] for p in records)
assert triangles<=30000 and size<=2000000,(triangles,size)
manifest_path=ROOT/'docs/inputs/m9-env.json';manifest=json.loads(manifest_path.read_text());manifest['props']=records
manifest['propTotals']={'files':len(records),'triangles':triangles,'sizeBytes':size,'triangleBudget':30000,'byteBudget':2000000}
manifest['placementNotes']='Scenery only. Keep the driving lanes, ramps, ice obstacle geometry and scan-zone span clear. The tall antenna belong behind the far lane; only low snowdrifts belong near the foreground. Native size is in metres; suggestedScale=1.'
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
print('M9 prop kit:',len(records),'files;',triangles,'triangles;',size,'bytes')
