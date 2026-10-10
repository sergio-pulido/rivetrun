# [GAME] handover — 3D run view, HUD, controls, sound, telemetry (apps/web/src/game)

Written Sat 06:40 for the 16:15 demo. Everything below was checked in headless Chromium with software
rendering unless it says otherwise. Nothing was seen on a real phone or heard through a speaker.

## Built tonight (commit)
- Robots ride the sim's solid ground: obstacle footprints, nose at sim x, both axles on what is drawn (c00352d).
- Decision chips, sensor-range band on the lane, BLIND marker and blind-hit chip (11cb310); slow-mo removed (991731e).
- Telemetry drawer: live sensor values, "no sensor" rows, Jev's thread on the ghost's clock (42689c5).
- Drive controls v3: throttle and brake sliders with a thumb gauge, speedometer pedal, hazard warning with safe speed, scan pads and ring (7947a69).
- Weather: night with headlights, fog, rain, snow, wind streaks that follow gusts, HUD weather chip (86692f3, 8b62be1, 9c045df).
- Air chip, landing grades, hold-to-charge jump (927f411, ee76275); stuck prompt "STUCK IN 4 s · TAP CLIMB" (537c721, ddd9c33).
- Sounds for landings, jump, scans, blocked, gusts, speed warning (d9b2630); offline test of all 20 effects (3432d00).
- Landscape layouts for a phone on its side and a laptop (4cf21fa, 031c23f); camera fly-in at the start (e661a55).
- Low tier without the shadow pass: 130–141 draw calls on M1–M9 (765e19f).
- Failure panels with RELOAD and HOME when the 3D view is lost or unavailable (01ee215, a53ec0f).
- For other pages: RunAlerts for the race phone (a69a7c9), RobotGlyph and colours for Lab Missions (8d924d6), DecisionChips and the attract loop for /screen.
- "What Jev is told" line on the Brain sheet (a62696a). MK-II loader reads meshopt files (51ff71a).
- Driver alerts from the first-timer pass: rough ground with its entry speed, water ahead, "cannot scan" with the reason, "not on the pad" (692314b, d2222d4).

## Simplified or assumed
- The robot is drawn about 6× its real size on a track drawn 1:1; jump heights are drawn 2×. Obstacles use the 6× scale.
- Obstacle shapes (block, round log, rock mound) are mine, inside the sim's footprint and height; the sim's own profile is a triangle.
- The MK-II kit is the robot everywhere since 10:50 (`MK2_DEFAULT` in robot/mk2/flag.ts; `'workshop'` limits it to the Workshop). Ghosts stay procedural; so does any device where the kit fails or takes over 8 s. `?robot=procedural` overrides.
- The sensor band shows the longest forward range only; it does not say which sensor reaches that far in bad weather.
- Sounds are synthesised; the decision chirp is deliberately quiet (half volume, on request).
- Wind, rain and snow are visual only here; what they do to the robot is the sim's.

## Nobody has verified
- Frame rate on a real phone on any mission (`?fps=1` shows last and worst second). The 50 fps MK-II gate was never run.
- Any sound by ear. Haptics. Touch with two real thumbs (only mouse and keyboard were scripted).
- The MK-II drawn on screen with the meshopt files (headless always hits the 3 s limit); the modules decode in Node.
- CRASH LANDING, the other stuck prompts (EASE OFF, HOLD WINCH, CANNOT PASS), "BLOCKED BY ROCK" on a real build
  (no catalog build can be blocked: lowest clearance 6 cm, tallest obstacle 5 cm).
- The fly-in and wind streaks as motion (stills and numbers only). A lost WebGL context coming back by itself.
- Result pages for battery and timeout DNFs; /screen with a board of 1–6 real rows above the attract loop.
- Three driver alerts stacked at once (two were seen); the water alert on a build with a moisture probe.

## M7 Earthquake Rescue: backdrop and prop kit (`game/run/rescue/`)
- Art is the Blender delivery in `apps/web/public/env/m7/` (three WebP layers, eleven GLB props). Its manifest
  `docs/inputs/m7-env.json` is not served by the app: file names, parallax factors, depths and prop envelopes are
  copied into `rescue/kit.ts`. A renamed file or a new prop means editing that table.
- Backdrop (`CityLayers`): far, mid, near pictures behind the track, each passing at its own speed, mirrored at the
  seam, top edge faded. Loaded only after the scene has drawn its first frames, then faded in over the dusk sky.
  If a picture is missing the old ridges are drawn. Phones and the low tier take the pictures at half size.
- Props (`placement.ts`, tested in `placement.test.ts`): placed from the sim's track, never in a lane, over a hole
  or in an obstacle. Beacons at both ends of each scan zone, a slab lying on each ramp and deck, rubble on rough
  ground, tape across a hole where both posts find level ground, a work light after each hole, a barrier after the
  drop, walls at intervals. One draw call per kind of prop; only instances near the camera are submitted.
  If no prop file loads, the procedural slabs, walls and cordons (`RescueDressing`) are drawn instead.
- Dusk light and haze: `rescue/dusk.ts`. Dust motes and halos only at full quality.
- `?quality=low` (and weak devices): no near layer, no dust, no halos, no shadows, fewer props.
- Measured in headless Chromium at 390×844, MK-II, drive mode: 119–148 draw calls and 54–86 k triangles at full
  quality depending on the stretch, 82 calls and 34 k triangles at low. Frame rate on a real phone: not measured.

## If this breaks at the demo
1. A phone shows a drafting-sheet background and "3D VIEW UNAVAILABLE" or "3D VIEW PAUSED".
   The run still works by the gauges. Tap RELOAD; if it repeats, use the low tier (next point: no shadows,
   fewer particles, pixel ratio 1). On the big screen the replay retries by itself every 20 s.
2. The run stutters on an older phone. Load any page with `?quality=low` in the address (a real page load, e.g.
   `/?quality=low`); the low tier then holds in that tab until it is reloaded without it. Phones with 4 cores or
   fewer get it by themselves. `?fps=1` shows the frame rate; `?fps=0` hides it again.
3. A visitor holds the throttle and sits in the mud on M5. The prompt in the middle of the screen says what to tap
   (CLIMB, the round button); it appears about 2 s after the wheels stop making progress and the run ends 6 s later.
   If the prompt is missing the build has nothing that frees it: RETRY from the result and fit off-road wheels or tracks.
Also useful: no sound until the first tap (browser rule) and the speaker button under the top bar mutes;
the jump is hold-to-charge, a quick tap is a 40 % jump; `?robot=procedural` puts a device on the old robot, `?robot=default` undoes that.

## Dev handles (not in production builds)
`window.__rivetrun.state()` live SimState · `.pin({ x, v: 0 })` hold the drawn robot · `?weather=night,snow,wind:8` draw any weather.
