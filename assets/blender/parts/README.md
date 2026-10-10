# MK-II demo assets

Author: sergio.pulido@alodai.com

The screen-first demo queue is complete: 12 rover modules, 33 component GLBs, 36 component renders, a 1920×1080 default-build hero and 16 Lab Missions sprites. Printing and fit work are paused. These visuals do not certify an assembled physical rover.

## Game assets

- Rover: `apps/web/public/models/mk2/manifest.json`. Includes chassis, controller, three locomotion options, both HPCB motor ratios, both 4S batteries, camera, ultrasonic and bumper. Other catalog ids are explicitly deferred and use the game's per-module fallback.
- Default `all_rounder`: 12,296 triangles, 35 primitives, 258,640 bytes across its modules. Largest single module: 58,612 bytes. Module roots, wheel pivots and printed-part ids survive compression.
- Component library: `docs/inputs/component-models.json`. Sources refer to the BOM or official product documentation; small simplifications are listed. Wheel sizes, LiPo sizes, camera filter variants and gear ratios share their source blend.
- All published GLBs use meshopt. This human instruction supersedes the earlier plain-GLB rover contract. The decoder is bundled with Three.js; each loader must call `setMeshoptDecoder(MeshoptDecoder)`.
- VEML7700, MightyOhm Geiger and FIT0441 are explicitly approximate, proportioned from official photos, without a measured envelope or GLB.
- Component renders: transparent 1024 px, each ≤300 KB, a common 3/4 view and lighting, approximately 75% frame occupancy.
- Hero: `apps/web/public/renders/mk2/default_build_hero.png`, transparent 1920×1080. The assembly uses the default preset, including its locomotion deck lift.

## Verification

From the repository root:

```sh
python3 assets/blender/parts/verify_demo_modules.py
python3 assets/blender/parts/verify_component_library.py
node assets/blender/parts/verify_meshopt_loader.mjs
```

The last check decodes all 45 GLBs with the installed Three.js decoder, verifies finite bounds and metre/render-unit scales, and writes `meshopt-validation.json`. It makes no CDN requests.

PNG checks require Pillow. On this workspace the bundled runtime is:

```sh
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/parts/verify_part_renders.py
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/parts/verify_hero.py
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/lab/verify_lab_sprites.py
```

The phone performance gate is still a real-device check: play `/run/M7?robot=mk2&fps=1`, confirm that MK-II loaded, and measure the worst FPS after warm-up. File budgets and desktop decoding do not establish ≥50 FPS on a phone.

## Re-exporting

Blender writes plain intermediate GLBs. Publish only after `compress_meshopt.py` and the validators pass. The conversion preserves node names and extras; it does not merge printed parts or pivots. Temporary conversion dependencies live outside the repository.

```sh
npm install --prefix /tmp/rivetrun-meshopt-runtime @gltf-transform/cli
python3 assets/blender/parts/compress_meshopt.py
```

Blender's importer needs plain render inputs. Decode to a temporary folder without changing public assets:

```sh
node assets/blender/parts/decode_for_blender.mjs
MK2_HERO_MODELS=/tmp/mk2-blender-decoded /Applications/Blender.app/Contents/MacOS/Blender --background --python assets/blender/parts/render_demo_hero.py
MK2_LAB_MODELS=/tmp/mk2-blender-decoded /Applications/Blender.app/Contents/MacOS/Blender --background --python assets/blender/lab/create_lab_sprites.py
```

The `.blend` files retain editable geometry. Optional manufacturer CAD caches used during initial authoring are local source caches, not app dependencies; their license notices are retained in `LICENSE_PI5.txt` and `LICENSE_CF2.txt`. Source images and brand markings are not embedded in the assets.

The tread remains a catalog visual prototype. Its rover nodes do not advertise an unpublished printed-part id. Every active print link is checked against the committed printed-parts manifest.
