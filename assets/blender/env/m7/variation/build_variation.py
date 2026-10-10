"""Review candidate only: irregular M7 city. Author sergio.pulido@alodai.com."""
import bpy,bmesh,math,random,json
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;OUT=HERE/'candidate';rng=random.Random(71330)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;root=None;collection=None
collections={}
for k in ['far_skyline','mid_ruins','near_rubble']:
 c=bpy.data.collections.new(k);scene.collection.children.link(c);collections[k]=c
helpers=(HERE.parent/'build_props.py').read_text();exec(helpers[helpers.index('CUBE_FACES='):helpers.index('def slab(')])
def mat(name,c,noise=False,metal=0,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes['Principled BSDF'];s.inputs['Base Color'].default_value=(*c,1);s.inputs['Roughness'].default_value=.85;s.inputs['Metallic'].default_value=metal
 if emit:s.inputs['Emission Color'].default_value=(*c,1);s.inputs['Emission Strength'].default_value=emit
 if noise:
  n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=3;n.inputs['Detail'].default_value=3
  ramp=m.node_tree.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(v*.68 for v in c)+(1,);ramp.color_ramp.elements[1].color=tuple(v*1.18 for v in c)+(1,)
  m.node_tree.links.new(n.outputs['Fac'],ramp.inputs['Fac']);m.node_tree.links.new(ramp.outputs['Color'],s.inputs['Base Color'])
  b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.3;b.inputs['Distance'].default_value=.05;m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],s.inputs['Normal'])
 return m
far=[mat('haze_concrete_'+str(i),c) for i,c in enumerate([(.25,.30,.35),(.31,.34,.37),(.21,.26,.30),(.35,.37,.38)])]
mid=[mat('dust_concrete_'+str(i),c,True) for i,c in enumerate([(.21,.20,.18),(.32,.29,.24),(.26,.27,.26),(.38,.35,.29)])]
near=[mat('foreground_concrete_'+str(i),c,True) for i,c in enumerate([(.08,.09,.095),(.16,.15,.13),(.19,.18,.16),(.12,.135,.14)])]
dark=mat('deep_interior',(.015,.021,.025));steel=mat('weathered_steel',(.08,.10,.12),True,.65);rust=mat('muted_rusted_rebar',(.12,.085,.057),False,.5);glass=mat('broken_dark_glass',(.025,.055,.065),False,.4);rubber=mat('old_tyres',(.007,.009,.011));carpaint=mat('abandoned_car_muted_teal',(.035,.075,.078),True,.35);ochre=mat('ochre_dust',(.22,.185,.135),True);fire=mat('single_fire_glow',(.64,.29,.10),False,0,3)

def polygon_prism(name,outline,y,depth,material):
 n=len(outline);verts=[(x,yy,z) for yy in [y-depth/2,y+depth/2] for x,z in outline];faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];return mesh(name,verts,faces,material)
def chip(name,p,s,material):
 w,d,h=s;poly=[(-w/2,-h/2),(-w*.35,h*.32),(0,h*.5),(w*.5,h*.18),(w*.35,-h*.4)];o=polygon_prism(name,poly,0,d,material);o.location=p;o.rotation_euler=(rng.uniform(-.4,.4),rng.uniform(-.5,.5),rng.random()*6);return o

def building(x,y,w,h,style,damage,materials,tilt=0):
 global root
 root=bpy.data.objects.new('damaged_structure' if damage else 'surviving_structure',None);collection.objects.link(root);root.location=(x,y,0);root.rotation_euler=(rng.uniform(-.035,.035),math.radians(tilt),rng.uniform(-.045,.045))
 depth=rng.uniform(2.4,5.3);m=rng.choice(materials)
 if style==0:
  outline=[(-w/2,0),(-w/2,h*.91),(-w*.28,h),(w*.22,h*.85),(w/2,h*.87),(w/2,0)] if damage else [(-w/2,0),(-w/2,h),(w/2,h),(w/2,0)]
 elif style==1:
  outline=[(-w/2,0),(-w/2,h*.68),(-w*.28,h*.68),(-w*.28,h),(w*.1,h),(w*.16,h*.82),(w*.5,h*.76),(w*.5,0)]
 else:
  outline=[(-w/2,0),(-w/2,h),(-w*.08,h),(w*.03,h*.72),(w*.5,h*.62),(w*.5,0)]
 open_shell=collection.name=='mid_ruins' and style==1
 if open_shell:
  polygon_prism('rear_sheared_wall',outline,depth*.35,.25,dark)
  for f in range(max(2,int(h/2.1))):
   box('fractured_open_floor',(-w*.12,-depth*.15,f*2.1+.1),(w*(1-f*.06),depth,.22),m,rotation=(0,.015*f,0))
  for xx in [-w*.48,-w*.1,w*.28]:
   hh=h*rng.uniform(.62,.98);box('fractured_open_pier',(xx,-depth*.5,hh/2),(.38,.4,hh),m)
 else:polygon_prism('sheared_facade' if damage else 'facade',outline,0,depth,m)
 floors=max(2,int(h/1.25));cols=max(2,int(w/.9));step=h/floors
 for f in range(1,floors):
  for col in range(cols):
   xx=-w*.4+col*w*.8/max(1,cols-1);z=f*step
   if damage and (z>h*.60 and xx>w*-.12 or rng.random()<.23):continue
   # Windows stay inside the actual sheared facade, never floating above a removed corner.
   inside=False;j=len(outline)-1
   for i in range(len(outline)):
    ax,az=outline[i];bx,bz=outline[j]
    if (az>z)!=(bz>z) and xx<(bx-ax)*(z-az)/(bz-az)+ax:inside=not inside
    j=i
   if not inside or open_shell:continue
   box('window_opening',(xx,-depth/2-.012,z),(w*.42/cols,.03,step*.48),dark if collection.name=='mid_ruins' else glass)
 if damage:
  for f in range(max(1,floors-2),floors):
   z=min(h*.84,f*step);box('hanging_exposed_floor',(w*.18,-depth*.5-.32,z),(w*.48,depth*.55,.12),m,rotation=(.04,math.radians(rng.uniform(-12,12)),.05))
  for j in range(4):rod('exposed_reinforcement',(w*.18+j*.17,-depth*.6,h*.78),(w*.18+j*.17+.14,-depth*.7,h*.87),.018,rust)
 for j in range(6 if collection.name=='mid_ruins' else 3):
  xx=rng.uniform(-w*.6,w*.6);chip('foundation_debris',(xx,-depth/2-.2,rng.uniform(-.15,.3)),(rng.uniform(.4,1.1),.6,rng.uniform(.3,.9)),m)
 root=None

collection=collections['far_skyline']
# Different adjacent silhouettes, large empty streets; one third of structures are sheared.
x=-82;index=0;last_style=-1;inventory=[]
while x<79:
 w=rng.uniform(2.8,7);h=rng.choice([rng.uniform(3,5),rng.uniform(6,10),rng.uniform(11,15)]);style=(last_style+rng.choice([1,2]))%3;damaged=index%3==0 or rng.random()<.23
 building(x+w/2,rng.uniform(39,45),w,h,style,damaged,far,rng.choice([-1,1])*rng.uniform(3,10) if damaged else rng.uniform(-2,2));inventory.append({'x':x+w/2,'height':h,'style':style,'damaged':damaged});last_style=style;x+=w+rng.choice([rng.uniform(.7,1.8),rng.uniform(3,6)]);index+=1
# Landmark 1: failed high-rise caught on its neighbour; unequal heights and a visible diagonal crown.
building(-30,38,5.8,15.3,2,True,far,10);building(-23.2,40,4.5,12,1,True,far,-3)
# Irregular low distance masses replace the opaque rectangular footing.
for i in range(75):
 x=rng.uniform(-84,84);chip('distant_ground_mass',(x,43,rng.uniform(-1,.7)),(rng.uniform(1,5),3,rng.uniform(.5,2)),rng.choice(far))

collection=collections['mid_ruins']
for x,y,w,h,style in [(-73,9,6,5,1),(-61,14,10,8,2),(-44,8,7,11,0),(-16,10,12,6,2),(3,12,8,10,1),(18,17,5,5,0),(47,9,11,12,2),(67,15,8,4,1),(77,12,6,7,0)]:
 building(x,y,w,h,style,True,mid,rng.choice([-1,1])*rng.uniform(3,9))
# A gaping open apartment shell at the focal gap.
for f in range(4):
 box('open_apartment_floor',(-2,4,.12+f*2.4),(9.6-f*.6,4,.24),mid[2],rotation=(0,.025*f,0))
for x,h in [(-6.6,7.2),(-3.5,6.5),(0,4.9),(3,3.3)]:
 box('snapped_apartment_column',(x,2.2,h/2),(.4,.45,h),mid[1]);rod('snapped_rebar',(x,2.2,h),(x+.2,2.2,h+.6),.025,rust)
# Landmark 2: bent tower crane, off centre; recognisable lattice and sagging boom.
base=Vector((30,12,0));joint=Vector((30,12,10));head=Vector((27.8,12,16))
for off in [-.42,.42]:
 rod('crane_lower_chord',base+Vector((off,0,0)),joint+Vector((off,0,0)),.075,steel)
 rod('crane_bent_chord',joint+Vector((off,0,0)),head+Vector((off,0,0)),.075,steel)
for z in range(0,10,2):
 rod('crane_lattice',(29.58,12,z),(30.42,12,z+2),.045,steel);rod('crane_lattice',(30.42,12,z),(29.58,12,z+2),.045,steel)
for z in range(10,16):
 shift=(z-10)*(-2.2/6);rod('bent_lattice',(29.58+shift,12,z),(30.42+shift-.37,12,z+1),.04,steel)
rod('crane_boom_top',(23,12,16.3),(40,12,14.6),.07,steel);rod('crane_boom_lower',(23,12,15.5),(40,12,13.8),.07,steel)
for i in range(17):
 z=16.3-i*.1;rod('crane_boom_lattice',(23+i,12,z),(24+i,12,z-.9),.035,steel)
rod('hanging_crane_cable',(39,12,14.4),(39,12,7),.018,steel);box('hook_block',(39,12,6.8),(.3,.3,.5),steel)
# Landmark 3: fractured overpass, uneven collapsed road deck and hanging reinforcement.
for x,h in [(-57,4.5),(-46,3.2)]:box('overpass_pier',(x,1,h/2),(1.3,2.3,h),mid[2])
box('overpass_left',(-61,1,4.7),(11,4,.5),mid[1],rotation=(0,.07,0));box('overpass_fallen_span',(-47,1,2.7),(9,4,.5),mid[2],rotation=(0,.42,.05))
for i in range(7):rod('overpass_rebar',(-55, -.8+i*.3,4.6),(-52,-.8+i*.3,3.9),.025,rust)
# Rubble banks collect beside ruins and leave clear gaps rather than a uniform strip.
for centre,width,height in [(-67,9,1.9),(-42,7,2.8),(-15,8,1.7),(8,5,1.4),(48,10,2.6),(71,5,1.1)]:
 for i in range(35):
  x=rng.uniform(centre-width,centre+width);t=max(0,1-abs(x-centre)/width);s=rng.uniform(.25,1.3);chip('mid_rubble_cluster',(x,rng.uniform(-1,5),height*t*rng.uniform(.1,1)),(s*1.5,s,s*.7),rng.choice(mid+[ochre]))

collection=collections['near_rubble']
for centre,width,height in [(-74,9,2.4),(-50,6,1.2),(-32,7,3.0),(-4,8,.9),(24,5,2.1),(55,9,1.7),(79,4,2.7)]:
 for i in range(28):
  x=rng.uniform(centre-width,centre+width);t=max(0,1-abs(x-centre)/width);s=rng.uniform(.18,1.1);chip('foreground_debris',(x,rng.uniform(-27,-21),height*t*rng.uniform(.1,1)),(s*1.6,s,s*.8),rng.choice(near+[ochre]))
 for i in range(4):
  x=centre+rng.uniform(-width,width);box('readable_concrete_slab',(x,-24,rng.uniform(.2,.8)),(rng.uniform(1.4,3),1.3,.19),near[2],rotation=(.12,rng.uniform(-.5,.5),rng.uniform(-.4,.4)));rod('bent_foreground_rebar',(x,-25,.1),(x+.6,-25,1.2),.035,rust)
# Abandoned crushed car; neutral dark teal, no badges or wordmarks.
box('crushed_car_body',(-20,-23,.8),(4.4,1.8,.75),carpaint,rotation=(0,.06,.025));box('crushed_car_cabin',(-20.1,-23,1.48),(2.2,1.6,.65),carpaint,rotation=(0,-.08,.025));box('broken_car_side_glass',(-20.1,-23.82,1.52),(1.7,.04,.36),glass)
for x in [-21.5,-18.6]:
 for y in [-23.92,-22.08]:
  o=cylinder('car_wheel',(x,y,.48),.48,.24,rubber,16);o.rotation_euler.x=math.pi/2;o=cylinder('car_wheel_metal',(x,y-.13 if y<-23 else y+.13,.48),.25,.025,steel,12);o.rotation_euler.x=math.pi/2
# Fallen lamp beside the car, with bent neck and an identifiable lamp head.
rod('fallen_street_light',(-15,-25,.3),(-8,-24,.55),.075,steel);rod('bent_lamp_neck',(-8,-24,.55),(-7.1,-24,.95),.065,steel);box('street_light_head',(-6.6,-24,.9),(1,.5,.2),near[2],rotation=(0,.1,0))

# Smoke cards use noisy radial alpha rather than opaque geometry bands.
def atmosphere(name,p,width,height,colour,density,seed):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear();out=n.new('ShaderNodeOutputMaterial');transparent=n.new('ShaderNodeBsdfTransparent');em=n.new('ShaderNodeEmission');em.inputs['Color'].default_value=(*colour,1);em.inputs['Strength'].default_value=1;mix=n.new('ShaderNodeMixShader');l.new(transparent.outputs[0],mix.inputs[1]);l.new(em.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],out.inputs['Surface'])
 tex=n.new('ShaderNodeTexCoord');dist=n.new('ShaderNodeVectorMath');dist.operation='DISTANCE';dist.inputs[1].default_value=(.5,.5,0);l.new(tex.outputs['UV'],dist.inputs[0]);r=n.new('ShaderNodeMapRange');r.inputs['From Min'].default_value=.06;r.inputs['From Max'].default_value=.55;r.inputs['To Min'].default_value=density;r.inputs['To Max'].default_value=0;r.clamp=True;l.new(dist.outputs['Value'],r.inputs[0]);noise=n.new('ShaderNodeTexNoise');noise.noise_dimensions='4D';noise.inputs['Scale'].default_value=5;noise.inputs['W'].default_value=seed;noise.inputs['Detail'].default_value=3;l.new(tex.outputs['UV'],noise.inputs['Vector']);mul=n.new('ShaderNodeMath');mul.operation='MULTIPLY';l.new(noise.outputs['Fac'],mul.inputs[0]);l.new(r.outputs['Result'],mul.inputs[1]);l.new(mul.outputs[0],mix.inputs[0])
 o=mesh(name,[(-width/2,0,-height/2),(width/2,0,-height/2),(width/2,0,height/2),(-width/2,0,height/2)],[(0,1,2,3)],m,p);uv=o.data.uv_layers.active
 for loop,value in zip(o.data.polygons[0].loop_indices,[(0,0),(1,0),(1,1),(0,1)]):uv.data[loop].uv=value
 o.rotation_euler.x=math.radians(15)

collection=collections['far_skyline']
for sx,yy,w,h,den,col in [(-34,33,11,17,.95,(.20,.235,.26)),(51,36,7,12,.7,(.31,.32,.30)),(6,35,17,9,.4,(.38,.36,.31))]:
 atmosphere('rising_smoke',(sx,yy,h*.62),w,h,col,den,sx)
 atmosphere('diffuse_smoke_crown',(sx+2,yy,h),w*1.25,h*.65,col,den*.6,sx+1)
collection=collections['far_skyline']
for i in range(7):atmosphere('distance_ground_haze',(-80+i*27,31,.4),48,6,(.34,.38,.40),.48,i+10)
collection=collections['mid_ruins']
for i in range(5):atmosphere('ground_dust_gradient',(-68+i*34,-3,.8+rng.random()),55,4.5,(.34,.32,.28),.42,i)
atmosphere('single_warm_glow',(-34,-4,1.8),7,5,(.58,.30,.13),.75,1)
for i in range(5):box('small_fire_source',(-35+i*.45,-2,.4+rng.random()*.3),(.4,.3,.3),fire)
collection=collections['near_rubble']
for i in range(4):atmosphere('low_foreground_dust',(-60+i*40,-29,-.5),54,3,(.19,.19,.17),.3,2+i)

cd=bpy.data.cameras.new('m7_side_camera');cam=bpy.data.objects.new('m7_side_camera',cd);scene.collection.objects.link(cam);target=Vector((0,0,7));cam.location=target+Vector((0,-160,160*math.tan(math.radians(15))));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=160;scene.camera=cam
world=bpy.data.worlds.new('hazy_dusk');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.42,.49,.56,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
for name,p,energy,col,size in [('cool_sky',(-30,-30,65),30000,(.74,.83,1),70),('dust_bounce',(50,-20,25),12000,(1,.88,.7),50)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=col;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,12,4))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.cycles.transparent_max_bounces=16;scene.render.resolution_x=4096;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.15;scene['author']='sergio.pulido@alodai.com';scene['reviewStatus']='candidate_pending_Sergio';scene['horizonFromTop']=.4
(HERE/'skyline_inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'m7_city_layers.blend'))
for key,c in collections.items():
 for other in collections.values():other.hide_render=other!=c
 scene.view_settings.exposure={'far_skyline':.15,'mid_ruins':-.35,'near_rubble':-.55}[key]
 scene.render.filepath=str(OUT/(key+'.png'));bpy.ops.render.render(write_still=True);print('VARIATION LAYER',key,flush=True)
