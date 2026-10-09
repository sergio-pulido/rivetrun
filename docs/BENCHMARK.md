# RivetRun — Brain benchmark

Generated 2026-10-09T19:09:29.374Z by `packages/brain/scripts/benchmark.ts`. Every number below is measured from headless runs of the game sim; nothing is estimated.

## Setup
- Missions: M1, M2, M3, M4, M5 · Presets: speedster, mud_crawler, all_rounder · Seeds per mission × preset: 3 (1001, 1002, 1003)
- Policies: Jev, Heuristic, Random · Player priority: 0.5 (balanced)
- Total runs: 135 · Total decisions: 3092 · Wall time: 58 s
- Mean time counts finished runs only; damage, energy and score count every run (DNF included).
- M5 always runs on its fixed seed (20261010), so its 3 seeds repeat the same world; only the random policy's own draws differ.

## Jev
- Pinned model id: `jev-1.13.0` · Model id reported by the API: `jev-1.13.0`
- Decisions asked: 844 · answered by Jev: 844 · heuristic fallbacks (error or > 1200 ms): 0
- Jev latency, answered calls: p50 376 ms · p95 479 ms · max 816 ms
- Calls were made 6 runs at a time, one call per decision, no cache, 1200 ms timeout as in the game.

## Overall, per policy
| Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - |
| Jev | 45 | 73 % | 27.4 | 11.0 | 10.1 | 563 |
| Heuristic | 45 | 73 % | 27.8 | 10.7 | 9.8 | 564 |
| Random | 45 | 33 % | 55.3 | 6.9 | 14.2 | 264 |

## Per mission
| Mission | Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - | - |
| M1 Garage Test | Jev | 9 | 100 % | 18.6 | 3.8 | 4.8 | 858 |
| M1 Garage Test | Heuristic | 9 | 100 % | 19.3 | 3.1 | 5.0 | 859 |
| M1 Garage Test | Random | 9 | 67 % | 43.2 | 2.4 | 11.2 | 536 |
| M2 Beach Run | Jev | 9 | 100 % | 22.6 | 3.5 | 7.0 | 839 |
| M2 Beach Run | Heuristic | 9 | 100 % | 22.6 | 3.5 | 7.0 | 839 |
| M2 Beach Run | Random | 9 | 44 % | 50.6 | 8.7 | 16.0 | 367 |
| M3 Mud Run | Jev | 9 | 67 % | 36.7 | 13.8 | 14.9 | 457 |
| M3 Mud Run | Heuristic | 9 | 67 % | 37.5 | 13.7 | 14.2 | 456 |
| M3 Mud Run | Random | 9 | 33 % | 73.2 | 6.5 | 15.2 | 208 |
| M4 Frozen Pass | Jev | 9 | 33 % | 25.7 | 17.0 | 10.4 | 199 |
| M4 Frozen Pass | Heuristic | 9 | 33 % | 25.7 | 17.0 | 10.4 | 199 |
| M4 Frozen Pass | Random | 9 | 11 % | 60.8 | 4.3 | 10.0 | 81 |
| M5 Room Challenge | Jev | 9 | 67 % | 39.6 | 16.8 | 13.2 | 464 |
| M5 Room Challenge | Heuristic | 9 | 67 % | 39.8 | 16.1 | 12.5 | 467 |
| M5 Room Challenge | Random | 9 | 11 % | 88.0 | 12.5 | 18.5 | 127 |

## Per preset
| Preset | Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - | - |
| Speedster | Jev | 15 | 40 % | 15.7 | 3.2 | 11.8 | 389 |
| Speedster | Heuristic | 15 | 40 % | 16.4 | 3.1 | 11.0 | 388 |
| Speedster | Random | 15 | 27 % | 37.9 | 8.6 | 16.8 | 244 |
| Mud Crawler | Jev | 15 | 100 % | 26.4 | 22.2 | 6.9 | 703 |
| Mud Crawler | Heuristic | 15 | 100 % | 26.4 | 22.2 | 6.9 | 703 |
| Mud Crawler | Random | 15 | 47 % | 60.7 | 4.2 | 13.4 | 339 |
| All-rounder | Jev | 15 | 80 % | 34.7 | 7.5 | 11.5 | 598 |
| All-rounder | Heuristic | 15 | 80 % | 35.3 | 6.7 | 11.6 | 601 |
| All-rounder | Random | 15 | 27 % | 63.2 | 7.8 | 12.4 | 208 |
