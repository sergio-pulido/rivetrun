# MK-II v2 — manufacturing prototype and partial asset handoff

Author: sergio.pulido@alodai.com

**Status: partial; not a release-ready or physically validated rover.** The human
has confirmed that the missing controller and insert installation dimensions
will be added to the BOM. This folder contains the work that can be checked
against the dimensions supplied so far. No game code or other session's files
were edited.

## Print-first delivery

Nine unique PETG parts are exported in millimetres, on their print faces. Every
STL was checked for closed manifold triangle edges, positive volume and a
bounding box smaller than 180 × 180 × 180 mm. Quantities, actual slicer weights
and hours are in `docs/inputs/printed-parts.json`.

- `chassis_base.stl`: 160 × 100 × 4 mm. M3 clearance holes, motor stations,
  adjustable mounting grid and routing/strap passages. Suitable for a **prototype
  fit-test**, not a promise that the final BOM needs no hole changes.
- `motor_saddle.stl` and `motor_cap.stl`: four pairs; the body envelope follows
  the earlier 10 × 12 × 25 mm N20 reference. 30 × 27 mm footprints leave 1.2 mm
  lateral clearance to the 80 × 10 mm wheel envelope in the authored assembly.
  The 4.2 mm insert pilot is **provisional**; 5.7 mm insert depth follows the BOM.
  Wait for the ruthex installation diameter before printing saddles.
- `battery_tray.stl`: for the BOM's Gens ace 4S large 107 × 35 × 27 mm pack,
  with 1 mm lateral clearance, chassis mounting holes and strap routing slots.
  No strap has been invented or shown as an unlisted purchased component.
- `board_standoff.stl`: generic M3 through-hole spacer; not a claim that M3 fits
  the Pi's mounting holes. Board-specific retention waits for its drawing.
- `cable_clip.stl`: open cable restraint with an M3 mounting hole.

Bambu Studio's bundled A1 mini 0.4 mm / Bambu PETG HF profile was used with
0.2 mm layers, 15% infill, no supports, no brim, and Textured PEI Plate.
`slicer/<id>/<id>.3mf` contains the actual sliced job; the per-part log and
flattened profiles are retained. These are estimates from slicing, not measured
print duration or measured strength. For tonight, start with the base as a
fit-test coupon/chassis prototype.

## Partial GLBs

`apps/web/public/models/mk2/` contains eight modules and a version-2 manifest.
The human explicitly requested this folder; the game contract still names
`models/rivet-mk-ii/`. No copy was made over the v1 files and no adapter route
was changed. This path discrepancy must be resolved by the game owner.

Available: chassis, wheels, motor_light, motor_torque, battery_small,
battery_large, camera, ultrasonic. Print nodes remain separate and wheel
rotation names belong only to the four axle pivots. Shared flat PBR materials;
no textures, compression decoders, lights, cameras or baked animations.

**Limitations:** the camera/ultrasonic are component envelopes awaiting printed
mounts; motor bodies use the earlier reference and are not dimensionally
verified for the BOM's 12 V variants. The battery assets represent 2S variants.
Their combination is a geometry/budget check, not an approved electrical build.
The controller is missing; the manifest therefore deliberately cannot satisfy
all catalog/fixed-module coverage. The default complete hero render is pending.

`mk2-rover-source.blend` is an editable partial geometry assembly. It is not a
fabrication certificate. It contains no face or decorative plates.

## Renders

Six printed-part and two component previews are in
`apps/web/public/renders/parts/`. Six generic, original tool renders are in
`apps/web/public/renders/tools/`: FDM printer, laser cutter, soldering station,
oscilloscope, laptop and workbench. They use no logos or copied product meshes.
All published PNGs are 1024 × 1024 with transparency and at most 300 KB.

The other BOM items with supplied external dimensions were rendered only as
**dimensional envelopes** for fit inspection. Those previews are deliberately
kept in `envelope-renders/`, outside the production render catalog. They do not
claim to reproduce the actual component appearance.

## Repeatable verification

From the repository root:

```sh
python3 assets/print/mk2/verify_assets.py
```

`validation.json` records the checks and explicitly lists missing modules.
It does not mark full contract coverage or the real-phone ≥50 FPS gate as passed.

Generation order: `create_prints.py` in Blender, `slice_parts.py`, then
`create_modules.py` in Blender, `render_assets.py`, and `finalize_png.py` with
the bundled Pillow runtime. Regenerate affected slicer jobs whenever an STL
changes; never carry old weights/times onto changed geometry.

## Next required work

1. Consume the promised controller outline, mounting-hole drawing and ruthex
   pilot diameter; revise the mechanical interfaces and do a physical fit-test.
2. Complete printed electronics/sensor mounts, source the remaining component
   dimensions and generate the remaining catalog modules without placeholders.
3. Complete purchased-part renders and the default hero; resolve the served
   folder with the game owner and run the complete preset and phone gate checks.

## Consolidated-brief update

The official ruthex STEP has a maximum circular/cylindrical radius of 2.3 mm
(4.6 mm outer diameter). `mechanical-parameters.json` provides one
`insertHoleMm` parameter for every insert socket. All bosses remain marked
"hole size: calibrate". The coupon holes are 3.8, 4.0, 4.2, 4.4 mm left-to-right.

The bridge and controller carrier now raise the Pi over the largest pack.
The carrier has integral 16 mm posts, 2.4 mm locating pegs on the Pi's official
58 × 49 mm / Ø2.7 mm mounting pattern, and flexible printed edge latches.
M3 screws attach the carrier to the bridge; they do not pass through the Pi.
The regulator's Ø2.18 mm mounting holes use printed locating pegs and latches;
no unlisted M2 fastener has been modelled. Test these retainers physically.

The S13V30F5 drawing confirms a 22.9 × 22.9 mm board: 18.5 mm is the hole
centre spacing, not a board edge. Every slicer weight/time now comes directly
from `result.json`, `total_used_g` and `total_predication`, using Bambu PETG HF
density 1.28. Source URLs and drawing copies are in the owned asset folders.
