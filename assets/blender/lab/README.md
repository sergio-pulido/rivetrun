# Lab Missions sprites

Author: sergio.pulido@alodai.com

Sixteen original 256×256 transparent sprites live in `apps/web/public/renders/lab/`. `docs/inputs/lab-sprites.json` supplies ids, URLs, anchors, dimensions, suggested footprints and byte sizes. All use a top-down orthographic camera, a shared palette and soft, bright lighting. Robot +X points up in the image.

The three robot sprites use the published rover meshes. Props are generic original geometry, with no logos or text. Flags are flat map symbols so their colours and shape remain readable from above. Floor tiles retain transparent margins; the grid should draw a base colour underneath to avoid gaps.

`preview_sheet.png` is a review sheet, not a game sprite. Each editable source has its own `.blend`; backup files are excluded from commits. Generation and checks are documented in `assets/blender/parts/README.md`.
