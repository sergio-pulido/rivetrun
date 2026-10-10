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
        if o.type=='MESH' and not o.name.startswith(('print_','propeller_')):groups.setdefault(o.data.materials[0],[]).append(o)
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
    cd=bpy.data.cameras.new('Library camera');cam=bpy.data.objects.new('Library camera',cd);scene.collection.objects.link(cam);cam.location=centre+Vector((.32,-.44,.30));cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';bpy.context.view_layer.update();view=cam.matrix_world.inverted();projected=[view@p for p in points];cd.ortho_scale=max(max(p[i] for p in projected)-min(p[i] for p in projected) for i in (0,1))/.75;scene.camera=cam
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
def encoder_at(z,reverse=False):
    # A representative single encoder from the two-encoder purchased kit.
    direction=-1 if reverse else 1
    b=block('encoder_pcb',(0,0,z+direction*.8),(10.6,11.6,1.6),pcb)
    cut(b,cylinder('shaft_clearance',(0,0,z+direction*.8),.7,3,black,n=16))
    for x in (-3,3):block('hall_sensor',(x,0,z+direction*2),(2,2,.8),black)
    disc=cylinder('magnetic_disc',(0,0,z+direction*3.1),7.65/2,1,black)
    cut(disc,cylinder('disc_shaft',(0,0,z+direction*3.1),.5,2,steel,n=16))

def gearmotor(key):
    long=key=='winch_pololu_1000to1';length=12.5 if long else 9;body=29.1 if long else 25.6
    begin(key,[12,11.6 if not long else 10,body+(9 if long else 13.5)],'Official Pololu 0J949 drawing page 3 (HPCB), page 4 (1000:1 HP), plus 3081 specs 10.6x11.6 PCB and 7.65mm magnetic disc',['Gear tooth/spacer details and encoder PCB thickness (1.6 mm), clearance aperture and Hall-package contours approximate minor details.','Encoder disc thickness 1 mm and PCB-to-disc spacing 1 mm are minor visual/assembly approximations.'])
    can_length=15 if long else 15.4
    cap_length=1.6 if long else 1.2
    can=cylinder('motor_can',(0,0,-length-can_length/2),6,can_length,steel)
    cut(can,block('can_flat',(0,10,-length-7.7),(20,10,20),black));cut(can,block('can_flat',(0,-10,-length-7.7),(20,10,20),black))
    block('brush_endcap',(0,0,-body+cap_length/2),(12,10,cap_length),black,.4)
    for z in (-.35,-length/2,-length+.35):block('gearbox_plate',(0,0,z),(12,10,.7),brass,.3)
    for x,y in ((-3,-2),(3,2)):
        cylinder('gearbox_pin',(x,y,-length/2),.65,length,steel,n=16)
        for z in (-2,-length+2):cylinder('gear_stage',(x,y,z),2.2,1.4,black,n=20)
    shaft=cylinder('D_output_shaft',(0,0,4.5),1.5,9,steel)
    cut(shaft,block('shaft_flat',(0,6,4.5),(10,10,12),black))
    if not long:
        cylinder('rear_encoder_shaft',(0,0,-body-2.25),.5,4.5,steel,n=16)
        assert 'encoder_kit_magnetic_12cpr' in ITEMS
        encoder_at(-body,True);root['fittedItemKeys']='encoder_kit_magnetic_12cpr'
    if long:
        bpy.ops.wm.stl_import(filepath=str(ROOT/'assets/print/mk2/winch_spool.stl'),global_scale=.001)
        spool=bpy.context.object;spool.location.z=.001;mesh(spool,'print_winch_spool',black)
        approximations.append('Empty printed spool is a design, not a purchased rope; radial insert pilot requires coupon calibration.')
    finish(key,'motor_50to1_hpcb_12v_ext')

def generate(key):
    spec=ITEMS[key]['specs']
    if key in ('motor_50to1_hpcb_12v_ext','motor_298to1_hpcb_12v_ext','winch_pololu_1000to1'):
        gearmotor(key)
    elif key=='encoder_kit_magnetic_12cpr':
        begin(key,[10.6,11.6,None],'Pololu 3081 specs: 10.6x11.6 PCB; official 3081 page linked magnetic disc OD7.65, ID1.0 mm',['PCB/disc thicknesses, Hall package contours and assembly gap approximated as minor details. One fitted encoder shown; purchased kit contains two.'])
        encoder_at(0);finish(key)
    elif key=='raspberry_pi_5_4gb':
        data=json.loads((HERE/'sources/pi5-mesh.json').read_text())
        main=max(data,key=lambda s:(s['bounds'][1][0]-s['bounds'][0][0])*(s['bounds'][1][1]-s['bounds'][0][1]))
        centre=[(a+b)/2 for a,b in zip(*main['bounds'])];centre[2]=main['bounds'][0][2]
        begin(key,[88.5,57.2,18.976],'Official Pi 5 STEP without graphics + visually confirmed mechanical drawing',["Material colours approximated; minor sub-8mm passives and thin solder/pads omitted; IC/connector packages simplified within their exact CAD bounding boxes; connector cavity/contact contours simplified; hidden internal connector solids omitted; no silkscreen, logos or wordmarks."])
        root['license']=(HERE/'sources/pi5-step/LICENSE.txt').read_text()
        metal_bounds=[]
        data.sort(key=lambda s:math.prod(b-a for a,b in zip(*s['bounds'])),reverse=True)
        for i,s in enumerate(data):
            dimensions=[b-a for a,b in zip(*s['bounds'])]
            is_pin=max(dimensions[:2])<1.2 and dimensions[2]>=4
            if s is not main and (max(dimensions)<8.0 and not is_pin or dimensions[2]<.25):continue
            verts=[tuple((v[j]-centre[j])*.001 for j in range(3)) for v in s['vertices']]
            meshdata=bpy.data.meshes.new('cad_'+str(i));meshdata.from_pydata(verts,[],s['faces']);meshdata.update();o=bpy.data.objects.new('cad_'+str(i),meshdata);bpy.context.collection.objects.link(o)
            dims=[b-a for a,b in zip(*s['bounds'])]
            mat=pcb if s is main else brass if max(dims[:2])<1.2 else steel if dims[2]>4 and max(dims[:2])>6 else black
            if mat==steel:
                lo,hi=s['bounds']
                if any(all(a-.05<=x and y<=b+.05 for a,b,x,y in zip(*bound,lo,hi)) for bound in metal_bounds):
                    bpy.data.objects.remove(o,do_unlink=True)
                    continue
                metal_bounds.append(s['bounds'])
            if mat in (black,steel):
                bpy.data.objects.remove(o,do_unlink=True)
                position=[(a+b)/2-centre[j] for j,(a,b) in enumerate(zip(*s['bounds']))]
                package=block('cad_package_'+str(i),position,dims,mat)
                if mat==steel and s['bounds'][1][0]>85:
                    # Cavity contours are visual LOD, not connector fabrication
                    # dimensions. The outside is the exact official CAD bbox.
                    offsets=(-dims[2]/4,dims[2]/4) if dims[2]>16 else (0,)
                    for dz in offsets:
                        h=dims[2]/len(offsets)-.7
                        opening=block('socket_opening',(position[0]+.85,position[1],position[2]+dz),(dims[0]-1.5,dims[1]-.7,h),black)
                        cut(package,opening)
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
        for o in root.children_recursive:o.location.y-=.0055
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
        finish(key,'wheels_60x8',True)
    elif key in ('battery_4s_small','battery_4s_large'):
        dims=[float(v) for v in spec['dimsMm'].split('×')];begin(key,dims,None,['Shrink-wrap corner radius and seam approximate small details. Leads/connectors omitted because their envelope is not supplied.'])
        l,w,h=dims;block('lipo_pack',(0,0,h/2),dims,black,.8);block('end_seal',(0,0,h-.2),(l-1,w-1,.4),rubber,.2);finish(key,'battery_4s_small')
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
        board(25,24);cylinder('lens_barrel',(0,0,6.3),5.7,9.9,black);cylinder('lens_rim',(0,0,11.15),5.65,.5,steel);cylinder('lens_glass',(0,0,11.4),4.8,.2,black);block('csi_socket',(0,9,2.1),(16,4,1),white,.1);finish(key,'camera_module_3')
    elif key=='offroad_tread_tpu':
        begin(key,[88,88,10.4],'Printed design assets/print/mk2/offroad_tread_80.stl; Pololu 0J1708 bare 80mm wheel diameter 76.5mm',['Designed TPU bore 76.2mm stretch fit and lug geometry require physical validation.'])
        bpy.ops.wm.stl_import(filepath=str(ROOT/'assets/print/mk2/offroad_tread_80.stl'),global_scale=.001)
        o=bpy.context.object;o.location.z-=.01375;mesh(o,'print_offroad_tread_80',rubber)
        finish(key,heavy=True)
    elif key=='tracks_pololu_30t':
        begin(key,[124,39,14.6],None,['One track train shown; purchased set supplies two. Minor belt teeth/sprocket recess profiles approximated; 85mm centre spacing, 35mm sprockets, 39mm over-track diameter and 14.6mm belt width sourced.'])
        outer=[];inner=[]
        for cx,angles in [(0,[-math.pi/2+i*math.pi/24 for i in range(25)]),(-85,[math.pi/2+i*math.pi/24 for i in range(25)])]:
            for a in angles:
                outer.append((cx+19.5*math.cos(a),19.5*math.sin(a)));inner.append((cx+17.5*math.cos(a),17.5*math.sin(a)))
        vertices=[];n=len(outer)
        for z in (0,14.6):
            for ring in (outer,inner):vertices.extend((x*.001,y*.001,z*.001) for x,y in ring)
        faces=[]
        for i in range(n):
            j=(i+1)%n
            faces.extend([(i,j,2*n+j,2*n+i),(n+j,n+i,3*n+i,3*n+j),(j,i,n+i,n+j),(2*n+i,2*n+j,3*n+j,3*n+i)])
        m=bpy.data.meshes.new('silicone_track');m.from_pydata(vertices,[],faces);m.update();o=bpy.data.objects.new('silicone_track',m);bpy.context.collection.objects.link(o);mesh(o,'silicone_track',rubber)
        for x in (0,-85):
            sprocket=cylinder('sprocket',(x,0,7.3),17.5,12,black);cut(sprocket,cylinder('shaft',(x,0,7.3),1.5,18,steel,n=20))
            for i in range(6):
                a=i*math.tau/6;cut(sprocket,cylinder('lightening_pocket',(x+10*math.cos(a),10*math.sin(a),7.3),2,18,steel,n=12))
        finish(key,heavy=True)
    elif key=='scout_drone_crazyflie_21_plus':
        bpy.ops.wm.open_mainfile(filepath=str(HERE/'sources/cf2-original.blend'))
        bpy.context.view_layer.update();snapshots=[]
        for obj in list(bpy.context.scene.objects):
            if obj.type!='MESH' or obj.name in ('Plane','cw_prop'):continue
            bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
            for modifier in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.context.view_layer.update();matrix=obj.matrix_world.copy();data=obj.data.copy()
            for v in data.vertices:v.co=matrix@v.co
            snapshots.append((obj.name,data))
        begin(key,[92,92,29],'Bitcraze official CF2 family simulation source + official stock BCP47-17 STL for 2.1+; BOM frame size',['Older manufacturer CF2 mechanical family reference: PCB population is approximate for 2.1+. Stock 47mm propeller geometry is official. Nominal envelope is the frame; propeller sweep is larger. No textures or silkscreen.'])
        root['license']=(HERE/'sources/cf2-LICENSE.txt').read_text()
        for name,data in snapshots:
            obj=bpy.data.objects.new('drone_'+re.sub('[^a-z0-9_]','_',name.lower()),data);bpy.context.collection.objects.link(obj);obj.parent=root;obj.data.materials.clear();obj.data.materials.append(pcb if 'body' in name else steel if name=='Cylinder' else black)
        for i,(x,y) in enumerate([(31,31),(31,-31),(-31,31),(-31,-31)],1):
            bpy.ops.wm.stl_import(filepath=str(HERE/'sources/cf21_prop47.stl'),global_scale=.001)
            obj=bpy.context.object;obj.location=(x*.001,y*.001,.022);mesh(obj,'propeller_'+str(i),black)
        finish(key,heavy=True)
    elif key=='bumper_romi_switch_kit':
        data=json.loads((HERE/'sources/bumper-mesh.json').read_text())
        main=max(data,key=lambda s:(s['bounds'][1][0]-s['bounds'][0][0])*(s['bounds'][1][1]-s['bounds'][0][1]))
        centre=[(a+b)/2 for a,b in zip(*main['bounds'])];centre[2]=main['bounds'][0][2]
        begin(key,[63.132,64.343,11.875],'Official Pololu 0J1672 STEP and 0J1671 dimension drawing',['CAD tessellation/roller contours simplified for browser budget; all physical outlines derive from the official assembly STEP. No PCB silkscreen.'])
        import bmesh
        for i,solid in enumerate(data):
            m=bpy.data.meshes.new('bumper_cad');m.from_pydata([tuple((v[j]-centre[j])*.001 for j in range(3)) for v in solid['vertices']],[],solid['faces']);m.update();o=bpy.data.objects.new('bumper_cad_'+str(i),m);bpy.context.collection.objects.link(o)
            dims=[b-a for a,b in zip(*solid['bounds'])]
            mat=pcb if solid is main else black if max(dims)>10 else steel
            mesh(o,'bumper_cad_'+str(i),mat)
            bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(m);bm.free()
        finish(key)
    elif key=='moisture_probe_sen0193':
        begin(key,[98,23,None],None,['PCB thickness 1.6 mm, tip rounding, printed capacitive electrode layout and small IC/connector details are visual approximations; outline length and width are sourced.'])
        b=board(98,23);components([(-35,0,5,5,1.0),(-28,0,2,3,.7)])
        for y in (-7,7):block('capacitive_electrode',(13,y,1.65),(60,.5,.1),brass)
        for i in range(18):block('electrode_finger',(i*3-12,0,1.65),(.35,14,.1),brass)
        block('ph_socket',(-43,0,3.1),(6,7,3),white,.15);finish(key)
    elif key=='waterproof_case_hammond_1554j2gy':
        begin(key,[160,89,61],None,['Wall thickness, lid seam and corner radii are small visual approximations, not a new seal or machining specification.'])
        body=block('enclosure',(0,0,27),(160,89,54),white,3);cut(body,block('enclosure_cavity',(0,0,30),(154,83,54),black,2));block('lid',(0,0,57.5),(160,89,7),white,3)
        finish(key,heavy=True)
    else:raise ValueError('No dimensionally sourced generator for '+key)

keys=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if keys and keys[0]=='render':
    for key in keys[1:]:
        bpy.ops.wm.open_mainfile(filepath=str(ROOT/entries[key]['blend']))
        root=bpy.data.objects['part_'+key]
        visible={root,*root.children_recursive}
        for o in bpy.context.scene.objects:o.hide_render=o not in visible;o.hide_set(False)
        render(key)
else:
    for key in keys:generate(key)
