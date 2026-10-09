# RivetRun — Brain benchmark

Generated 2026-10-09T20:36:09.656Z by `packages/brain/scripts/benchmark.ts`. Every number below is measured from headless runs of the game sim; nothing is estimated.

## Setup
- Missions: M1, M2, M3, M4, M5, M6 · Builds: speedster, mud_crawler, all_rounder, deep_diver, scout · Seeds per mission × build: 3 (1001, 1002, 1003)
- Rows: Jev (no briefing), Jev + Daredevil, Jev + Careful, Jev + Eco, Heuristic, Random · Player priority: 0.5 (balanced)
- Total runs: 540 · Total decisions: 15081 · Wall time: 514 s
- Mean time counts finished runs only; damage, energy and score count every run (DNF included).
- M5 always runs on its fixed seed (20261010), so its 3 seeds repeat the same world; only the random policy's own draws differ.
- Briefings ("Brief the brain") are sent to Jev with every question: Daredevil = "Speed is everything. Take risks." · Careful = "Never risk damage. Slow is fine." · Eco = "Save battery. Smooth and steady.". The heuristic and random policies never read a briefing.

## Jev
- Pinned model id: `jev-1.13.0` · Model id reported by the API: `jev-1.13.0`
- Decisions asked: 10147 · answered by Jev: 10078 · heuristic fallbacks (error or > 1200 ms): 69
- Jev latency, answered calls: p50 339 ms · p95 671 ms · max 1168 ms
- Calls were made 8 runs at a time, one call per decision, no cache, 1200 ms timeout as in the game.

## Overall, per policy and briefing
| Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - |
| Jev (no briefing) | 90 | 68 % | 31.1 | 23.8 | 9.9 | 485 |
| Jev + Daredevil | 90 | 72 % | 31.3 | 30.3 | 10.2 | 498 |
| Jev + Careful | 90 | 62 % | 63.4 | 12.2 | 18.0 | 413 |
| Jev + Eco | 90 | 71 % | 44.2 | 19.9 | 13.0 | 499 |
| Heuristic | 90 | 73 % | 32.9 | 26.6 | 10.3 | 516 |
| Random | 90 | 26 % | 54.9 | 14.8 | 13.8 | 218 |

## Per mission
| Mission | Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - | - |
| M1 Garage Test | Jev (no briefing) | 15 | 100 % | 19.6 | 2.9 | 5.0 | 854 |
| M1 Garage Test | Jev + Daredevil | 15 | 100 % | 19.3 | 5.0 | 4.9 | 843 |
| M1 Garage Test | Jev + Careful | 15 | 100 % | 44.0 | 1.1 | 10.9 | 756 |
| M1 Garage Test | Jev + Eco | 15 | 100 % | 27.3 | 2.0 | 6.8 | 825 |
| M1 Garage Test | Heuristic | 15 | 100 % | 20.5 | 1.9 | 5.2 | 857 |
| M1 Garage Test | Random | 15 | 67 % | 45.3 | 1.9 | 11.4 | 528 |
| M2 Beach Run | Jev (no briefing) | 15 | 87 % | 23.8 | 2.5 | 7.1 | 734 |
| M2 Beach Run | Jev + Daredevil | 15 | 100 % | 23.9 | 3.4 | 7.5 | 829 |
| M2 Beach Run | Jev + Careful | 15 | 80 % | 61.1 | 4.9 | 16.8 | 533 |
| M2 Beach Run | Jev + Eco | 15 | 100 % | 34.8 | 4.8 | 11.1 | 770 |
| M2 Beach Run | Heuristic | 15 | 100 % | 26.0 | 3.4 | 8.0 | 820 |
| M2 Beach Run | Random | 15 | 33 % | 51.8 | 7.1 | 16.6 | 306 |
| M3 Mud Run | Jev (no briefing) | 15 | 60 % | 43.5 | 19.5 | 17.6 | 349 |
| M3 Mud Run | Jev + Daredevil | 15 | 60 % | 42.9 | 24.3 | 17.4 | 322 |
| M3 Mud Run | Jev + Careful | 15 | 60 % | 72.9 | 8.4 | 22.8 | 334 |
| M3 Mud Run | Jev + Eco | 15 | 60 % | 52.9 | 11.3 | 18.4 | 371 |
| M3 Mud Run | Heuristic | 15 | 60 % | 44.1 | 18.7 | 17.2 | 352 |
| M3 Mud Run | Random | 15 | 20 % | 73.3 | 5.5 | 14.5 | 144 |
| M4 Frozen Pass | Jev (no briefing) | 15 | 100 % | 29.2 | 47.4 | 10.5 | 537 |
| M4 Frozen Pass | Jev + Daredevil | 15 | 93 % | 29.4 | 57.3 | 10.2 | 472 |
| M4 Frozen Pass | Jev + Careful | 15 | 93 % | 70.6 | 8.1 | 24.6 | 542 |
| M4 Frozen Pass | Jev + Eco | 15 | 87 % | 43.6 | 22.0 | 15.8 | 531 |
| M4 Frozen Pass | Heuristic | 15 | 100 % | 29.4 | 47.6 | 10.6 | 536 |
| M4 Frozen Pass | Random | 15 | 27 % | 60.6 | 6.5 | 13.7 | 176 |
| M5 Room Challenge | Jev (no briefing) | 15 | 40 % | 39.6 | 14.3 | 11.2 | 285 |
| M5 Room Challenge | Jev + Daredevil | 15 | 60 % | 40.4 | 20.8 | 13.5 | 382 |
| M5 Room Challenge | Jev + Careful | 15 | 40 % | 85.5 | 8.1 | 20.2 | 247 |
| M5 Room Challenge | Jev + Eco | 15 | 60 % | 57.3 | 14.1 | 16.2 | 380 |
| M5 Room Challenge | Heuristic | 15 | 60 % | 44.8 | 16.2 | 12.9 | 398 |
| M5 Room Challenge | Random | 15 | 7 % | 88.0 | 10.4 | 18.2 | 108 |
| M6 Deep Water | Jev (no briefing) | 15 | 20 % | 75.3 | 56.1 | 8.1 | 150 |
| M6 Deep Water | Jev + Daredevil | 15 | 20 % | 74.5 | 71.2 | 7.8 | 140 |
| M6 Deep Water | Jev + Careful | 15 | 0 % | — | 42.6 | 12.4 | 64 |
| M6 Deep Water | Jev + Eco | 15 | 20 % | 112.9 | 65.0 | 10.0 | 118 |
| M6 Deep Water | Heuristic | 15 | 20 % | 78.4 | 71.7 | 8.0 | 134 |
| M6 Deep Water | Random | 15 | 0 % | — | 57.3 | 8.4 | 44 |

## Per build
| Build | Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - | - |
| Speedster | Jev (no briefing) | 18 | 50 % | 17.2 | 27.9 | 10.4 | 420 |
| Speedster | Jev + Daredevil | 18 | 44 % | 16.9 | 29.9 | 10.2 | 401 |
| Speedster | Jev + Careful | 18 | 44 % | 45.3 | 22.6 | 20.1 | 351 |
| Speedster | Jev + Eco | 18 | 44 % | 23.9 | 30.3 | 12.8 | 348 |
| Speedster | Heuristic | 18 | 50 % | 18.0 | 27.6 | 10.1 | 420 |
| Speedster | Random | 18 | 22 % | 37.9 | 23.8 | 16.7 | 210 |
| Mud Crawler | Jev (no briefing) | 18 | 83 % | 26.7 | 36.8 | 6.3 | 524 |
| Mud Crawler | Jev + Daredevil | 18 | 83 % | 26.7 | 36.8 | 6.3 | 524 |
| Mud Crawler | Jev + Careful | 18 | 83 % | 66.3 | 4.3 | 15.2 | 536 |
| Mud Crawler | Jev + Eco | 18 | 83 % | 37.2 | 18.1 | 8.6 | 576 |
| Mud Crawler | Heuristic | 18 | 83 % | 26.7 | 36.8 | 6.1 | 524 |
| Mud Crawler | Random | 18 | 44 % | 62.1 | 8.4 | 12.9 | 315 |
| All-rounder | Jev (no briefing) | 18 | 83 % | 33.3 | 32.5 | 10.2 | 581 |
| All-rounder | Jev + Daredevil | 18 | 83 % | 33.0 | 40.0 | 10.0 | 537 |
| All-rounder | Jev + Careful | 18 | 83 % | 66.8 | 28.8 | 17.0 | 479 |
| All-rounder | Jev + Eco | 18 | 83 % | 45.5 | 25.2 | 13.0 | 579 |
| All-rounder | Heuristic | 18 | 83 % | 33.8 | 31.7 | 10.2 | 584 |
| All-rounder | Random | 18 | 28 % | 61.7 | 18.1 | 12.1 | 216 |
| Deep Diver | Jev (no briefing) | 18 | 67 % | 38.1 | 9.7 | 9.8 | 485 |
| Deep Diver | Jev + Daredevil | 18 | 67 % | 37.6 | 13.4 | 9.7 | 465 |
| Deep Diver | Jev + Careful | 18 | 50 % | 72.8 | 2.0 | 19.8 | 353 |
| Deep Diver | Jev + Eco | 18 | 61 % | 60.4 | 1.5 | 12.4 | 433 |
| Deep Diver | Heuristic | 18 | 67 % | 39.4 | 13.9 | 8.6 | 457 |
| Deep Diver | Random | 18 | 11 % | 49.3 | 4.7 | 11.4 | 145 |
| Scout | Jev (no briefing) | 18 | 56 % | 38.7 | 11.9 | 13.0 | 414 |
| Scout | Jev + Daredevil | 18 | 83 % | 36.8 | 31.5 | 14.8 | 563 |
| Scout | Jev + Careful | 18 | 50 % | 59.7 | 3.3 | 17.7 | 346 |
| Scout | Jev + Eco | 18 | 83 % | 48.9 | 24.3 | 18.4 | 560 |
| Scout | Heuristic | 18 | 83 % | 42.0 | 22.8 | 16.6 | 595 |
| Scout | Random | 18 | 22 % | 51.9 | 18.8 | 15.9 | 203 |

## Specialist builds on their mission
| Mission · build | Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - | - |
| M6 · Deep Diver | Jev (no briefing) | 3 | 100 % | 75.3 | 5.1 | 20.0 | 581 |
| M6 · Deep Diver | Jev + Daredevil | 3 | 100 % | 74.5 | 14.8 | 19.9 | 526 |
| M6 · Deep Diver | Jev + Careful | 3 | 0 % | — | 5.7 | 32.4 | 157 |
| M6 · Deep Diver | Jev + Eco | 3 | 100 % | 112.9 | 5.1 | 26.0 | 419 |
| M6 · Deep Diver | Heuristic | 3 | 100 % | 78.4 | 17.0 | 20.2 | 497 |
| M6 · Deep Diver | Random | 3 | 0 % | — | 27.0 | 10.7 | 61 |
| M4 · Scout | Jev (no briefing) | 3 | 100 % | 42.8 | 13.4 | 18.1 | 666 |
| M4 · Scout | Jev + Daredevil | 3 | 100 % | 40.6 | 20.1 | 17.0 | 637 |
| M4 · Scout | Jev + Careful | 3 | 100 % | 63.5 | 1.5 | 25.1 | 641 |
| M4 · Scout | Jev + Eco | 3 | 100 % | 54.3 | 1.5 | 21.5 | 685 |
| M4 · Scout | Heuristic | 3 | 100 % | 41.8 | 1.6 | 18.0 | 741 |
| M4 · Scout | Random | 3 | 33 % | 55.3 | 5.0 | 13.4 | 224 |
| M4 · All-rounder | Jev (no briefing) | 3 | 100 % | 27.2 | 37.2 | 7.4 | 612 |
| M4 · All-rounder | Jev + Daredevil | 3 | 100 % | 27.2 | 62.6 | 7.3 | 460 |
| M4 · All-rounder | Jev + Careful | 3 | 100 % | 67.0 | 16.0 | 17.4 | 560 |
| M4 · All-rounder | Jev + Eco | 3 | 100 % | 40.0 | 6.6 | 10.7 | 738 |
| M4 · All-rounder | Heuristic | 3 | 100 % | 27.3 | 37.0 | 7.4 | 613 |
| M4 · All-rounder | Random | 3 | 33 % | 55.3 | 2.2 | 9.5 | 247 |

Scout = All-rounder with the Scout drone instead of the camera; the sim then simulates each option further ahead and Jev is told the longer window.
