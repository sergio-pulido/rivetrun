import bpy,json
from mathutils import Vector
objects=[]
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  points=[o.matrix_world@Vector(c) for c in o.bound_box]
  objects.append({'name':o.name,'location':list(o.location),'dimensions':list(o.dimensions),'bounds':[[min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]],'faces':len(o.data.polygons)})
print(json.dumps(objects,indent=2))
