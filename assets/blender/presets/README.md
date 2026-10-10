# RR-PRESET-RENDERS

Author: sergio.pulido@alodai.com.

Four vehicle cards in `PRESETS` order: speedster, mud_crawler, all_rounder, deep_diver. Exact build lists are read from `packages/sim/src/data/parts.ts`; fixed chassis/controller follow the existing MK-II assembly. The only new component geometry is the explicitly requested generic 68 mm ducted fan module. No print work or game code changes. Human additions: Speedster gains ducted_fan; Mud Crawler gains piston_jump, retaining its existing sealed case. These additions are applied to render inputs until the sim session updates PRESETS.

- Transparent PNG masters: `<presetId>.png`, 1024×1024.
- Runtime cards: `apps/web/public/renders/presets/<presetId>.webp`, 768×768, all under 150 KB.
- `readability_120px.png` shows every card at exactly 120 px on the app's #0e1013 background. Viewed at native size: slick spoked wheels, tracked enclosure, knobbly wheels/bumper, and wheeled enclosure/top sensors are distinguishable.
- Shared camera locked in studio.json: default_build_hero_side_3q direction (1.6, −5.5, 2.6); one common target and orthographic scale for all four. Identical white three-point default-hero lighting.
- The existing component-library IMU and Hammond enclosure are placed in the render at their existing dimensions (metres ×10 = MK-II render units). These are render-only placements, not new game modules or a mechanical fit certification. Sealed variants conceal some of the included battery/electronics geometry. The controller is positioned below the enclosure lid, so its connectors do not protrude through it.
- **Missing models: `piston_jump` in Mud Crawler and `thruster_kit` in Deep Diver. Omitted, never substituted or invented.** Mud Crawler and Deep Diver are partial visual representations until those parts have approved assets. The game's experimental piston primitive is not substituted for an approved component model.
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
