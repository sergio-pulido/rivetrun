"""MK-II v2 structural parts, authored by sergio.pulido@alodai.com.

Millimetre geometry. Purchased component envelopes are read from the BOM when
available; otherwise the supplied real-parts reference is used. Assembly fit is
not certified until the final BOM and hardware interface dimensions are known.
"""
import bpy
import bmesh
import json
from pathlib import Path
from mathutils import Vector

AUTHOR = 'sergio.pulido@alodai.com'
ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)
REFERENCE = ROOT/'docs/inputs/real-parts.json'
parts = {p['id']:p for p in json.loads(REFERENCE.read_text())}
motor = parts['motor_torque']['specs']['bodyDimensionsMm']
BOM = ROOT/'docs/inputs/bom-mk2.json'
bom = json.loads(BOM.read_text())
bom_items = {p['key']:p for p in bom['items']}
battery_dims = [float(v) for v in bom_items['battery_4s_large']['specs']['dimsMm'].split('×')]
battery = dict(zip(('lengthMm','widthMm','thicknessMm'),battery_dims))
REFERENCE = BOM
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=.001
items=[]

def block(name, size, position, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj=bpy.context.object
    obj.name=name
    obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Printable corner radius','BEVEL')
        mod.width=bevel
        mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def boolean(obj,tool,operation='DIFFERENCE'):
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Machined functional feature','BOOLEAN')
    mod.operation=operation
    mod.solver='EXACT'
    mod.object=tool
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool,do_unlink=True)

def hole(obj,xy,diameter,depth=60,z=10):
    # 16 facets: maximum radial deviation for an M3 clearance hole is 0.033 mm.
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=diameter/2,depth=depth,location=(*xy,z))
    boolean(obj,bpy.context.object)

def slot(obj,xy,size):
    boolean(obj,block('slot cutter',(*size,60),(*xy,10),min(size)/2-.02))

def validate(obj):
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),obj.name+' is not manifold'
    volume=bm.calc_volume(signed=False)
    assert volume>0,obj.name+' has zero volume'
    bm.to_mesh(obj.data)
    bm.free()
    points=[obj.matrix_world@Vector(c) for c in obj.bound_box]
    lower=[min(p[i] for p in points) for i in range(3)]
    upper=[max(p[i] for p in points) for i in range(3)]
    dimensions=[upper[i]-lower[i] for i in range(3)]
    assert all(d<=180 for d in dimensions),dimensions
    assert abs(lower[2])<.001,lower
    return volume,dimensions

def save(obj,id,name,qty,notes):
    obj.name='print_'+id
    obj['author']=AUTHOR
    obj['printId']=id
    obj['material']='PETG'
    obj['function']=notes
    volume,dimensions=validate(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.wm.stl_export(filepath=str(OUT/(id+'.stl')),export_selected_objects=True,global_scale=1,apply_modifiers=True,use_scene_unit=False,ascii_format=False)
    stl=OUT/(id+'.stl')
    blob=stl.read_bytes()
    stl.write_bytes(('MK-II v2 | '+id+' | '+AUTHOR).encode()[:80].ljust(80,b' ')+blob[80:])
    items.append({'id':id,'name':name,'stl':'assets/print/mk2/'+id+'.stl','qty':qty,'material':'PETG','grams':None,'hours':None,'layerMm':.2,'infillPct':15,'supports':False,'source':'pending_slicer','volumeMm3':round(volume,3),'dimensionsMm':[round(d,3) for d in dimensions],'notes':notes,'author':AUTHOR})
    # Each STL is at the origin on its flat, support-free print face.
    obj.hide_set(True)
    obj.hide_render=True
    return obj

# FIRST OUTPUT: insert calibration coupon. Left-to-right hole sizes are in
# mechanical-parameters.json, no unverified install diameter is certified.
coupon=block('insert coupon',(56,18,8),(0,0,4),.6)
for x,d in zip((-18,-6,6,18),parameters['couponHoleMm'] if 'parameters' in globals() else json.loads((OUT/'mechanical-parameters.json').read_text())['couponHoleMm']):
    hole(coupon,(x,0),d,5.9,8-5.9/2)
save(coupon,'insert_test_coupon','M3 heat-set insert calibration coupon',1,'Left-to-right: 3.8, 4.0, 4.2, 4.4 mm blind holes; measured STEP outer diameter 4.6 mm. Calibrate insertHoleMm before making insert bosses.')

# FIRST OUTPUT: flat 160 x 100 mm chassis, four N20 stations, adjustable
# battery/electronics grid, protected edge cable passages and no cosmetic plates.
base=block('chassis',(160,100,4),(0,0,2),1.0)
for x in (-65,65):
    for y in (-36,36):
        for dx in (-10,10):
            hole(base,(x+dx,y),3.4)
for x in (-60,-40,-20,0,20,40,60):
    for y in (-24,0,24):
        hole(base,(x,y),3.4)
for x in (-29,29):
    for y in (-34,34):
        slot(base,(x,y),(18,3.4))
for x in (-65,65):
    for y in (-20,20):
        slot(base,(x,y),(3.4,16))
for x in (-10,10):
    for y in (-38,38):
        slot(base,(x,y),(9,3.4))
save(base,'chassis_base','PETG chassis base',1,'160x100x4 mm. M3 clearance grid 20x24 mm; four N20 mount stations x +/-65, y +/-36. Printed flat. Hardware fit awaits final BOM; do not heat-set inserts into clearance holes.')

# N20 split clamp. Body envelope is 10x12x25 mm in the supplied reference.
# M3 cap insert sockets deliberately remain a separately parameterized feature.
clearance=.3
width,height,length=map(float,motor)
parameters=json.loads((OUT/'mechanical-parameters.json').read_text())
insert_pilot=parameters['insertHoleMm']
insert_depth=5.7
saddle=block('motor saddle',(30,length+2,15),(0,0,7.5),.6)
boolean(saddle,block('motor cavity',(width+2*clearance,length+10,30),(0,0,3+15)))
for x in (-10,10):
    hole(saddle,(x,0),3.4)
    for y in (-9,9):
        hole(saddle,(x,y),insert_pilot,insert_depth+.02,15-insert_depth/2)
save(saddle,'motor_saddle','N20 motor saddle',4,'10x12x25 mm N20 envelope +0.3 mm clearance per side. Cap sockets are hole size: calibrate; insertHoleMm from mechanical-parameters.json, 5.7 mm depth; must match the chosen M3 insert datasheet before printing this part. Two base M3 through holes.')
cap=block('motor cap',(30,length+2,3),(0,0,1.5),.5)
for x in (-10,10):
    for y in (-9,9):
        hole(cap,(x,y),3.4)
save(cap,'motor_cap','N20 clamp cap',4,'Flat cap for motor_saddle. Four M3 clearance holes. The cap acts on the saddle walls; final clamp height must be confirmed against the selected motor, not tightened onto a loose motor.')

# Retaining tray: no floating battery. Flat floor, open top and integral
# strap slots. The reference pack is 50 x 60 x 7.3 mm.
lx=float(battery['lengthMm'])+2
ly=float(battery['widthMm'])+2
tray=block('battery tray',(lx+4,ly+4,8),(0,0,4),.6)
boolean(tray,block('battery cavity',(lx,ly,15),(0,0,10)))
for x in (-40,40):
    hole(tray,(x,0),3.4)
for x in (-28,28):
    slot(tray,(x,0),(3,19))
save(tray,'battery_tray','LiPo retaining tray',1,'Fits the BOM largest 4S large 107x35x27 mm battery with 1 mm lateral clearance. Two 3x19 mm strap passages. Floor mounting matches chassis grid. Strap model awaits the BOM.')

bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=3.5,depth=16,location=(0,0,8))
standoff=bpy.context.object
hole(standoff,(0,0),3.4)
save(standoff,'board_standoff','M3 board standoff',4,'16 mm stand-off, 7 mm outer diameter, 3.4 mm through hole. No assumed controller hole pattern; final board fixture awaits the BOM.')

clip=block('routing clip',(18,10,8),(0,0,4),.5)
boolean(clip,block('open cable channel',(5,14,12),(0,0,9)))
hole(clip,(-6,0),3.4)
save(clip,'cable_clip','Open cable routing clip',4,'Open 5 mm routing channel with one M3 screw; structural cable restraint, not decorative wiring. Print flat without supports.')

(OUT/'print-geometry.json').write_text(json.dumps({'author':AUTHOR,'status':'provisional_fit_test_required','reference':str(REFERENCE.relative_to(ROOT)),'parts':items},indent=2)+'\n')
scene['author']=AUTHOR
scene['status']='Provisional mechanical interfaces pending installation dimensions and physical fit test. Battery dimensions from bom-mk2.json; motor envelope from real-parts.json.'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mk2-print-source.blend'))
print('PRINT GEOMETRY READY: '+json.dumps([{'id':p['id'],'dimensionsMm':p['dimensionsMm']} for p in items]))
