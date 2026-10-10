"""Tessellate official unmarked STEP geometry for Blender. Author: sergio.pulido@alodai.com."""
import sys,json
from pathlib import Path
sys.path.insert(0,'/tmp/mk2-cad-runtime')
from OCP.STEPControl import STEPControl_Reader
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_REVERSED
from OCP.TopoDS import TopoDS
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
reader=STEPControl_Reader()
assert int(reader.ReadFile(sys.argv[1]))==1
reader.TransferRoots();shape=reader.OneShape()
BRepMesh_IncrementalMesh(shape,.15,False,.4,True).Perform()
solids=[]
explorer=TopExp_Explorer(shape,TopAbs_SOLID)
while explorer.More():
    solid=explorer.Current();vertices=[];faces=[]
    exp=TopExp_Explorer(solid,TopAbs_FACE)
    while exp.More():
        face=TopoDS.Face(exp.Current());location=TopLoc_Location()
        tri=BRep_Tool.Triangulation_s(face,location)
        if tri:
            offset=len(vertices);transform=location.Transformation()
            for j in range(1,tri.NbNodes()+1):
                point=tri.Node(j).Transformed(transform);vertices.append([point.X(),point.Y(),point.Z()])
            for j in range(1,tri.NbTriangles()+1):
                a,b,c=tri.Triangle(j).Get()
                if face.Orientation()==TopAbs_REVERSED:b,c=c,b
                faces.append([offset+a-1,offset+b-1,offset+c-1])
        exp.Next()
    if vertices:solids.append({'vertices':vertices,'faces':faces,'bounds':[[min(v[i] for v in vertices) for i in range(3)],[max(v[i] for v in vertices) for i in range(3)]]})
    explorer.Next()
Path(sys.argv[2]).write_text(json.dumps(solids))
print('solids',len(solids),'triangles',sum(len(s['faces']) for s in solids))
print('bounds',[[min(s['bounds'][0][i] for s in solids) for i in range(3)],[max(s['bounds'][1][i] for s in solids) for i in range(3)]])
