# M9 — Polar Night environment

Author: sergio.pulido@alodai.com. Original unbranded polar station, glacier, wind-carved snow, aurora and communications mast. No people or vehicle changes.

Three transparent 4096×1024 layers share M7's 15° side camera and approximately 40% horizon: far glacier/aurora/stars, mid elevated station with warm windows, near low snowdrifts. The lighting and atmosphere are baked; runtime needs no volumes or new shadow-casting lights.

Four meshopt props use metres, +Y up and a base-centred origin: three rounded, closed snowdrifts and one guyed antenna mast. The snow footprint has an irregular elliptical outline. Procedural micro-bump appears in the Blender renders; the GLBs retain the smooth wind-carved mesh, flat PBR colour and high roughness. The mast warning lamp is emissive, without an exported light.

Runtime files: `apps/web/public/env/m9/`. Placement and budgets: `docs/inputs/m9-env.json`. Previews here are source review artifacts. Keep tall scenery behind the far driving lane and keep the scan pad clear; dressing does not change deterministic collisions. Give snowdrifts a 3mm placement offset over sampled terrain to avoid coplanar edge pixels.

## Reproduce

Blender 5.2, Python with Pillow and the existing glTF-Transform CLI in `/tmp/rivetrun-meshopt-runtime/` are required. The generator reuses M7's validated mesh/export/base-origin helpers, without running or changing the M7 generator.

```sh
Blender -b --python assets/blender/env/m9/build_environment.py
python3 assets/blender/env/m9/publish_backdrop.py
python3 assets/blender/env/m9/publish_props.py
Blender -b --python assets/blender/env/m9/render_prop_review.py
python3 assets/blender/env/m9/verify_environment.py
node assets/blender/env/m9/verify_meshopt.mjs
```

The source environment keeps all props in separate collections at zero origin. The review script moves only its in-memory copy, fits the camera to every prop and does not overwrite the source assembly.
