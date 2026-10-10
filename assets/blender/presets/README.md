# RR-PRESET-RENDERS

Author: sergio.pulido@alodai.com.

Four vehicle cards in `PRESETS` order: speedster, mud_crawler, all_rounder, deep_diver. Exact build lists are read from `packages/sim/src/data/parts.ts`; fixed chassis/controller follow the existing MK-II assembly. No new component geometry, vehicle modules, print work or game code.

- Transparent PNG masters: `<presetId>.png`, 1024×1024.
- Runtime cards: `apps/web/public/renders/presets/<presetId>.webp`, 768×768, all under 150 KB.
- `readability_120px.png` shows every card at exactly 120 px on the app's #0e1013 background. Viewed at native size: slick spoked wheels, tracked enclosure, knobbly wheels/bumper, and wheeled enclosure/top sensors are distinguishable.
- Shared camera: default_build_hero_side_3q direction (1.6, −5.5, 2.6); one common target and orthographic scale for all four. Identical white three-point default-hero lighting.
- The existing component-library IMU and Hammond enclosure are placed in the render at their existing dimensions (metres ×10 = MK-II render units). These are render-only placements, not new game modules or a mechanical fit certification. Sealed variants conceal some of the included battery/electronics geometry. The controller is positioned below the enclosure lid, so its connectors do not protrude through it.
- **Missing model: `thruster_kit` in Deep Diver. Omitted, never substituted or invented.** Deep Diver is a partial visual representation until its propulsors have a model.
- Sources, full lists, placements and missing items: `render-inputs.json`, `assembly-manifest.json`, `preset-renders.json`.

Reproduce:

```sh
node assets/blender/presets/prepare_inputs.mjs
/Applications/Blender.app/Contents/MacOS/Blender -b -t 8 --python /Users/nectios/workspace-os/hackathons/rivetrun/assets/blender/presets/render_cards.py
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/presets/publish_renders.py cards
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/presets/publish_renders.py lineup
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/presets/publish_renders.py og
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/presets/verify_renders.py
```

Temporary plain GLBs are decoded locally into `/tmp/rr-preset-render-inputs`; production models remain meshopt and untouched. `.blend1` backups must not be committed. All actual bytes/dimensions are recorded in the manifest.
