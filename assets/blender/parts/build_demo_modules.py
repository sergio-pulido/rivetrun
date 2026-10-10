"""Screen-first MK-II module assembly. Author: sergio.pulido@alodai.com.
Uses component library geometry; does not alter print outputs or game code.
"""
import bpy,json,math,re,struct
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'apps/web/public/models/mk2'
LIB=json.loads((ROOT/'docs/inputs/component-models.json').read_text())
LIB={p['key']:p for p in LIB}
manifest=json.loads((OUT/'manifest.json').read_text())
AUTHOR='sergio.pulido@alodai.com'

def clear():
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.scene.unit_settings.scale_length=.001

def empty(name,parent=None,p=(0,0,0)):
    o=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(o);o.parent=parent;o.location=p;return o

def start(id):
    clear();r=empty('module_'+id);r.scale=(.01,)*3;r['author']=AUTHOR;return r

def append(key,parent,pos=(0,0,0),rot=None,omit_rubber=False):
    path=ROOT/LIB[key]['blend']
    with bpy.data.libraries.load(str(path),link=False) as (a,b):b.objects=list(a.objects)
    loaded=[o for o in b.objects if o]
    for o in loaded:bpy.context.scene.collection.objects.link(o)
    src=next(o for o in loaded if o.name.split('.')[0]=='part_'+key)
    bpy.context.view_layer.update()
    children=set(src.children_recursive)
    result=[]
    for o in loaded:
        if o not in children or o.type!='MESH':continue
        if omit_rubber and any(m and m.name.split('.')[0]=='rubber' for m in o.data.materials):continue
        data=o.data.copy();transform=src.matrix_world.inverted()@o.matrix_world
        for v in data.vertices:
            p=(transform@v.co)*1000
            v.co=(rot@p if rot else p)+Vector(pos)
        clone=bpy.data.objects.new('component_'+key+'_'+str(len(result)),data);bpy.context.scene.collection.objects.link(clone);clone.parent=parent
        if key=='offroad_tread_tpu':
            clone.name='print_offroad_tread_80__'+str(len(bpy.data.objects));clone['printedPartId']='offroad_tread_80'
        for index,slot in enumerate(data.materials):
            if slot:
                name=re.sub(r'\.\d+$','',slot.name)
                if name in ('black_polymer','rubber') or (parent.name=='module_controller' and name=='polymer'):name='rubber_and_chip'
                target=bpy.data.materials.get(name)
                if target is None:target=slot.copy();target.name=name
                data.materials[index]=target
        if data.materials:
            mat=data.materials[0];data.materials.clear();data.materials.append(mat)
            for poly in data.polygons:poly.material_index=0
        result.append(clone)
    for o in loaded:bpy.data.objects.remove(o,do_unlink=True)
    return result

def printcopy(id,parent,p,rotation=None,index=None):
    path=ROOT/'assets/print/mk2/mk2-print-source.blend'
    with bpy.data.libraries.load(str(path),link=False) as (a,b):b.objects=['print_'+id]
    o=b.objects[0];bpy.context.scene.collection.objects.link(o);bpy.context.view_layer.update()
    data=o.data.copy();matrix=o.matrix_world.copy()
    for v in data.vertices:
        q=matrix@v.co;v.co=(rotation@q if rotation else q)+Vector(p)
    bpy.data.objects.remove(o,do_unlink=True)
    n=bpy.data.objects.new('print_'+id+(('__'+str(index)) if index is not None else ''),data);bpy.context.scene.collection.objects.link(n);n.parent=parent;n['printedPartId']=id
    mat=bpy.data.materials.get('petg') or bpy.data.materials.new('petg');mat.diffuse_color=(.08,.13,.16,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.08,.13,.16,1)
    data.materials.clear();data.materials.append(mat);return n

def compact(root):
    groups={}
    for o in root.children_recursive:
        if o.type=='MESH' and not o.name.startswith('print_'):
            # Keep pivots intact; combine geometry only within each pivot.
            groups.setdefault((o.parent,o.data.materials[0].name.split('.')[0]),[]).append(o)
    for (parent,name),objs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0]
        if len(objs)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name='mesh_'+name+'_'+str(len(bpy.data.objects))
        o.data.materials[0].name=name

def tris(root):
    total=0
    for o in root.children_recursive:
        if o.type=='MESH':o.data.calc_loop_triangles();total+=len(o.data.loop_triangles)
    return total

def export(id,root,slot):
    compact(root);limit=3300 if slot=='locomotion' else 1800 if slot=='motor' else 2300
    for attempt in range(5):
        total=tris(root)
        if total<=limit:break
        for o in root.children_recursive:
            if o.type=='MESH':
                bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Demo visual LOD','DECIMATE');m.ratio=min(.85,(limit-100)/total);bpy.ops.object.modifier_apply(modifier=m.name)
    for o in [root,*root.children_recursive]:o.name=re.sub('[^a-z0-9_]','_',o.name.lower())
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root,*root.children_recursive]:o.hide_set(False);o.hide_render=False;o.select_set(True)
    bpy.context.view_layer.objects.active=root
    path=OUT/(id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_original_specular=False,export_draco_mesh_compression_enable=False)
    blob=path.read_bytes();size=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+size]);prims=[p for m in doc.get('meshes',[]) for p in m['primitives']]
    count=sum(doc['accessors'][p['indices']]['count']//3 for p in prims)
    assert count<=(8000 if slot=='locomotion' else 2500)
    assert slot=='locomotion' or len(prims)<=6,(id,len(prims))
    assert len(blob)<=400000
    ids=sorted({o.get('printedPartId') for o in root.children_recursive if o.get('printedPartId')})
    assert set(ids)<={p['id'] for p in json.loads((ROOT/'docs/inputs/printed-parts.json').read_text())}
    manifest['modules'][id]={'file':path.name,'slot':slot,'triangles':count,'meshes':len(prims),'bytes':len(blob),'printedParts':ids}
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/parts'/('module_'+id+'.blend')))
    print('EXPORTED',id,count,len(prims),len(blob),flush=True)

r=start('chassis')
printcopy('chassis_base',r,(0,0,27))
export('chassis',r,'fixed')

r=start('offroad_wheels')
for i,(x,sign) in enumerate([(65,-1),(65,1),(-65,-1),(-65,1)]):
    printcopy('motor_saddle',r,(x,sign*35,35),index=i+1)
    printcopy('motor_cap',r,(x,sign*35,50),index=i+1)
    pivot=empty('wheel_offroad_'+str(i),r,(x,sign*48.8,44))
    rot=Matrix.Rotation(sign*math.pi/2,3,'X')
    append('wheels_80x10',pivot,rot=rot,omit_rubber=True)
    append('offroad_tread_tpu',pivot,rot=rot)
export('offroad_wheels',r,'locomotion')

r=start('tracks')
# Two sourced 30T track trains; belt is static, pivots are reserved for sprockets.
for sign in (-1,1):
    append('tracks_pololu_30t',r,(42.5,sign*48,19.5),Matrix.Rotation(-sign*math.pi/2,3,'X'))
export('tracks',r,'locomotion')

r=start('controller')
printcopy('electronics_bridge',r,(0,0,72),Matrix.Rotation(math.pi,3,'X'))
printcopy('controller_carrier',r,(0,0,72))
append('raspberry_pi_5_4gb',r,(-12,0,91))
append('motor_driver_max14870_rpi',r,(-25.81,19,94.846))
append('pi_regulator_s13v30f5',r,(48,0,80))
export('controller',r,'fixed')
r=start('bumper')
append('bumper_romi_switch_kit',r,(58,0,31),Matrix.Rotation(-math.pi/2,3,'Z'))
export('bumper',r,'extra')
for module_id,key in [('motor_light','motor_50to1_hpcb_12v_ext'),('motor_torque','motor_298to1_hpcb_12v_ext')]:
    r=start(module_id)
    for x,sign in [(65,-1),(65,1),(-65,-1),(-65,1)]:
        rot=Matrix(((0,sign,0),(0,0,sign),(1,0,0)))
        append(key,r,(x,sign*47.8,40),rot)
    export(module_id,r,'motor')
for module_id,key in [('battery_small','battery_4s_small'),('battery_large','battery_4s_large')]:
    r=start(module_id)
    printcopy('battery_tray',r,(0,0,31))
    append(key,r,(0,0,33.5))
    export(module_id,r,'battery')
manifest['deferred']=[id for id in manifest['deferred'] if id not in manifest['modules']]
manifest['status']='partial_demo_visual_assets'
manifest['deckOffsetY']={'wheels':0,'offroad_wheels':.04,'tracks':-.205}
manifest['manufacturingStatus']='Screen-first demo assembly. Print and physical fit work paused by human. No manufacture certification; track adaptation and controller retention require later fit validation.'
manifest.pop('pathOverride',None)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
