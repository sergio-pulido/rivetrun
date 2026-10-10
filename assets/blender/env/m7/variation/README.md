# M7 variation pass — complete review candidate

Author: sergio.pulido@alodai.com. Prepared 2026-10-10 before the 13:30 Europe/Madrid cutoff.

**Pending Sergio's visual approval. The active M7 delivery is unchanged.** M9 was closed with pushed commit 82287aa and is outside this pass.

## Review

- `before_1280x720.png`: existing M7 environment.
- `after_1280x720.png`: complete variation proposal.
- Matched Blender foreground: exact unchanged all_rounder MK-II game modules, same 15° side camera, lighting, prop placement and output size. The three parallax layers are composited over the same dusk sky and street gradient. These are asset-review renders, not gameplay screenshots.
- `comparison_scene.blend` is the after foreground scene. `render_comparison.py` recreates both foregrounds; `review_backgrounds.py` and `compose_comparison.py` assemble the review images.

## Complete replacement set

`candidate/` mirrors **all existing runtime filenames**: three 4096×1024 transparent WebPs, `props/` with all eleven meshopt GLBs, and `m7-env.json` retaining layer/prop IDs, URLs, origins, envelopes, scales and placement parameters. After approval, the assets replace the corresponding files under `apps/web/public/env/m7/`; the candidate manifest replaces `docs/inputs/m7-env.json`. The candidate Blender sources replace the matching `assets/blender/env/m7/` sources. Do not publish individual layers or a subset of props.

Changes: irregular gaps and heights, different neighbouring silhouette styles, sheared corners and open skeletal structures, leaning high-rise, bent lattice crane, broken overpass, cool distant haze, darker middle/foreground layers, uneven rubble clusters, abandoned car, concrete/rebar and fallen street light. Two smoke columns plus a broader dust plume vary in width and opacity; one muted fire glow. The prop geometry and mounting origins are unchanged; brick, rust, hazard paint and the tripod's former orange housing are muted so the rover remains the orange focal point.

Budgets measured from the final files:

| Set | Actual | Limit |
| --- | ---: | ---: |
| All three backdrop layers | 449,822 bytes | 600,000 bytes total |
| All eleven props | 1,061,800 bytes | 1,200,000 bytes total |
| Prop triangles | 13,302 | 15,000 |

`review.json` records active and candidate SHA-256 hashes. `skyline_inventory.json` records the seeded skyline heights, silhouette styles and damage flags; the two landmark towers are additional.

## Verify before approval

From the repository root:

```sh
/Users/nectios/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 assets/blender/env/m7/variation/verify_candidate.py
node assets/blender/env/m7/variation/verify_meshopt.mjs
```

The Python check verifies the stricter total budgets, transparent layer dimensions, GLB axes/base origins, runtime compatibility and that active files remain unchanged. The Node check decodes every meshopt primitive locally, checks finite positions/normals and valid indices, and verifies embedded textures. Both commands passed.

No vehicle, game code, simulation, printing, M9 or other sessions' files were changed. No Draco, CDN decoder, figures or logos.
