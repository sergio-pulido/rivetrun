# RIVET MK-II — asset contract (v2)

Marker: RR-MK2-CONTRACT-V2

What the Blender asset must look like for the game to mount it, animate it, break it apart and let the player tap its parts. Owner: game session. The asset session builds to this; the game adapter (`apps/web/src/game`) reads exactly what is written here and nothing else.

MK-II v2 is a **buildable rover**: every visible piece is either a catalog part (something the player buys in the Workshop) or a printed part (something the player would 3D-print). No face, no lettering, no decoration.

## Gate

The MK-II replaces the procedural robot only if a real phone holds **≥ 50 fps on `/run/M7`** by **Sat 12:00**. Otherwise the procedural robot stays for the demo and the MK-II is not enabled. Until then it is behind a flag and the procedural robot is the default and the fallback.

## Files

- Location: `apps/web/public/models/rivet-mk-ii/` (served by the app; nothing is fetched from another host).
- One GLB per module: every catalog part id in `packages/sim/src/data/parts.ts`, plus the fixed modules `chassis` and `controller`. File name = `<id>.glb`.
- `manifest.json` (see below). The assembled `rivet-mk-ii.glb` is optional and is not loaded by the game.
- Plain glTF 2.0 binary. **No Draco, no meshopt, no KTX2/Basis** (the app ships no decoders), no external URIs, no cameras, lights or animations.
- There is no `face.glb` in v2.

## Coordinates

- GLB axes: **+X forward, +Y up**, wheels spin around **local Z**. Origin = ground under the centre of the rover.
- 1 unit = 1 render unit of the game (the stylized scale of the procedural robot: about 1.9 long, 1.5 wide, 1.3 tall without mast parts). Not physical millimetres.
- Every module is authored in the rover's common frame: the game mounts each module's root at `(0, 0, 0)` under one parent with no extra offset. Manifest anchors are information only.
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

- A trailing `_node` is tolerated (v1 exported `module_camera_node`); v2 should drop it.
- Mesh children may carry a material suffix `__<nn>` (v1: `module_camera__01`). The game resolves a tapped mesh by walking **up** to the nearest ancestor-or-self whose name starts with `print_`, else `module_`.
- If the same printed part appears several times in one file (four identical wheel brackets), name the instances `print_<id>__1`, `print_<id>__2`, … The game strips a trailing `__<digits>` and treats them as the same printed part: tapping one outlines all of them.

## Printed parts

- A printed part is **its own node** named `print_<id>`. Its subtree holds that part's meshes and nothing else.
- Printed geometry must **not be merged** with other parts in the export copy. Merging static meshes by material is still fine *inside* one `print_<id>` node and inside the non-printed remainder of a module.
- `print_<id>` nodes live **inside** the module they belong to (a camera mast under `module_camera`, the deck plate under `module_chassis`), so they are mounted, removed and thrown off with it.
- Every `<id>` used must exist in `docs/inputs/printed-parts.json`. Ids not in that file are a validation failure, not a silent skip.
- Printed parts that pivot (a printed wheel hub) sit under the pivot node: `wheel_front_left` › `print_hub__1`.

> Open point: `docs/inputs/printed-parts.json` is not in the repository yet (checked Sat 01:50). Until it lands the game cannot validate ids; it will emit whatever follows `print_`.

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

v1 measured: 37,016 triangles and 75 mesh primitives assembled, 22,400 triangles in a wheel set, 1.72 MB assembled. That is too heavy for three robots on a phone. v2 targets:

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
    "camera": {
      "file": "camera.glb",
      "slot": "sensor",
      "triangles": 1180,
      "meshes": 4,
      "bytes": 61240,
      "printedParts": ["camera_mast", "camera_clip"]
    }
  },
  "deckOffsetY": { "wheels": 0, "offroad_wheels": 0.14, "tracks": 0.06 }
}
```

- `printedParts`: the ids of the `print_` nodes in that file. The game and the Workshop use it to know what can be tapped before the file has loaded.
- `deckOffsetY` (optional): how far the game lifts every non-locomotion module for each locomotion id. Omit it if all modules already sit right at the common origin.

## What the game does (for reference)

- Loads the module files for the current `Build` plus the fixed modules, in parallel, from the folder above.
- Mounts them at the origin under one root and drives the pivots from the existing `RobotDrive` (wheel spin, winch, thrusting, airborne). Body wobble on slip and squash on landing are applied to the root.
- On DNF each `module_` root is thrown off and bounces; nothing inside a module separates.
- In the Workshop a tap outlines the tapped part and emits `{ partId }` or `{ printedPartId }`; the ui session opens the sheet.
- **Fallback:** if any file fails to load, is not there within 3 s, or breaks a rule above that the game checks at load (missing `module_` root), the procedural robot is drawn instead. The MK-II never blocks a run.

## Validation (extend `verify_rover.py`)

1. Every catalog id and both fixed ids have a file; no `face.glb`.
2. Exactly one `module_<id>` root per file, named after the file.
3. Every node name matches `^[a-z0-9_]+$`.
4. Every `print_<id>` id exists in `docs/inputs/printed-parts.json`; `manifest.printedParts` matches the nodes in the file.
5. No mesh is shared between a `print_` node and anything outside it.
6. Budgets above, per file and for each of the four presets assembled.
7. No Draco / meshopt / KTX2 extensions, no external URIs, no cameras, lights or animations.
8. Wheel pivots at the axle centres; origin on the ground.
