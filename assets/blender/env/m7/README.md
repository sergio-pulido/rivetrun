# M7 — Earthquake Rescue environment

Author: sergio.pulido@alodai.com. Original Blender scenery and generic props, with no people, lettering or logos. These assets do not alter the vehicle, track geometry, simulation, Jev or Room Race.

The three transparent layers use the same orthographic side camera, depressed 15° like the game camera. The far-city ground horizon projects at approximately 40% of the image height. Far = skyline and baked volumetric smoke; mid = fractured facades, collapsed floor plates, masonry and rebar; near = a low continuous rubble line. The smoke is baked, with no runtime volume shader.

The eleven props use metres, +Y up and a root at the base-centre. Concrete uses one original 256px aggregate texture embedded in the GLBs. Safety tape and the crumpled guardrail are intentionally two-sided thin surfaces. Work lights and the rescue beacon are emissive meshes, without exported lights or animation. All GLBs use meshopt, with no Draco or external resources.

Runtime files: `apps/web/public/env/m7/`. Integration metadata and budgets: `docs/inputs/m7-env.json`. Previews in this source folder are review artifacts, not extra runtime textures. Keep tall pieces behind the far driving lane and every scan zone clear. All dressing is decorative and must not change deterministic collision geometry.

## Reproduce

Use Blender 5.2, Python with Pillow, and the existing glTF-Transform CLI installed outside this repo at `/tmp/rivetrun-meshopt-runtime/node_modules/.bin/gltf-transform`.

```sh
Blender -b --python assets/blender/env/m7/build_backdrop.py
Blender -b --python assets/blender/env/m7/refine_backdrop.py
python3 assets/blender/env/m7/publish_backdrop.py
python3 assets/blender/env/m7/make_surface_maps.py
Blender -b --python assets/blender/env/m7/build_props.py
python3 assets/blender/env/m7/publish_props.py
Blender -b --python assets/blender/env/m7/render_prop_review.py
python3 assets/blender/env/m7/verify_environment.py
node assets/blender/env/m7/verify_meshopt.mjs
```

Run `refine_backdrop.py` once after the clean base generator; it adds the art refinements to that scene. The publisher encodes WebP layers and removes only its generated intermediate PNGs. Review renders do not overwrite the zero-origin source assembly.
