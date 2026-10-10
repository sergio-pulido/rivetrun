# RivetRun — Brain benchmark

Generated 2026-10-10T02:22:09.394Z by `packages/brain/scripts/benchmark.ts`. Every number below is measured from headless runs of the game sim; nothing is estimated.

## Setup
- Missions: M1, M2, M3, M4, M5, M6, M7, M8, M9 · Builds: speedster, mud_crawler, all_rounder, deep_diver, scout · Seeds per mission × build: 3 (1001, 1002, 1003)
- Rows: Jev (no briefing), Jev + Daredevil, Jev + Careful, Jev + Eco, Heuristic, Random · Player priority: 0.5 (balanced)
- Total runs: 810 · Total decisions: 14135 · Wall time: 443 s
- Mean time counts finished runs only; damage, energy and score count every run (DNF included).
- M5 always runs on its fixed seed (20261010), so its 3 seeds repeat the same world; only the random policy's own draws differ.
- Briefings ("Brief the brain") are sent to Jev with every question: Daredevil = "Speed is everything. Take risks." · Careful = "Never risk damage. Slow is fine." · Eco = "Save battery. Smooth and steady.". The heuristic and random policies never read a briefing.

## Jev
- Pinned model id: `jev-1.13.0` · Model id reported by the API: `jev-1.13.0`
- Decisions asked: 10101 · answered by Jev: 10096 · heuristic fallbacks (error or > 1200 ms): 5
- Jev latency, answered calls: p50 243 ms · p95 302 ms · max 1063 ms
- Calls were made 6 runs at a time, one call per decision, no cache, 1200 ms timeout as in the game.

## Overall, per policy and briefing
| Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - |
| Jev (no briefing) | 135 | 62 % | 43.6 | 22.6 | 30.2 | 433 |
| Jev + Daredevil | 135 | 62 % | 41.5 | 25.0 | 31.6 | 419 |
| Jev + Careful | 135 | 61 % | 69.9 | 16.8 | 26.9 | 395 |
| Jev + Eco | 135 | 63 % | 52.8 | 17.8 | 24.7 | 436 |
| Heuristic | 135 | 64 % | 42.1 | 19.3 | 30.1 | 441 |
| Random | 135 | 10 % | 67.8 | 4.8 | 13.4 | 93 |

## Per mission
| Mission | Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - | - |
| M1 Garage Test | Jev (no briefing) | 15 | 100 % | 29.4 | 1.6 | 14.8 | 803 |
| M1 Garage Test | Jev + Daredevil | 15 | 100 % | 30.2 | 4.2 | 15.2 | 784 |
| M1 Garage Test | Jev + Careful | 15 | 100 % | 45.4 | 0.2 | 12.6 | 754 |
| M1 Garage Test | Jev + Eco | 15 | 100 % | 34.8 | 0.7 | 11.9 | 793 |
| M1 Garage Test | Heuristic | 15 | 100 % | 26.0 | 1.6 | 15.1 | 828 |
| M1 Garage Test | Random | 15 | 27 % | 54.5 | 0.7 | 9.5 | 220 |
| M2 Beach Run | Jev (no briefing) | 15 | 100 % | 25.6 | 3.7 | 23.8 | 788 |
| M2 Beach Run | Jev + Daredevil | 15 | 100 % | 24.9 | 3.4 | 24.0 | 792 |
| M2 Beach Run | Jev + Careful | 15 | 100 % | 48.4 | 6.5 | 20.9 | 686 |
| M2 Beach Run | Jev + Eco | 15 | 100 % | 34.6 | 4.7 | 18.8 | 755 |
| M2 Beach Run | Heuristic | 15 | 100 % | 25.6 | 3.4 | 23.9 | 789 |
| M2 Beach Run | Random | 15 | 20 % | 54.0 | 2.4 | 16.1 | 171 |
| M3 Mud Run | Jev (no briefing) | 15 | 60 % | 56.7 | 12.4 | 30.4 | 352 |
| M3 Mud Run | Jev + Daredevil | 15 | 60 % | 55.9 | 13.5 | 30.9 | 347 |
| M3 Mud Run | Jev + Careful | 15 | 60 % | 73.1 | 5.5 | 26.0 | 358 |
| M3 Mud Run | Jev + Eco | 15 | 60 % | 59.9 | 6.7 | 26.1 | 381 |
| M3 Mud Run | Heuristic | 15 | 60 % | 51.6 | 11.6 | 29.8 | 375 |
| M3 Mud Run | Random | 15 | 13 % | 75.7 | 1.3 | 9.1 | 91 |
| M4 Frozen Pass | Jev (no briefing) | 15 | 87 % | 38.7 | 35.1 | 30.6 | 541 |
| M4 Frozen Pass | Jev + Daredevil | 15 | 87 % | 31.4 | 40.9 | 30.5 | 481 |
| M4 Frozen Pass | Jev + Careful | 15 | 87 % | 66.7 | 11.1 | 31.9 | 544 |
| M4 Frozen Pass | Jev + Eco | 15 | 100 % | 46.2 | 18.9 | 29.3 | 603 |
| M4 Frozen Pass | Heuristic | 15 | 100 % | 37.9 | 29.4 | 31.9 | 568 |
| M4 Frozen Pass | Random | 15 | 13 % | 67.5 | 0.5 | 15.0 | 115 |
| M5 Room Challenge | Jev (no briefing) | 15 | 60 % | 44.4 | 15.6 | 37.1 | 385 |
| M5 Room Challenge | Jev + Daredevil | 15 | 60 % | 42.0 | 17.0 | 41.3 | 380 |
| M5 Room Challenge | Jev + Careful | 15 | 60 % | 78.3 | 10.0 | 31.2 | 348 |
| M5 Room Challenge | Jev + Eco | 15 | 60 % | 54.8 | 9.5 | 27.3 | 403 |
| M5 Room Challenge | Heuristic | 15 | 60 % | 45.0 | 14.6 | 32.1 | 387 |
| M5 Room Challenge | Random | 15 | 0 % | — | 2.7 | 13.4 | 44 |
| M6 Deep Water | Jev (no briefing) | 15 | 20 % | 95.5 | 69.6 | 12.9 | 134 |
| M6 Deep Water | Jev + Daredevil | 15 | 20 % | 87.7 | 71.9 | 13.2 | 126 |
| M6 Deep Water | Jev + Careful | 15 | 20 % | 145.6 | 67.0 | 12.4 | 92 |
| M6 Deep Water | Jev + Eco | 15 | 20 % | 132.5 | 66.8 | 11.4 | 107 |
| M6 Deep Water | Heuristic | 15 | 20 % | 94.3 | 72.3 | 14.4 | 118 |
| M6 Deep Water | Random | 15 | 0 % | — | 22.5 | 7.8 | 35 |
| M7 Earthquake Rescue | Jev (no briefing) | 15 | 0 % | — | 40.6 | 14.5 | 97 |
| M7 Earthquake Rescue | Jev + Daredevil | 15 | 0 % | — | 40.9 | 15.0 | 96 |
| M7 Earthquake Rescue | Jev + Careful | 15 | 0 % | — | 40.0 | 9.4 | 56 |
| M7 Earthquake Rescue | Jev + Eco | 15 | 0 % | — | 42.3 | 10.6 | 67 |
| M7 Earthquake Rescue | Heuristic | 15 | 0 % | — | 17.1 | 16.1 | 97 |
| M7 Earthquake Rescue | Random | 15 | 0 % | — | 10.0 | 4.3 | 20 |
| M8 Storm Ridge | Jev (no briefing) | 15 | 67 % | 52.2 | 18.6 | 48.0 | 402 |
| M8 Storm Ridge | Jev + Daredevil | 15 | 67 % | 52.1 | 24.6 | 52.2 | 367 |
| M8 Storm Ridge | Jev + Careful | 15 | 60 % | 70.5 | 10.5 | 43.9 | 403 |
| M8 Storm Ridge | Jev + Eco | 15 | 60 % | 62.8 | 8.6 | 35.7 | 417 |
| M8 Storm Ridge | Heuristic | 15 | 67 % | 52.4 | 17.7 | 47.8 | 409 |
| M8 Storm Ridge | Random | 15 | 0 % | — | 2.7 | 20.5 | 46 |
| M9 Polar Night | Jev (no briefing) | 15 | 67 % | 61.8 | 6.1 | 60.0 | 399 |
| M9 Polar Night | Jev + Daredevil | 15 | 67 % | 58.7 | 8.3 | 62.2 | 394 |
| M9 Polar Night | Jev + Careful | 15 | 67 % | 109.1 | 0.3 | 53.6 | 319 |
| M9 Polar Night | Jev + Eco | 15 | 67 % | 76.0 | 2.2 | 51.7 | 395 |
| M9 Polar Night | Heuristic | 15 | 67 % | 60.1 | 6.0 | 59.9 | 400 |
| M9 Polar Night | Random | 15 | 13 % | 107.4 | 0.2 | 25.1 | 96 |

## Per build
| Build | Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - | - |
| Speedster | Jev (no briefing) | 27 | 30 % | 25.9 | 28.9 | 53.6 | 288 |
| Speedster | Jev + Daredevil | 27 | 30 % | 24.8 | 26.0 | 54.5 | 283 |
| Speedster | Jev + Careful | 27 | 26 % | 39.0 | 25.1 | 51.4 | 253 |
| Speedster | Jev + Eco | 27 | 33 % | 34.2 | 21.2 | 44.9 | 305 |
| Speedster | Heuristic | 27 | 37 % | 24.7 | 21.7 | 49.7 | 305 |
| Speedster | Random | 27 | 7 % | 49.0 | 5.8 | 26.7 | 76 |
| Mud Crawler | Jev (no briefing) | 27 | 78 % | 37.9 | 36.9 | 22.0 | 446 |
| Mud Crawler | Jev + Daredevil | 27 | 78 % | 38.1 | 36.9 | 22.3 | 445 |
| Mud Crawler | Jev + Careful | 27 | 78 % | 82.4 | 10.0 | 15.7 | 458 |
| Mud Crawler | Jev + Eco | 27 | 78 % | 50.3 | 14.6 | 15.9 | 532 |
| Mud Crawler | Heuristic | 27 | 78 % | 37.8 | 37.0 | 22.1 | 446 |
| Mud Crawler | Random | 27 | 37 % | 72.7 | 5.3 | 12.7 | 251 |
| All-rounder | Jev (no briefing) | 27 | 78 % | 46.9 | 21.4 | 23.7 | 541 |
| All-rounder | Jev + Daredevil | 27 | 78 % | 43.1 | 27.4 | 24.9 | 516 |
| All-rounder | Jev + Careful | 27 | 78 % | 66.8 | 23.8 | 19.8 | 468 |
| All-rounder | Jev + Eco | 27 | 78 % | 52.6 | 23.4 | 19.6 | 512 |
| All-rounder | Heuristic | 27 | 78 % | 41.7 | 14.9 | 24.9 | 569 |
| All-rounder | Random | 27 | 0 % | — | 4.5 | 8.0 | 37 |
| Deep Diver | Jev (no briefing) | 27 | 48 % | 53.7 | 7.3 | 24.1 | 367 |
| Deep Diver | Jev + Daredevil | 27 | 48 % | 49.9 | 12.2 | 28.4 | 348 |
| Deep Diver | Jev + Careful | 27 | 48 % | 83.4 | 6.4 | 20.6 | 314 |
| Deep Diver | Jev + Eco | 27 | 48 % | 68.0 | 10.2 | 18.2 | 317 |
| Deep Diver | Heuristic | 27 | 48 % | 51.5 | 6.8 | 22.6 | 364 |
| Deep Diver | Random | 27 | 0 % | — | 1.3 | 7.9 | 36 |
| Scout | Jev (no briefing) | 27 | 78 % | 46.6 | 18.3 | 27.7 | 526 |
| Scout | Jev + Daredevil | 27 | 78 % | 44.4 | 22.4 | 28.1 | 500 |
| Scout | Jev + Careful | 27 | 78 % | 62.3 | 18.6 | 26.8 | 485 |
| Scout | Jev + Eco | 27 | 78 % | 54.1 | 19.7 | 25.1 | 513 |
| Scout | Heuristic | 27 | 78 % | 49.2 | 16.1 | 31.2 | 523 |
| Scout | Random | 27 | 4 % | 56.5 | 6.9 | 11.9 | 66 |

## Specialist builds on their mission
| Mission · build | Policy | Runs | Finish rate | Mean time s (finished) | Mean damage % | Mean energy % | Mean score |
| - | - | - | - | - | - | - | - |
| M6 · Deep Diver | Jev (no briefing) | 3 | 100 % | 95.5 | 2.7 | 28.5 | 498 |
| M6 · Deep Diver | Jev + Daredevil | 3 | 100 % | 87.7 | 14.4 | 29.6 | 457 |
| M6 · Deep Diver | Jev + Careful | 3 | 100 % | 145.6 | 5.5 | 24.0 | 290 |
| M6 · Deep Diver | Jev + Eco | 3 | 100 % | 132.5 | 2.0 | 22.9 | 365 |
| M6 · Deep Diver | Heuristic | 3 | 100 % | 94.3 | 16.2 | 30.6 | 418 |
| M6 · Deep Diver | Random | 3 | 0 % | — | 7.1 | 11.6 | 73 |
| M4 · Scout | Jev (no briefing) | 3 | 100 % | 38.9 | 6.4 | 24.3 | 711 |
| M4 · Scout | Jev + Daredevil | 3 | 100 % | 29.0 | 24.1 | 21.5 | 650 |
| M4 · Scout | Jev + Careful | 3 | 100 % | 54.4 | 4.5 | 21.8 | 666 |
| M4 · Scout | Jev + Eco | 3 | 100 % | 47.2 | 3.7 | 20.4 | 702 |
| M4 · Scout | Heuristic | 3 | 100 % | 45.3 | 0.0 | 31.0 | 711 |
| M4 · Scout | Random | 3 | 0 % | — | 0.0 | 10.5 | 44 |
| M4 · All-rounder | Jev (no briefing) | 3 | 100 % | 40.5 | 6.4 | 19.1 | 720 |
| M4 · All-rounder | Jev + Daredevil | 3 | 100 % | 27.9 | 33.8 | 19.2 | 606 |
| M4 · All-rounder | Jev + Careful | 3 | 100 % | 60.4 | 13.1 | 18.6 | 602 |
| M4 · All-rounder | Jev + Eco | 3 | 100 % | 45.4 | 21.7 | 17.2 | 613 |
| M4 · All-rounder | Heuristic | 3 | 100 % | 38.5 | 1.9 | 24.2 | 745 |
| M4 · All-rounder | Random | 3 | 0 % | — | 0.0 | 7.2 | 35 |

Scout = All-rounder with the Scout drone instead of the camera; the sim then simulates each option further ahead and Jev is told the longer window.
