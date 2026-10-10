"""Component library sourced from the MK-II BOM and official drawings.
Author: sergio.pulido@alodai.com. No logos or text geometry.
"""
import bpy,json,math,re,sys,shutil
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=ROOT/'apps/web/public/models/parts';OUT.mkdir(parents=True,exist_ok=True)
RENDERS=ROOT/'apps/web/public/renders/parts';RENDERS.mkdir(parents=True,exist_ok=True)
AUTHOR='sergio.pulido@alodai.com'
BOM=json.loads((ROOT/'docs/inputs/bom-mk2.json').read_text())
ITEMS={p['key']:p for p in BOM['items']}
MANIFEST=ROOT/'docs/inputs/component-models.json'
entries={p['key']:p for p in json.loads(MANIFEST.read_text())} if MANIFEST.exists() else {}
records={};root=None;approximations=[];source=None;envelope=None

def clear():
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    for m in list(bpy.data.materials):bpy.data.materials.remove(m)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1

def material(name,color,metal=0,rough=.5):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def begin(key,dim,src=None,approx=None):
    global root,approximations,source,envelope,pcb,black,steel,brass,white,rubber
    assert key in ITEMS,key
    clear();pcb=material('pcb',(.012,.20,.055),rough=.48);black=material('black_polymer',(.012,.014,.017),rough=.6);steel=material('steel',(.48,.54,.60),.85,.29);brass=material('brass',(.56,.36,.095),.8,.3);white=material('polymer',(.65,.69,.70));rubber=material('rubber',(.018,.02,.022),rough=.83)
    root=bpy.data.objects.new('part_'+key,None);bpy.context.collection.objects.link(root)
    root['key']=key;root['author']=AUTHOR
    approximations=approx or [];source=src or 'docs/inputs/bom-mk2.json: '+key;envelope=dim

def mesh(o,name,mat):
    o.name=name;o.parent=root;o.data.materials.append(mat)
    return o

def block(name,p,size,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=tuple(x*.001 for x in p));o=bpy.context.object;o.scale=tuple(x*.001 for x in size)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=o.modifiers.new('Functional edge radius','BEVEL');m.width=bevel*.001;m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
    return mesh(o,name,mat)

def cylinder(name,p,r,h,mat,axis='Z',n=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r*.001,depth=h*.001,location=tuple(x*.001 for x in p));o=bpy.context.object
    if axis=='X':o.rotation_euler.y=math.pi/2
    if axis=='Y':o.rotation_euler.x=math.pi/2
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    return mesh(o,name,mat)

def cut(obj,cutter):
    bpy.context.view_layer.objects.active=obj;m=obj.modifiers.new('Manufacturing aperture','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=cutter;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(cutter,do_unlink=True)

def board(w,d,holes=(),z=0,thickness=1.6):
    b=block('pcb',(0,0,z+thickness/2),(w,d,thickness),pcb,.35)
    for x,y,dia in holes:cut(b,cylinder('hole',(x,y,z+.8),dia/2,4,black,n=16))
    return b

def pins(count,p,pitch=2.54,rows=1,height=6):
    for row in range(rows):
        for i in range(count):cylinder('pin_'+str(row)+'_'+str(i),(p[0]+(i-(count-1)/2)*pitch,p[1]+row*pitch,p[2]+height/2),.32,height,brass,n=4)

def components(points,z=1.6):
    for i,(x,y,w,d,h) in enumerate(points):
        block('ic_'+str(i),(x,y,z+h/2),(w,d,h),black,.08)
        for sign in (-1,1):block('solder_'+str(i)+'_'+str(sign),(x+sign*(w/2+.25),y,z+.12),(.5,d*.8,.24),steel)

def consolidate():
    # Materials and geometry are shared by category, retaining component identity.
    groups={}
    for o in list(root.children_recursive):
        if o.type=='MESH':groups.setdefault(o.data.materials[0],[]).append(o)
    for mat,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        bpy.context.object.name=root.name+'__'+mat.name

def count():
    total=0
    for o in root.children_recursive:
        if o.type=='MESH':o.data.calc_loop_triangles();total+=len(o.data.loop_triangles)
    return total

def render(key):
    scene=bpy.context.scene;bpy.context.view_layer.update()
    objects=[o for o in root.children_recursive if o.type=='MESH']
    points=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box]
    centre=Vector(tuple((min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)))
    # One physical framing scale (220 mm) and 3/4 direction across the library.
    cd=bpy.data.cameras.new('Library camera');cam=bpy.data.objects.new('Library camera',cd);scene.collection.objects.link(cam);cam.location=centre+Vector((.32,-.44,.30));cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=.22;scene.camera=cam
    world=bpy.data.worlds.new('Library neutral studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[1].default_value=.1;scene.world=world
    for name,p,power,color in [('Key',(.3,-.3,.5),2.2,(1,.9,.8)),('Rim',(-.3,.3,.35),2.6,(.65,.8,1)),('Fill',(.3,.3,.2),1.0,(1,1,1))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=.35;data.color=color;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=centre+Vector(p);obj.rotation_euler=(centre-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(RENDERS/(key+'.png'));scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True)

def finish(key,group=None,heavy=False):
    consolidate();limit=10000 if heavy else 5000
    tris=count()
    if key=='raspberry_pi_5_4gb':
        print('Pi per-material budgets',[(o.name,len(o.data.polygons)) for o in root.children_recursive if o.type=='MESH'],flush=True)
        if tris>limit:
            metal=next(o for o in root.children_recursive if o.type=='MESH' and o.data.materials[0].name=='steel')
            bpy.context.view_layer.objects.active=metal
            modifier=metal.modifiers.new('Connector detail LOD only','DECIMATE');modifier.ratio=.43;bpy.ops.object.modifier_apply(modifier=modifier.name)
            tris=count()
        assert tris<=limit,('Pi exact PCB and packages',tris)
    if tris>limit:
        for o in root.children_recursive:
            if o.type=='MESH':
                bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Browser tessellation budget','DECIMATE');m.ratio=(limit-200)/tris;bpy.ops.object.modifier_apply(modifier=m.name)
        approximations.append('CAD/render tessellation simplified for browser budget; source dimensions retained as references.')
    tris=count()
    for attempt in range(3):
        if tris<=limit:break
        for o in root.children_recursive:
            if o.type=='MESH':
                bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Browser detail refinement','DECIMATE');m.ratio=min(.8,(limit-250)/tris);bpy.ops.object.modifier_apply(modifier=m.name)
        tris=count()
    assert tris<=limit,(key,tris)
    root['approximations']=json.dumps(approximations);root['dimsSource']=source
    path=OUT/(key+'.glb');bpy.ops.object.select_all(action='DESELECT')
    for o in [root,*root.children_recursive]:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_original_specular=False)
    assert path.stat().st_size<=(250000 if heavy else 150000),(key,path.stat().st_size)
    blend=HERE/((group or key)+'.blend')
    # Variant groups retain collections from the prior file by appending the
    # previous variant's collection before saving the shared source.
    collection=bpy.data.collections.new(key);bpy.context.scene.collection.children.link(collection)
    for o in [root,*root.children_recursive]:
        for c in list(o.users_collection):c.objects.unlink(o)
        collection.objects.link(o)
    if group and blend.exists():
        previous=HERE/(group+'_variants_previous.blend')
        shutil.copy2(blend,previous)
        with bpy.data.libraries.load(str(previous),link=False) as (src,dst):dst.collections=[c for c in src.collections if c!=key]
        previous.unlink()
        for c in dst.collections:
            if c:
                bpy.context.scene.collection.children.link(c)
                for o in c.all_objects:o.hide_render=True;o.hide_set(True)
    bpy.context.scene['author']=AUTHOR;bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    entries[key]={'key':key,'blend':str(blend.relative_to(ROOT)),'glb':str(path.relative_to(ROOT)),'render':str((RENDERS/(key+'.png')).relative_to(ROOT)),'envelopeMm':envelope,'dimsSource':source,'approximations':approximations,'tris':tris,'glbKb':round(path.stat().st_size/1000,3),'author':AUTHOR,'units':'metres','upAxis':'+Y','origin':'mounting-face centre','renderFrameMm':220,'compression':'Draco'}
    MANIFEST.write_text(json.dumps(list(entries.values()),indent=2)+'\n');render(key)
    print('LIBRARY READY '+key,flush=True)

# Geometry generation is dispatched only for sourced items; unsupported entries
# stay absent rather than receiving fabricated dimensional placeholders.
def generate(key):
    spec=ITEMS[key]['specs']
    if key=='raspberry_pi_5_4gb':
        data=json.loads((HERE/'sources/pi5-mesh.json').read_text())
        main=max(data,key=lambda s:(s['bounds'][1][0]-s['bounds'][0][0])*(s['bounds'][1][1]-s['bounds'][0][1]))
        centre=[(a+b)/2 for a,b in zip(*main['bounds'])];centre[2]=main['bounds'][0][2]
        begin(key,[88.5,57.2,18.976],'Official Pi 5 STEP without graphics + visually confirmed mechanical drawing',["Material colours approximated; minor sub-8mm passives and thin solder/pads omitted; black IC/connector packages simplified to their exact CAD bounding boxes; no silkscreen, logos or wordmarks."])
        root['license']=(HERE/'sources/pi5-step/LICENSE.txt').read_text()
        for i,s in enumerate(data):
            dimensions=[b-a for a,b in zip(*s['bounds'])]
            is_pin=max(dimensions[:2])<1.2 and dimensions[2]>=4
            if s is not main and (max(dimensions)<8.0 and not is_pin or dimensions[2]<.25):continue
            verts=[tuple((v[j]-centre[j])*.001 for j in range(3)) for v in s['vertices']]
            meshdata=bpy.data.meshes.new('cad_'+str(i));meshdata.from_pydata(verts,[],s['faces']);meshdata.update();o=bpy.data.objects.new('cad_'+str(i),meshdata);bpy.context.collection.objects.link(o)
            dims=[b-a for a,b in zip(*s['bounds'])]
            mat=pcb if s is main else brass if max(dims[:2])<1.2 else steel if dims[2]>4 and max(dims[:2])>6 else black
            if mat==black:
                bpy.data.objects.remove(o,do_unlink=True)
                position=[(a+b)/2-centre[j] for j,(a,b) in enumerate(zip(*s['bounds']))]
                block('cad_package_'+str(i),position,dims,black)
                continue
            mesh(o,'cad_'+str(i),mat)
            import bmesh
            bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-8);bm.to_mesh(o.data);bm.free()
            if mat==steel and len(o.data.polygons)>180:
                bpy.context.view_layer.objects.active=o
                modifier=o.modifiers.new('Small connector CAD detail','DECIMATE');modifier.ratio=180/len(o.data.polygons);bpy.ops.object.modifier_apply(modifier=modifier.name)
        finish(key)
    elif key=='pi_regulator_s13v30f5':
        begin(key,[22.9,22.9,9.57],'Official 0J1807 drawing: outline 22.9x22.9; hole spacing 18.5; hole y=2.2 from edge; PCB 1.57 + tallest 8.0 mm',['Small IC packages, capacitor diameters and solder details approximated within the documented envelope.'])
        board(22.9,22.9,[(-9.25,-9.25,2.18),(9.25,-9.25,2.18)],thickness=1.57)
        for x in (-7,7):cylinder('capacitor',(x,6,5.57),3.2,8,steel)
        block('inductor',(0,5,3.5),(5.5,6,3.86),black,.25);components([(-6,0,2.2,3,1.2),(0,-1,4,4,1.0),(6,0,2.2,3,1.2)],1.57)
        finish(key)
    elif key=='motor_driver_max14870_rpi':
        begin(key,[43.2,16.5,None],'BOM mechanical + official product specs 1.7x0.65 inches; photo 0J8599 conflicts (0.8 inch); no unsupported mounting holes used',['PCB thickness 1.6 mm and connector heights approximated as small details.','No chassis mount: female 2x17 connector engages Pi GPIO.'])
        board(43.2,16.5,z=8);block('female_gpio',(0,5.5,4),(43,5.1,8),black)
        for x in (-12,12):block('max14870',(x,0,10.2),(4,4,1.2),black,.1)
        block('six_terminal_block',(0,-4,14),(30,7,9),pcb,.4)
        for x in (-12.5,-7.5,-2.5,2.5,7.5,12.5):cylinder('terminal_screw',(x,-4,18.4),1.2,.4,steel,n=16)
        finish(key)
    elif key.startswith('wheels_'):
        d=spec['diameterMm'];w=spec['widthMm'];bare={60:56,80:76.5,90:86.5}[d];collar=11 if d==60 else 11.8
        begin(key,[d,d,collar],'Official Pololu 0J1708 drawing, wheel '+str(d)+' mm page: bare diameter, width, collar and shaft',["Spoke edge radii, slots, tyre grooves and central-web outline are minor visual approximations; documented mounting dimensions are retained."])
        tyre=cylinder('silicone_tyre',(0,0,w/2-collar-(w-6.5)/2),d/2,w,rubber,n=64);cut(tyre,cylinder('tyre_inner',(0,0,-collar+3.25),bare/2,w+4,black,n=64))
        rim=cylinder('rim',(0,0,3.25-collar),bare/2,6.5,black,n=64);cut(rim,cylinder('rim_inner',(0,0,3.25-collar),bare/2-2,10,black,n=64))
        disk=cylinder('hub_web',(0,0,3.25-collar),12,6.5,black)
        hub=cylinder('shaft_collar',(0,0,-collar/2),3.3,collar,black)
        for o in (disk,hub):
            cutter=cylinder('D_shaft',(0,0,-collar/2),1.55,collar+2,black,n=24)
            cut(cutter,block('D_flat',(0,5.85,-collar/2),(10,10,collar+4),black))
            cut(o,cutter)
        spoke_count=5 if d==60 else 6
        for i in range(spoke_count):
            a=i*math.tau/spoke_count
            o=block('spoke_'+str(i),((bare/4+5)*math.cos(a),(bare/4+5)*math.sin(a),3.25-collar),(bare/2-8,5,6.5),black,.4);o.rotation_euler.z=a
        for x,y in [(-6.35,0),(6.35,0)]+([] if d==60 else [(sign*4.775,other*8.2705) for sign in (-1,1) for other in (-1,1)]):cut(disk,cylinder('mounting_hole',(x,y,3.25-collar),1.55,12,black,n=20))
        finish(key,'wheels',True)
    elif key in ('battery_4s_small','battery_4s_large'):
        dims=[float(v) for v in spec['dimsMm'].split('×')];begin(key,dims,None,['Shrink-wrap corner radius and seam approximate small details. Leads/connectors omitted because their envelope is not supplied.'])
        l,w,h=dims;block('lipo_pack',(0,0,h/2),dims,black,.8);block('end_seal',(0,0,h-.2),(l-1,w-1,.4),rubber,.2);finish(key,'lipo')
    elif key=='ultrasonic_hc_sr04':
        begin(key,[45.5,20,15.5],None,['PCB thickness, transducer radii and header heights approximate small details within the supplied envelope.'])
        board(45.5,20);components([(0,3,6,3,1.0)])
        for x in (-12.5,12.5):
            o=cylinder('transducer',(x,0,8.55),8,13.9,steel);cut(o,cylinder('acoustic_aperture',(x,0,14.75),6.5,2,black));cylinder('acoustic_mesh',(x,0,14.0),6.4,.2,black)
        pins(4,(0,-8,1.6),height=4);finish(key)
    elif key=='imu_mpu6050':
        begin(key,[26,17.8,4.6],None,['PCB thickness and small connector/package placements approximate; no unsourced mounting hole pattern modelled.'])
        board(26,17.8);components([(0,0,4,4,1.0),(-5,0,2,3,.6),(5,0,2,3,.6)]);block('stemma_socket',(0,7,3.1),(6,3.5,3),white,.15);finish(key)
    elif key=='camera_module_3':
        begin(key,[25,24,11.5],None,['Lens barrel diameter and minor connector detail approximated; overall envelope follows BOM; no invented mounting hole pattern.'])
        board(25,24);cylinder('lens_barrel',(0,0,6.3),5.7,9.9,black);cylinder('lens_rim',(0,0,11.15),5.65,.5,steel);cylinder('lens_glass',(0,0,11.4),4.8,.2,black);block('csi_socket',(0,9,2.1),(16,4,1),white,.1);finish(key,'camera_module_3_variants')
    elif key=='waterproof_case_hammond_1554j2gy':
        begin(key,[160,89,61],None,['Wall thickness, lid seam and corner radii are small visual approximations, not a new seal or machining specification.'])
        body=block('enclosure',(0,0,27),(160,89,54),white,3);cut(body,block('enclosure_cavity',(0,0,30),(154,83,54),black,2));block('lid',(0,0,57.5),(160,89,7),white,3)
        finish(key,heavy=True)
    else:raise ValueError('No dimensionally sourced generator for '+key)

keys=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for key in keys:generate(key)
