# RIVET MK-II — asset contract (v2)

Marker: RR-MK2-CONTRACT-V2

What the Blender asset must look like for the game to mount it, animate it, break it apart and let the player tap its parts. Owner: game session. The asset session builds to this; the game adapter (`apps/web/src/game`) reads exactly what is written here and nothing else.

MK-II v2 is a **buildable rover**: every visible piece is either a catalog part (something the player buys in the Workshop) or a printed part (something the player would 3D-print). No face, no lettering, no decoration.

## Gate

The MK-II replaces the procedural robot only if a real phone holds **≥ 50 fps on `/run/M7`** by **Sat 12:00**. Otherwise the procedural robot stays for the demo and the MK-II is not enabled. Until then it is behind a flag and the procedural robot is the default and the fallback.

### Running the gate test

The adapter is in the game already, off by default. On the phone, open `/run/M7?robot=mk2&fps=1` once: `robot=mk2` switches that device to the MK-II (remembered; `?robot=procedural` switches back) and `fps=1` shows a frame-rate badge (`?fps=0` hides it). The badge shows the last second and the worst second after a 3 s warm-up, and turns green at ≥ 50. Play the mission through once in Drive mode; the gate is the **worst** value. Ghost robots stay on the cheap procedural model either way.

If a module file is missing, slow (3 s) or broken, that robot is drawn procedurally and the badge says `MK-II not loaded: procedural`: a number taken in that state does not count. A first visit on a cold cache can hit the 3 s limit; reload once and the files come from cache.

## Files

- Location: **`apps/web/public/models/mk2/`** (served by the app; nothing is fetched from another host). This is the only folder the game reads. `models/rivet-mk-ii/` is the v1 rover with the face: it is not loaded and can be deleted.
- One GLB per module: every catalog part id in `packages/sim/src/data/parts.ts`, plus the fixed modules `chassis` and `controller`. File name as listed in the manifest (`<id>.glb`).
- `manifest.json` (see below) is required: the game reads it first and loads only the files it lists.
- The export may be **partial**. Modules that are not in the manifest yet are drawn procedurally (see "What the game does").
- glTF 2.0 binary, plain or **meshopt-compressed** (`EXT_meshopt_compression`; the app bundles the meshopt decoder). **No Draco, no KTX2/Basis** (no decoders for those), no external URIs, no cameras, lights or animations.
- There is no `face.glb` in v2.

## Coordinates

- GLB axes: **+X forward, +Y up**, wheels spin around **local Z**. Origin = ground under the centre of the rover.
- At the `module_<id>` root, **1 unit = 1 render unit** of the game. Geometry under the root may be authored in real millimetres with the scale on the root node (the v2 export does this: root scale 0.01, `scaleMmPerRenderUnit: 100`, so the 160 mm chassis is 1.6 render units long). The game applies no scale of its own; it uses the root exactly as exported.
- Every module is authored in the rover's common frame: the game mounts each module's root at `(0, 0, 0)` under one parent with no extra offset.
- Ride height follows the locomotion module: the chassis must sit correctly on all three locomotion modules at the same origin, or the manifest gives a `deckOffsetY` per locomotion id (see Manifest).

## Node names (required)

Names are matched literally, so they must survive export unchanged: lowercase `a-z`, digits and `_` only. **No dots, spaces, slashes or brackets** (three.js strips them from node names).

| Node | Meaning | What the game does with it |
|---|---|---|
| `module_<partId>` | Root of one catalog part, or of `chassis` / `controller`. Exactly one per file. | Mounted or removed with the build. Flies off as one piece on DNF. Tap in the Workshop emits `{ partId }` (not for `chassis` / `controller`). |
| `print_<id>` | One **printed part**. `<id>` is an id from `docs/inputs/printed-parts.json`. | Tap in the Workshop outlines it and emits `{ printedPartId: "<id>" }`. |
| `wheel_<anything>` | A wheel pivot at the axle centre. | Rotated around local Z from `RobotDrive.wheelSpin`. |
| `tread_<anything>` | Optional: a track belt or sprocket pivot. | Sprockets rotate around local Z; nothing else moves. |
| `suspension_<anything>` | Cosmetic suspension. | Left alone. |
| `drone_prop_<anything>` | Scout-drone propeller pivot. | Rotated around local Y. |
| `winch_drum` | Winch drum pivot. | Rotated around local Z while the winch is deployed. |
| `thruster_rotor_<anything>` | Thruster propeller pivot. | Rotated around local X; faster while thrusting. |
| `jump_piston_foot` | Piston foot, at rest retracted. | Translated along −Y when the rover leaves the ground. |

Rules for all of them:

- A double-underscore suffix is ignored when reading an id: `print_motor_cap__3` (an instance), `print_battery_tray__001`, `module_motor_light__steel` (a mesh named after its material). Ids themselves therefore never contain `__`.
- The game resolves a tapped mesh by walking **up** to the nearest ancestor-or-self that is a printed part, else to the `module_` root. A node is a printed part if its name starts with `print_` or its glTF `extras.printedPartId` is set (the v2 export writes both).
- If the same printed part appears several times in one file (four motor saddles), name the instances `print_<id>__1`, `print_<id>__2`, … They are the same printed part: tapping one outlines all of them.
- Meshes that are not printed need no special name (`lipo_cell`, `tire_mesh_front_left`, `camera_pcb`): a tap on them selects their module.

## Printed parts

- A printed part is **its own node** named `print_<id>`. Its subtree holds that part's meshes and nothing else.
- Printed geometry must **not be merged** with other parts in the export copy. Merging static meshes by material is still fine *inside* one `print_<id>` node and inside the non-printed remainder of a module.
- `print_<id>` nodes live **inside** the module they belong to (a camera mast under `module_camera`, the deck plate under `module_chassis`), so they are mounted, removed and thrown off with it.
- Every `<id>` used must exist in `docs/inputs/printed-parts.json` (today: `insert_test_coupon`, `chassis_base`, `motor_saddle`, `motor_cap`, `battery_tray`, `board_standoff`, `cable_clip`). Ids not in that file are a validation failure in the exporter; the game emits whatever id the node carries.
- Printed parts that pivot (a printed wheel hub) sit under the pivot node: `wheel_front_left` › `print_hub__1`.

## Not allowed in v2

- A face, LED eyes, a display, or any expression geometry. (The game no longer drives expressions on the MK-II.)
- Lettering, logos, stickers, hazard decals, wiring that is not a part.
- Studio geometry, floors, backdrops.

## Materials

- At most **8 materials** across the whole set, shared by name across files (same name = same material; the game reuses one instance per name).
- Standard metallic-roughness PBR only. Emissive is allowed for status LEDs that are part of a real board. No transmission, clearcoat, sheen or volume extensions; `KHR_materials_emissive_strength` is fine.
- Textures: at most **2**, each ≤ 512 px, embedded. Flat colours preferred.
- The waterproof case may use one alpha-blended material; nothing else is transparent.
- Ghost robots replace every material with one translucent tint, so nothing may rely on texture alpha for its shape.

## Budgets (they decide the gate)

v1 measured 37,016 triangles and 75 mesh primitives assembled. The partial v2 export is far inside the targets so far (wheels 5,352 triangles in 12 primitives, chassis 2,156 in 1). Targets:

| | Budget |
|---|---|
| Any assembled build | ≤ 18,000 triangles, ≤ 36 mesh primitives |
| Locomotion module (all four wheels, or both tracks) | ≤ 8,000 triangles |
| Any other single module | ≤ 2,500 triangles, ≤ 6 primitives |
| Download for the default build (sum of its module files) | ≤ 900 kB |
| Largest single file | ≤ 400 kB |

Splitting a module into `print_` nodes costs primitives: one primitive per material per printed node. Keep printed parts to one material where possible.

## Manifest (`manifest.json`, version 2)

```json
{
  "version": 2,
  "fixed": ["chassis", "controller"],
  "modules": {
    "wheels": {
      "file": "wheels.glb",
      "slot": "locomotion",
      "triangles": 5352,
      "meshes": 12,
      "bytes": 286276,
      "printedParts": ["motor_cap", "motor_saddle"]
    }
  },
  "deferred": ["offroad_wheels", "controller", "tracks"],
  "deckOffsetY": { "wheels": 0, "offroad_wheels": 0.05, "tracks": 0 },
  "scaleMmPerRenderUnit": 100
}
```

What the game reads:

- `version`: must be `2`, or the whole MK-II is skipped.
- `modules`: **the list of what exists.** A module is loaded if and only if it has an entry here; `file` is its file name in the folder.
- `deckOffsetY` (optional): how far, in render units, the game lifts every non-locomotion module for each locomotion id.

Everything else is for people and tools: `deferred` (not exported yet), `printedParts` (ids of the `print_` nodes in the file; must match the nodes), `scaleMmPerRenderUnit` (the scale baked into the module roots), counts, status and notes.

## What the game does (for reference)

- Reads `manifest.json`, then loads the files it lists for the current `Build` plus the fixed modules, in parallel.
- **Rolling base rule:** the MK-II is used only if the manifest has both `chassis` and the build's locomotion module. An MK-II chassis on procedural wheels does not fit, so without both the whole robot is procedural. (Today that means builds on `wheels` get the MK-II; `offroad_wheels` and `tracks` builds stay procedural until those modules are exported.)
- **Per-module fallback:** any other module of the build that is not in the manifest is drawn with its procedural model on the MK-II deck: parts that bolt to the chassis at plate height, the controller board (and what sits on it: IMU, waterproof case) stacked above the battery. No procedural face is drawn on an MK-II.
- Mounts the exported modules at the origin under one root and drives the pivots from the existing `RobotDrive` (wheel spin, winch, thrusting, airborne). Body wobble on slip and squash on landing are applied to the root.
- On DNF each `module_` root is thrown off and bounces; nothing inside a module separates.
- In the Workshop a tap outlines the tapped part and emits `{ partId }` or `{ printedPartId }`; the ui session opens the sheet.
- **Whole-robot fallback:** if the manifest or any file it lists fails to load, is not there within 3 s, or has no `module_<id>` root, the procedural robot is drawn instead. The MK-II never blocks a run.

## Validation (extend `verify_rover.py`)

1. Every id in `manifest.modules` has its file; every catalog id and both fixed ids are in either `modules` or `deferred`; no `face.glb`.
2. Exactly one `module_<id>` root per file, named after the file.
3. Every node name matches `^[a-z0-9_]+$`.
4. Every `print_<id>` id exists in `docs/inputs/printed-parts.json`; `manifest.printedParts` matches the nodes in the file.
5. No mesh is shared between a `print_` node and anything outside it.
6. Budgets above, per file and for each of the four presets assembled.
7. No Draco or KTX2 extensions (meshopt is allowed), no external URIs, no cameras, lights or animations.
8. Wheel pivots at the axle centres; origin on the ground.
