"""BOM-screen previews. Author: sergio.pulido@alodai.com.
Three photo-proportioned items deliberately have no GLB or measured envelope.
"""
import sys
from pathlib import Path
source=Path(__file__).with_name('create_library.py')
exec(compile(source.read_text().split('keys=sys.argv')[0],str(source),'exec'))
original_finish=finish
PREVIEW=HERE/'tier2-render-manifest.json'
preview={p['key']:p for p in json.loads(PREVIEW.read_text())} if PREVIEW.exists() else {}
APPROX={'ambient_light_veml7700','geiger_counter_mightyohm','brushless_motor_dfrobot_fit0441'}
export_mode='--export' in sys.argv

def finish(key,group=None,heavy=False):
    if export_mode and key not in APPROX:
        original_finish(key,group,heavy);return
    consolidate()
    path=HERE/((group or key)+'.blend')
    if group and path.exists():
        temporary=path.with_name(path.stem+'_previous.blend');shutil.copy2(path,temporary)
        with bpy.data.libraries.load(str(temporary),link=False) as (a,b):b.objects=list(a.objects)
        for o in b.objects:
            if o:bpy.context.scene.collection.objects.link(o);o.hide_render=True
        temporary.unlink()
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    render(key)
    record={'key':key,'blend':str(path.relative_to(ROOT)),'glb':None,'render':str((RENDERS/(key+'.png')).relative_to(ROOT)),'envelopeMm':envelope,'dimsSource':source,'approximations':approximations,'tris':count(),'glbKb':None,'author':AUTHOR}
    preview[key]=record;PREVIEW.write_text(json.dumps(list(preview.values()),indent=2)+'\n')
    if key in APPROX:
        record['approximate']=True;record['dimsSource']='not published; proportions from product photos';record['envelopeMm']=None
        entries[key]=record;MANIFEST.write_text(json.dumps(list(entries.values()),indent=2)+'\n')

def qt(key,dims,chip,src=None):
    begin(key,dims,src or ITEMS[key]['url'],['Small package placement, connector outlines, solder pads and board thickness simplified for a demo render; no fabrication hole pattern asserted.'])
    h=dims[2];board(*dims[:2],thickness=min(1.6,h*.65));components([(0,0,*chip)],z=min(1.6,h*.65))
    if h>3:
        for x in (-dims[0]/2+3,dims[0]/2-3):block('qt_socket',(x,0,h-1.5),(5,4,3),white,.2)

keys=['arduino_uno_r4_wifi','ir_distance_sharp_gp2y0a21','ambient_light_veml7700','thermal_camera_mlx90640','stepper_nema17_pololu','servo_metal_gear_mg92b','battery_holder_4aa','lidar_rplidar_c1','camera_module_3_noir','tof_vl53l1x_pololu','gps_adafruit_ultimate','gas_sensor_bme688','geiger_counter_mightyohm','brushless_motor_dfrobot_fit0441','microphone_i2s_sph0645']
requested=[a for a in sys.argv[sys.argv.index('--')+1:] if not a.startswith('--')] if '--' in sys.argv else []
if requested:keys=[k for k in keys if k in requested]
for key in keys:
    if export_mode and key in APPROX:continue
    if key=='arduino_uno_r4_wifi':
        begin(key,[68.85,53.34,None],ITEMS[key]['url'],['PCB thickness 1.6 mm and minor connector/package contours approximate; published outline retained.'])
        board(68.85,53.34);components([(-10,0,10,10,1.2),(18,8,15,18,2)])
        block('usb_c',(-29,10,3.6),(10,8,4),steel,.5);cylinder('dc_socket',(-28,-16,7),5.5,12,black,axis='X')
        for y,n in [(-23,14),(23,14)]:block('gpio_header',(4,y,5.6),(n*2.54,3,8),black,.2)
        for x in range(12):
            for y in range(8):block('led_matrix_pixel',(-3+x*1.3,-10+y*1.3,2),(.6,.6,.3),steel)
    elif key=='ir_distance_sharp_gp2y0a21':
        begin(key,[44.5,18.9,13.5]);block('ir_housing',(0,0,6.75),(44.5,18.9,13.5),black,1)
        for x in (-12,12):cylinder('ir_optics',(x,0,13.3),5.2,.4,steel);cylinder('ir_aperture',(x,0,13.55),4.7,.2,black)
        block('three_pin_socket',(0,8,6),(9,3.8,5),white,.3)
    elif key=='ambient_light_veml7700':
        qt(key,[25,17,4.6],(6,4,1.3),'not published; proportions from product photos')
        pcb.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.012,.012,.015,1)
        block('light_sensor_window',(0,3,3.6),(5,3,.4),white,.1)
        approximations=['Entire unmeasured envelope and component sizes are illustrative proportions from official Adafruit 4162 product photos. No engineering dimensions or GLB supplied.']
        envelope=None
    elif key=='thermal_camera_mlx90640':
        qt(key,[25.7,17.7,16],(4,4,1));cylinder('thermal_can',(0,0,8.8),4.8,14.4,steel);cylinder('ir_window',(0,0,16),3.5,.2,black)
    elif key=='stepper_nema17_pololu':
        begin(key,[42.3,42.3,48],ITEMS[key]['url'],['Endcap division, recesses and surface details simplified. Shaft length not in BOM; front bearing opening shown without inventing an exposed shaft length. Envelope excludes shaft as manufacturer specifies.'])
        block('stator',(0,0,-24),(42.3,42.3,48),black,2)
        for z in (-4,-44):block('endcap',(0,0,z),(42.3,42.3,8),steel,2)
        cylinder('bearing_face',(0,0,.2),11,.4,steel);cylinder('shaft_face',(0,0,.5),2.5,.6,steel)
    elif key=='servo_metal_gear_mg92b':
        begin(key,[36,12,31],ITEMS[key]['url'],['Body/endcap split and spline detail approximate within official 36x12x31 mm external envelope; no optional horn or cable shown.'])
        block('servo_body',(0,0,13),(24,12,26),black,.6);block('mount_ears',(0,0,23),(36,12,2),black,.4);cylinder('output_spline',(7,0,28),3,6,brass)
    elif key=='battery_holder_4aa':
        begin(key,[58,63,16],None,['Walls, battery channels and spring winding are simplified small details; cells and unsourced lead diameter omitted.'])
        box=block('cell_holder',(0,0,8),(58,63,16),black,1);cut(box,block('open_cavity',(0,0,10),(54,59,16),black))
        for x in (-21,-7,7,21):
            for y in (-28,28):cylinder('cell_contact',(x,y,8),4,1,steel,axis='Y')
    elif key=='lidar_rplidar_c1':
        begin(key,[55.6,55.6,41.3],None,['Rotating head seam, optical window contours and mounting base details simplified within BOM dimensions.'])
        block('lidar_base',(0,0,4),(55.6,55.6,8),black,3);cylinder('lidar_head',(0,0,24.65),27.8,33.3,black);block('scan_window',(0,-27.6,25),(30,1,9),steel,.3)
    elif key=='camera_module_3_noir':
        begin(key,[25,24,11.5],ITEMS[key]['url'],['Shares Camera Module 3 mechanical outline; filter variant has no external branding. Minor socket/lens rim details approximate.'])
        board(25,24);cylinder('lens_barrel',(0,0,6.3),5.7,9.9,black);cylinder('lens_rim',(0,0,11.15),5.65,.5,steel);cylinder('lens_glass',(0,0,11.4),4.8,.2,black);block('csi_socket',(0,9,2.1),(16,4,1),white,.1)
    elif key=='tof_vl53l1x_pololu':qt(key,[12.7,17.78,2.159],(4.9,2.5,.55));block('tof_window',(0,0,2.13),(3,1.7,.05),black)
    elif key=='gps_adafruit_ultimate':
        qt(key,[25.5,35,6.5],(14,17,3));block('ceramic_antenna',(0,3,4.6),(14,14,3.8),white,.3);cylinder('rf_connector',(8,-11,3),1.3,2,brass)
    elif key=='gas_sensor_bme688':qt(key,[25.5,17.6,4.6],(3,3,.9));block('gas_sensor_can',(0,0,3),(3,3,.6),steel)
    elif key=='microphone_i2s_sph0645':
        qt(key,[16.7,12.7,1.8],(3.5,2.7,.5));cylinder('acoustic_port',(0,0,1.8),.45,.06,black,n=16)
    elif key=='geiger_counter_mightyohm':
        begin(key,None,'not published; proportions from product photos',['Whole geometry uses unmeasured proportions from official kit photographs; values are internal drawing proportions, not manufacturing dimensions. No GLB supplied.'])
        board(100,60);pcb.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.45,.28,.015,1)
        cylinder('gm_tube',(0,-16,8),4,80,brass,axis='X');components([(-16,15,25,8,4)])
        cylinder('piezo',(34,17,7),8,11,black);cylinder('hv_capacitor',(-35,12,8),3,13,black)
        for x in (-42,42):block('tube_contact',(x,-16,6),(3,10,9),steel,.4)
    elif key=='brushless_motor_dfrobot_fit0441':
        begin(key,None,'not published; proportions from product photos',['Body length not published (L in official drawing); full model is illustrative photo proportion only. No measured envelope or GLB supplied.'])
        cylinder('gearcase',(0,0,-12),12.5,24,steel);cylinder('motor_body',(0,0,-33),12.2,18,steel);cylinder('output_shaft',(0,0,6),2,12,steel);cylinder('shaft_bearing',(0,0,.2),3.5,1,brass)
    finish(key,'camera_module_3' if key=='camera_module_3_noir' else None,heavy=key=='lidar_rplidar_c1')
