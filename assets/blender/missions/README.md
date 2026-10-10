# RR-MISSION-THUMBS

Neutral All-rounder imported unchanged from the approved preset source. All cards use the same 3/4 side camera, three-point light rig and AgX grade. M9 reduces the same rig to night intensity and adds render-only spot headlights and bounded haze; no vehicle assets are changed. Existing M7/M9 scenery meshes are appended into independent render scenes. M3/M6 use simple terrain primitives and materials.

M7 shows a level, unramped gap and the approved city skyline. M3 shows a sunk rover, deep brown mud and muddy puddle. M6 shows the flooded crossing and submerged debris. M9 shows snow, the ice station and headlights. Top-left remains free for UI chips; text is not baked into shipped images.

Masters: 1280×720 PNG plus packed Blender scenes here. Published: `apps/web/public/renders/missions/<id>.webp`, 640×360, maximum 60,000 bytes each. `mission-thumbs.json` records actual sizes. `core_contact_sheet.png` is a visual review sheet in M7/M3/M6/M9 order.

Regenerate from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -t 8 --python assets/blender/missions/render_missions.py -- M7 M3 M6 M9
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/missions/publish_missions.py M7 M3 M6 M9
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/missions/verify_missions.py
```

Optional alternatives: M1, M2, M4, M5, M8, in that order. No application code, mission logic, print assets, or original scenery/vehicle assets are edited.
