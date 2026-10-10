"""Transparent MK-II part and generic Fab Lab tool renders.
Author: sergio.pulido@alodai.com. No third-party meshes or product designs.
"""
import bpy
import math
import json
import re
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
ENVELOPES=Path(__file__).resolve().parent/'envelope-renders'
ENVELOPES.mkdir(exist_ok=True)
PARTS=ROOT/'apps/web/public/renders/parts'
TOOLS=ROOT/'apps/web/public/renders/tools'
PARTS.mkdir(parents=True,exist_ok=True)
TOOLS.mkdir(parents=True,exist_ok=True)
AUTHOR='sergio.pulido@alodai.com'

def material(name,color,metal=0,rough=.45,emission=0):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    shader=m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=metal
    shader.inputs['Roughness'].default_value=rough
    if emission:
        shader.inputs['Emission Color'].default_value=(*color,1)
        shader.inputs['Emission Strength'].default_value=emission
    return m

def block(name,p,size,mat,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p)
    o=bpy.context.object
    o.name=name
    o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Edge radius','BEVEL')
        mod.width=min(bevel,min(size)/3)
        mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.materials.append(mat)
    return o

def cylinder(name,p,radius,depth,mat,axis='Z'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=radius,depth=depth,location=p)
    o=bpy.context.object
    o.name=name
    if axis=='X':o.rotation_euler.y=math.pi/2
    if axis=='Y':o.rotation_euler.x=math.pi/2
    o.data.materials.append(mat)
    for face in o.data.polygons:face.use_smooth=len(face.vertices)==4
    return o

def tube(name,points,mat,radius=.01):
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='3D'
    curve.bevel_depth=radius
    curve.bevel_resolution=2
    spline=curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for point,co in zip(spline.points,points):point.co=(*co,1)
    o=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    return o

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def setup(objects,path):
    scene=bpy.context.scene
    points=[o.matrix_world@Vector(c) for o in objects if o.type in ('MESH','CURVE') for c in o.bound_box]
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    centre=(lo+hi)/2
    span=max(hi-lo)
    data=bpy.data.cameras.new('Asset camera')
    camera=bpy.data.objects.new('Asset camera',data)
    scene.collection.objects.link(camera)
    camera.location=centre+Vector((1.3,-1.8,1.2))*span
    camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO'
    data.ortho_scale=span*1.52
    scene.camera=camera
    world=bpy.data.worlds.new('Neutral studio')
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[1].default_value=.3
    scene.world=world
    for name,offset,power,color in [('Key',(1,-2,3),500,(1,.9,.82)),('Rim',(-2,1,2),650,(.65,.8,1)),('Fill',(2,1,1),260,(1,1,1))]:
        light=bpy.data.lights.new(name,'AREA')
        light.energy=power*span*span
        light.size=span*2
        obj=bpy.data.objects.new(name,light)
        scene.collection.objects.link(obj)
        obj.location=centre+Vector(offset)*span
        obj.rotation_euler=(centre-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES'
    scene.cycles.samples=20
    scene.cycles.use_denoising=True
    scene.render.resolution_x=scene.render.resolution_y=1024
    scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.color_depth='8'
    scene.render.filepath=str(path)
    scene.view_settings.view_transform='AgX'
    scene['author']=AUTHOR
    bpy.ops.render.render(write_still=True)

def tools():
    for id in ['fdm_printer','laser_cutter','soldering_station','oscilloscope','laptop','workbench']:
        clear()
        grey=material('Graphite',(.10,.13,.16),.35)
        metal=material('Bare metal',(.5,.56,.61),.85,.3)
        orange=material('PETG orange',(.9,.22,.035))
        blue=material('Display',(.015,.13,.20),.15,.2)
        green=material('Trace',(.12,.8,.4),emission=1)
        black=material('Black',(.008,.012,.017))
        if id=='fdm_printer':
            block('base',(0,0,.055),(.5,.48,.11),grey)
            block('print bed',(0,-.02,.15),(.34,.34,.024),metal)
            for x in (-.21,.21):
                block('vertical column',(x,.14,.39),(.045,.045,.61),metal)
                cylinder('Z screw',(x,.10,.39),.009,.55,metal)
            block('X gantry',(0,.12,.53),(.46,.06,.045),grey)
            block('extruder carriage',(.055,.06,.50),(.07,.09,.09),orange)
            cylinder('nozzle',(.055,.06,.442),.007,.025,metal)
            block('top tie',(0,.14,.70),(.47,.05,.04),metal)
            cylinder('filament spool',(-.13,.2,.80),.10,.07,black,'Y')
            for y in (.16,.24):cylinder('spool flange',(-.13,y,.80),.112,.008,grey,'Y')
            tube('filament feed',[(-.13,.2,.83),(.01,.2,.79),(.09,.17,.64),(.055,.07,.53)],orange,.003)
            block('control display',(.15,-.23,.11),(.12,.015,.07),blue)
        elif id=='laser_cutter':
            block('enclosed laser base',(0,0,.12),(.72,.50,.24),grey)
            block('lid frame',(0,0,.25),(.74,.52,.035),metal)
            block('viewing window',(0,0,.272),(.57,.35,.012),blue)
            for x in (-.25,-.20,-.15,-.10,-.05,0,.05,.10,.15,.20,.25):
                block('bed slat',(x,0,.285),(.012,.31,.012),grey)
            block('laser X carriage',(0,0,.31),(.52,.035,.03),metal)
            block('laser head',(.10,0,.345),(.055,.06,.065),orange)
            cylinder('lid handle',(0,-.2,.32),.012,.13,black,'X')
            cylinder('exhaust port',(0,.30,.12),.055,.10,metal,'Y')
            block('controls',(.29,-.26,.16),(.06,.02,.08),blue)
        elif id=='soldering_station':
            block('temperature controller',(-.12,0,.09),(.28,.25,.18),grey)
            block('temperature display',(-.12,-.128,.12),(.15,.009,.045),blue)
            cylinder('control knob',(-.12,-.137,.047),.029,.024,black,'Y')
            block('iron holder base',(.20,0,.018),(.17,.26,.036),grey)
            block('sponge tray',(.2,-.075,.045),(.12,.07,.02),orange)
            tube('iron rest',[(.2,.02,.03),(.2,.06,.17),(.2,.12,.21)],metal,.018)
            cylinder('iron handle',(.20,.045,.22),.024,.19,black,'Y')
            cylinder('hot iron barrel',(.20,-.075,.22),.010,.07,metal,'Y')
            cylinder('iron tip',(.20,-.12,.22),.004,.025,metal,'Y')
            tube('iron cable',[(-.1,.1,.08),(-.1,.26,.025),(.19,.27,.025),(.20,.16,.22)],black,.007)
        elif id=='oscilloscope':
            block('instrument body',(0,0,.15),(.44,.20,.30),grey)
            block('screen',( -.075,-.104,.17),(.23,.008,.18),blue)
            for x in range(7):tube('screen grid',[( -.18+x*.035,-.110,.09),(-.18+x*.035,-.110,.25)],metal,.0008)
            for z in range(5):tube('screen grid',[(-.18,-.110,.09+z*.04),(.03,-.110,.09+z*.04)],metal,.0008)
            tube('voltage waveform',[(-.18+i*.21/80,-.114,.17+.055*math.sin(i*math.tau/30)) for i in range(81)],green,.002)
            for x in (.095,.16):
                for z in (.1,.16,.23):cylinder('function knob',(x,-.118,z),.016,.025,black,'Y')
            for x in (-.1,0,.1):cylinder('probe connector',(x,-.12,.04),.010,.035,metal,'Y')
            block('carry handle',(0,0,.326),(.19,.045,.022),black)
        elif id=='laptop':
            block('base',(0,0,.014),(.36,.25,.028),metal)
            block('keyboard recess',(0,.035,.03),(.29,.115,.007),grey)
            for x in range(12):
                for y in range(5):block('key',(-.13+x*.023,-.015+y*.022,.037),(.018,.015,.006),black,.002)
            block('trackpad',(0,-.075,.032),(.10,.05,.006),grey)
            lid=block('screen housing',(0,.115,.15),(.36,.02,.26),grey)
            lid.rotation_euler.x=-.15
            block('screen glass',(0,.095,.155),(.325,.008,.222),blue)
            cylinder('hinge',(0,.11,.03),.012,.29,grey,'X')
        else:
            block('worktop',(0,0,.82),(1.5,.72,.065),material('Worktop',(.37,.25,.13),rough=.8))
            for x in (-.65,.65):
                for y in (-.27,.27):block('steel leg',(x,y,.4),(.045,.045,.80),metal)
                block('side brace',(x,0,.28),(.035,.56,.045),grey)
            block('rear brace',(0,.27,.25),(1.3,.035,.045),grey)
            block('lower shelf',(0,0,.28),(1.30,.55,.04),grey)
            block('drawer case',(-.40,0,.67),(.34,.54,.20),grey)
            for z in (.62,.72):
                block('drawer front',(-.40,-.28,z),(.31,.025,.08),metal)
                block('drawer pull',(-.40,-.30,z),(.12,.018,.014),black)
        objects=list(bpy.context.scene.objects)
        setup(objects,TOOLS/(id+'.png'))
        print('RENDERED TOOL '+id,flush=True)

def printed():
    source=Path(__file__).resolve().parent/'mk2-print-source.blend'
    ids=['chassis_base','motor_saddle','motor_cap','battery_tray','board_standoff','cable_clip']
    if '--' in sys.argv and len(sys.argv)>sys.argv.index('--')+2:ids=[sys.argv[sys.argv.index('--')+2]]
    for id in ids:
        bpy.ops.wm.open_mainfile(filepath=str(source))
        m=material('PETG',(.12,.17,.20),rough=.62)
        obj=bpy.data.objects['print_'+id]
        obj.hide_render=False
        obj.hide_set(False)
        obj.data.materials.clear()
        obj.data.materials.append(m)
        setup([obj],PARTS/(id+'.png'))
        print('RENDERED PRINT '+id,flush=True)

def purchased():
    bom=json.loads((ROOT/'docs/inputs/bom-mk2.json').read_text())
    items={p['key']:p for p in bom['items']}
    selected={}
    for item in bom['items']:
        specs=item['specs']
        raw=next((specs[k] for k in ['dimsMm','dimensionsMm','sizeMm','outsideMm'] if k in specs),None)
        dims=[float(v) for v in re.findall(r'\d+(?:\.\d+)?',str(raw))] if raw else []
        if len(dims)==3 and item['category']!='tool':selected[item['key']]=(item,dims)
        if item['category']=='wheel' and 'diameterMm' in specs:selected[item['key']]=(item,None)
    for key,(item,dims) in selected.items():
        clear()
        grey=material('Component envelope',(.35,.40,.44),.3)
        green=material('PCB',(.012,.18,.07))
        rubber=material('Silicone',(.012,.014,.017),rough=.8)
        if dims is None:
            specs=item['specs']
            obj=cylinder('purchased_'+key,(0,0,specs['diameterMm']/2),specs['diameterMm']/2,specs['widthMm'],rubber,'Y')
        else:
            # A precise external envelope; internal details not given by the
            # supplied BOM are intentionally not fabricated.
            mat=green if item['category'] in ('sensor','power') else grey
            obj=block('purchased_'+key,(0,0,dims[2]/2),dims,mat,0)
        obj['bomKey']=key
        obj['author']=AUTHOR
        obj['representation']='external envelope only'
        setup([obj],ENVELOPES/(key+'.png'))
        print('RENDERED PURCHASE '+key,flush=True)

def details():
    source=Path(__file__).resolve().parent/'mk2-rover-source.blend'
    for key,id in [('camera_module_3','camera'),('ultrasonic_hc_sr04','ultrasonic')]:
        bpy.ops.wm.open_mainfile(filepath=str(source))
        r=bpy.data.objects['module_'+id]
        objects=[o for o in r.children_recursive if o.type=='MESH' and not o.name.startswith('print_')]
        for o in bpy.context.scene.objects:
            o.hide_render=o not in objects
            o.hide_set(False)
        bpy.context.view_layer.update()
        setup(objects,PARTS/(key+'.png'))
        print('RENDERED DETAIL '+key,flush=True)

mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'tools'
if mode=='tools':tools()
elif mode=='printed':printed()
elif mode=='purchased':purchased()
elif mode=='details':details()
else:raise ValueError(mode)
