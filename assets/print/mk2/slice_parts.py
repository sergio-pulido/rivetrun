"""Slice MK-II STLs using installed Bambu Studio. Author: sergio.pulido@alodai.com."""
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
PROFILES=Path('/Applications/BambuStudio.app/Contents/Resources/profiles/BBL')
BINARY='/Applications/BambuStudio.app/Contents/MacOS/BambuStudio'
data=json.loads((OUT/'print-geometry.json').read_text())
index={}
for file in PROFILES.rglob('*.json'):
    profile=json.loads(file.read_text())
    if isinstance(profile,dict) and 'name' in profile:
        index[profile['name']]=profile

def flatten(name):
    profile=index[name]
    result=flatten(profile['inherits']) if profile.get('inherits') else {}
    result.update(profile)
    result.pop('inherits',None)
    return result

config=OUT/'slicer'
config.mkdir(exist_ok=True)
machine=flatten('Bambu Lab A1 mini 0.4 nozzle')
process=flatten('0.20mm Standard @BBL A1M')
process.update({'layer_height':'0.2','initial_layer_print_height':'0.2','sparse_infill_density':'15%','enable_support':'0','brim_type':'no_brim','curr_bed_type':'Textured PEI Plate'})
filament=flatten('Bambu PETG HF @BBL A1M')
filament['filament_density']=['1.28']
for name,profile in [('machine',machine),('process',process),('petg',filament)]:
    (config/(name+'.json')).write_text(json.dumps(profile,indent=2)+'\n')

selected=sys.argv[1:]
results=[]
for part in data['parts']:
    if selected and part['id'] not in selected:
        continue
    folder=config/part['id']
    folder.mkdir(exist_ok=True)
    command=[BINARY,'--load-settings',str(config/'machine.json')+';'+str(config/'process.json'),'--load-filaments',str(config/'petg.json'),'--orient','0','--arrange','1','--ensure-on-bed','--slice','0','--export-3mf',part['id']+'.3mf','--outputdir',str(folder),str(ROOT/part['stl'])]
    run=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,cwd=folder)
    (folder/'slice.log').write_text(run.stdout)
    if run.returncode:
        raise RuntimeError(f"Bambu Studio failed ({run.returncode}) for {part['id']}; see {folder/'slice.log'}")
    projects=list(folder.glob('*.3mf'))
    assert projects,f'No sliced project for {part["id"]}'
    gcode=''
    with zipfile.ZipFile(projects[0]) as archive:
        for name in archive.namelist():
            if name.endswith('.gcode'):
                gcode += archive.read(name).decode()
    assert gcode,'Sliced project contains no G-code'
    (folder/'statistics-gcode.txt').write_text('\n'.join(line for line in gcode.splitlines() if 'filament' in line.lower() or 'time' in line.lower())+'\n')
    weight=re.search(r';\s*total filament weight \[g\]\s*[:=]\s*([\d.]+)',gcode)
    if not weight:
        weight=re.search(r';\s*filament used \[g\]\s*=\s*([\d.]+)',gcode)
    time=re.search(r';\s*estimated printing time \(normal mode\)\s*=\s*([^\n]+)',gcode)
    if not time:
        time=re.search(r'total estimated time:\s*([^\n]+)',gcode)
    assert weight and time,'Missing slicer weight/time; do not guess'
    hours=0
    for value,unit in re.findall(r'(\d+(?:\.\d+)?)\s*([dhms])',time.group(1)):
        hours += float(value)*{'d':24,'h':1,'m':1/60,'s':1/3600}[unit]
    assert hours>0
    assert re.search(r'^; layer_height = 0\.2\s*$',gcode,re.M),'Wrong layer height'
    assert re.search(r'^; sparse_infill_density = 15%\s*$',gcode,re.M),'Wrong infill'
    assert re.search(r'^; enable_support = 0\s*$',gcode,re.M),'Unexpected supports'
    plate_data=json.loads((folder/'result.json').read_text())['sliced_plates']
    grams=sum(f['total_used_g'] for plate in plate_data for f in plate['filaments'])
    seconds=sum(plate['total_predication'] for plate in plate_data)
    result={key:part[key] for key in ['id','name','stl','qty','material','layerMm','infillPct','supports','notes']}
    result.update({'grams':round(grams,4),'hours':round(seconds/3600,6),'source':'slicer','author':'sergio.pulido@alodai.com'})
    results.append(result)
    print(json.dumps(result),flush=True)

report=OUT/'slicer-results.json'
if selected and report.exists():
    previous=json.loads(report.read_text())
    updated={p['id']:p for p in previous+results}
    results=list(updated.values())
report.write_text(json.dumps(results,indent=2)+'\n')
if len(results)==len(data['parts']):
    (ROOT/'docs/inputs/printed-parts.json').write_text(json.dumps(results,indent=2)+'\n')
