# RivetRun — Mission M6: Deep Water

**Mission ID:** `M6`  
**Name:** Deep Water  
**Difficulty:** Advanced  
**Target duration:** 45–90 seconds  
**Total distance:** 100 m  
**Maximum water depth:** 120 cm  
**Required equipment:** `thruster_kit` + `waterproof_case`

### Mission brief

> Cross the flooded passage using underwater propulsion. Manage energy, avoid submerged obstacles, and reach dry land.

## 1. Mission segments

The course starts on asphalt, descends into a flooded tunnel, crosses three underwater sections, and exits onto rock.

| # | Terrain | Length | Slope | Water depth | Obstacle | Gameplay purpose |
|---|---|---:|---:|---:|---|---|
| 1 | `asphalt` | 12 m | 0° | — | — | Acceleration zone |
| 2 | `rock` | 8 m | -12° | — | Rocky descent | Control entry speed |
| 3 | `water` | 15 m | -5° | 60 cm | — | Transition to underwater propulsion |
| 4 | `water` | 20 m | 0° | 90 cm | Strong current | High-load propulsion |
| 5 | `water` | 15 m | 0° | 120 cm | Submerged debris | Slow down to avoid damage |
| 6 | `water` | 15 m | +8° | 80 cm | — | Energy-intensive ascent |
| 7 | `rock` | 10 m | +12° | — | Exit ledge | Transition to ground locomotion |
| 8 | `asphalt` | 5 m | 0° | — | Finish line | Final sprint |

**Design rule:** All four underwater sections exceed the wading capability of wheels, off-road wheels, and tracks. Neither traction multipliers nor motor torque can overcome this restriction.

The `thruster_kit` provides underwater propulsion. The `waterproof_case` prevents water damage.

Both must be equipped.

---

## 2. New part: `thruster_kit`

**Real-world inspiration:** Dual miniature ducted underwater thrusters, similar in concept to small ROV propulsion systems.

The following values are **gameplay inventions**, not measured specifications of a particular manufacturer's thruster.

| Property | Value |
|---|---|
| ID | `thruster_kit` |
| Name | Dual Thruster Kit |
| Category | `extra` |
| Mass | 0.32 kg |
| Cost | €65 |
| Power | 35 W |
| Underwater speed | 1.8 m/s |
| Required part | `waterproof_case` |
| Extra slots consumed | 1 |
| Propulsion | Two ducted underwater thrusters |

### Budget implications

The original budget remains **€250**.

The combination:

- `thruster_kit`: €65
- `waterproof_case`: €35

Costs **€100 before purchasing any other components**.

This forces players to prioritize underwater capability over expensive motors, batteries, or additional sensors.

For this mission, the default extra-slot capacity of two is fully occupied.

### Energy implications

The 35 W thruster consumption is significant.

At 1.8 m/s, crossing 65 m of underwater terrain takes approximately **36.1 seconds** before current, acceleration and obstacle delays.

Thruster energy alone would consume approximately **0.35 Wh** during that traversal.

That means the existing batteries should comfortably support the crossing unless other gameplay factors significantly increase consumption.

**Balance warning:** Do not claim that the larger battery is essential unless the simulation actually produces meaningful energy constraints. With the existing battery capacities, propulsion and obstacle management are more important.

---

## 3. Expected winners and failures

| Build | Expected result | Reason |
|---|---|---|
| Speedster | **FAIL** | No underwater propulsion or waterproofing |
| Mud Crawler | **FAIL** | Waterproof case, but tracks cannot propel the robot through deep water |
| All-rounder | **FAIL** | Waterproof case, but no thrusters |
| Deep Diver | **WIN** | Thrusters + waterproof case |
| Deep Diver + Jev | **Best candidate** | Can adapt speed to current, debris and exit conditions |
| Deep Diver + Random | **Unreliable** | May waste time, brake unnecessarily or hit submerged obstacles |

The baseline presets are intentionally unable to complete M6 without modification.

That makes `thruster_kit` a meaningful progression unlock rather than an optional performance upgrade.

### Recommended Deep Diver build

| Part | Cost |
|---|---:|
| `wheels` | €12 |
| `motor_torque` | €22 |
| `battery_large` | €39 |
| `ultrasonic` | €9 |
| `waterproof_case` | €35 |
| `thruster_kit` | €65 |
| **Total** | **€182** |

This uses the existing illustrative component prices.

The remaining €68 provides room for additional upgrades if the existing equipment-slot constraints permit them.

**Important:** The ultrasonic sensor is not assumed to function reliably underwater. Its contribution to submerged obstacle detection should be disabled or degraded unless the simulation explicitly implements an underwater-capable substitute.

---

## 4. Three AI decision moments

Only existing actions are used.

| Moment | Situation | Recommended action | Consequence |
|---|---|---|---|
| 1. Water entry | Robot approaches 60 cm water at high speed | `slow_down` | Reduces entry impact |
| 2. Submerged debris | Obstacle detected at 120 cm depth | `brake` | Reduces collision damage |
| 3. Underwater ascent | Robot reaches uphill exit with high propulsion load | `climb_mode` | Prioritizes controlled high-load propulsion |

### Underwater action interpretation

No new actions are introduced.

- `cruise`: Maintain normal underwater propulsion.
- `accelerate`: Increase thruster output.
- `slow_down`: Reduce propulsion toward a safer speed.
- `brake`: Rapidly reduce forward motion using thrust control.
- `reverse`: Apply reverse thrust to recover from an obstacle.
- `climb_mode`: Use high-load propulsion with reduced speed.
- `deploy_winch`: Use an installed winch only when a valid anchor exists.

For M6, `climb_mode` is interpreted as a propulsion mode, not as physical wheel climbing while submerged.

---

# 5. Complete mission JSON

```json
{
  "id": "M6",
  "name": "Deep Water",
  "version": "0.1.0",
  "difficulty": "advanced",
  "brief": "Cross the flooded passage using underwater propulsion. Manage energy, avoid submerged obstacles, and reach dry land.",
  "budgetEur": 250,
  "totalLengthM": 100,
  "targetDurationSec": {
    "min": 45,
    "max": 90
  },
  "requiredParts": [
    "thruster_kit",
    "waterproof_case"
  ],
  "segments": [
    {
      "terrain": "asphalt",
      "lengthM": 12,
      "slopeDeg": 0
    },
    {
      "terrain": "rock",
      "lengthM": 8,
      "slopeDeg": -12,
      "obstacle": {
        "type": "rocky_descent",
        "severity": 0.3
      }
    },
    {
      "terrain": "water",
      "lengthM": 15,
      "slopeDeg": -5,
      "depthCm": 60
    },
    {
      "terrain": "water",
      "lengthM": 20,
      "slopeDeg": 0,
      "depthCm": 90,
      "obstacle": {
        "type": "current",
        "severity": 0.65
      }
    },
    {
      "terrain": "water",
      "lengthM": 15,
      "slopeDeg": 0,
      "depthCm": 120,
      "obstacle": {
        "type": "submerged_debris",
        "severity": 0.8
      }
    },
    {
      "terrain": "water",
      "lengthM": 15,
      "slopeDeg": 8,
      "depthCm": 80
    },
    {
      "terrain": "rock",
      "lengthM": 10,
      "slopeDeg": 12,
      "obstacle": {
        "type": "exit_ledge",
        "severity": 0.5
      }
    },
    {
      "terrain": "asphalt",
      "lengthM": 5,
      "slopeDeg": 0
    }
  ],
  "parts": [
    {
      "id": "thruster_kit",
      "name": "Dual Thruster Kit",
      "category": "extra",
      "realClass": "Dual miniature ducted underwater thrusters",
      "massKg": 0.32,
      "costEur": 65,
      "powerW": 35,
      "effects": {
        "underwaterSpeedMs": 1.8,
        "requires": [
          "waterproof_case"
        ]
      }
    }
  ],
  "rules": {
    "deepWaterThresholdCm": 60,
    "maxWadingDepthCm": {
      "wheels": 20,
      "offroad_wheels": 35,
      "tracks": 45
    },
    "deepWaterRequiresThrusters": true,
    "deepWaterRequiresWaterproofCase": true,
    "waterproofCasePreventsWaterDamage": true,
    "thrustersConsumePowerW": 35,
    "underwaterActions": [
      "cruise",
      "accelerate",
      "slow_down",
      "brake",
      "reverse",
      "climb_mode",
      "deploy_winch"
    ],
    "underwaterActionSemantics": {
      "cruise": "Maintain nominal underwater speed.",
      "accelerate": "Increase thruster output.",
      "slow_down": "Reduce forward propulsion.",
      "brake": "Rapidly reduce forward motion.",
      "reverse": "Apply reverse thrust.",
      "climb_mode": "Prioritize high-load propulsion at reduced speed.",
      "deploy_winch": "Deploy only when equipped and an anchor is available."
    }
  },
  "decisionMoments": [
    {
      "id": "M6_D1",
      "positionM": 19,
      "name": "Water Entry",
      "observation": {
        "nextTerrain": "water",
        "lookaheadM": 8,
        "waterDepthCm": 60,
        "entryImpactRisk": 0.55
      },
      "recommendedAction": "slow_down",
      "reason": "Reduce impact before entering deep water."
    },
    {
      "id": "M6_D2",
      "positionM": 51,
      "name": "Submerged Debris",
      "observation": {
        "currentTerrain": "water",
        "waterDepthCm": 120,
        "obstacleType": "submerged_debris",
        "obstacleDistanceM": 4,
        "obstacleSeverity": 0.8
      },
      "recommendedAction": "brake",
      "reason": "Reduce collision energy near submerged debris."
    },
    {
      "id": "M6_D3",
      "positionM": 70,
      "name": "Underwater Ascent",
      "observation": {
        "currentTerrain": "water",
        "waterDepthCm": 80,
        "slopeDeg": 8,
        "propulsionLoad01": 0.85
      },
      "recommendedAction": "climb_mode",
      "reason": "Prioritize controlled high-load propulsion during ascent."
    }
  ],
  "expectedResults": [
    {
      "build": "speedster",
      "expected": "fail",
      "reason": "Missing thruster_kit and waterproof_case."
    },
    {
      "build": "mud_crawler",
      "expected": "fail",
      "reason": "Tracks cannot provide deep-water propulsion."
    },
    {
      "build": "all_rounder",
      "expected": "fail",
      "reason": "Missing thruster_kit."
    },
    {
      "build": "deep_diver",
      "expected": "finish",
      "reason": "Equipped with required underwater propulsion and protection."
    }
  ],
  "recommendedBuild": {
    "id": "deep_diver",
    "partIds": [
      "wheels",
      "motor_torque",
      "battery_large",
      "ultrasonic",
      "waterproof_case",
      "thruster_kit"
    ],
    "totalCostEur": 182,
    "remainingBudgetEur": 68
  }
}
```

## 6. Balancing and implementation notes

**Mission-critical behavior:** A robot without both `thruster_kit` and `waterproof_case` must be unable to complete the deep-water sections. This should be deterministic, independent of which AI policy controls it.

For fairness in **Brain Duel**, both policies must receive identical builds, water depths, current conditions, obstacle positions and simulation seeds. Only their action decisions should differ.

The three decision moments also need consequences that the existing simulation can represent. In particular, submerged debris must be associated with a speed-dependent impact penalty; otherwise `brake` is merely a cosmetic recommendation.

Two further limitations should remain explicit:

- The underwater slopes are **1D course-gradient abstractions**, not simulated three-dimensional swimming trajectories. The thrusters supply forward propulsion; no buoyancy, pitch or depth controller is implied.
- The supplied `thruster_kit` values are gameplay parameters. The module does not establish real-world thrust, pressure tolerance, battery compatibility or waterproof safety.

**Design verdict:** M6 works best as RivetRun's first mission requiring a fundamentally new propulsion mechanism. It rewards the player's engineering choices while preserving the existing simulation, action vocabulary and Jev decision architecture.