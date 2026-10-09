# RivetRun — Simulation Data v0.1

**Status:** Initial balancing dataset  
**Budget:** €250 per robot  
**Simulation:** Deterministic 1D side-view  
**Policies:** `jev`, `heuristic`, `random`  
**Competition:** Brain Duel, using identical terrain seeds and independent policy execution

The values below combine published engineering references, representative maker hardware specifications, and explicit gameplay balancing.

**Important specification limitation:** The exact 12-part inventory is not present in the accessible project materials. The 12 parts below are therefore a proposed v0 roster, not a claim that they match an unseen inventory. No changes to the fixed stack or architecture are proposed.

## A. Terrain definitions

### Physical basis and modeling conventions

`baseFriction` represents the approximate longitudinal traction coefficient, μ, for a conventional rubber-tired vehicle.

The published ranges below are representative rather than universal. Real traction changes with tire compound, tread, moisture, temperature, load and surface preparation.

Engineering references support approximately:

- Dry asphalt: μ ≈ 0.72–1.00.
- Loose sand: μ ≈ 0.10–0.40, depending on conditions.
- Ice: μ ≈ 0.00–0.20.
- Loose gravel: μ ≈ 0.20–0.70.
- Wet clay/mud: μ ≈ 0.10–0.30.

Published rolling-resistance ranges include asphalt at approximately 0.010–0.020, dry sand at 0.100–0.300, and muddy ground at 0.100–0.250. [Engineering Toolbox](https://www.engineeringtoolbox.com/tractive-effort-d_1783.html?utm_source=chatgpt.com)

**Modeling rules:**

- `baseFriction`: dimensionless longitudinal grip.
- `rollingResistance`: dimensionless effective Crr.
- `sinkage`: gameplay-normalized terrain deformation, 0–1.
- `impactRisk`: gameplay-normalized terrain damage risk, 0–1.
- `waterDamagePctPerSecWithoutCase`: percentage points of robot health lost per second of water exposure without protection.
- `tractionMultiplier`: locomotion-specific grip modifier.
- Effective traction: `baseFriction × tractionMultiplier[locomotion]`.
- Do not clamp the final coefficient to 1.0; effective μ above 1.0 is permitted in this gameplay abstraction.

The friction and resistance coefficients are physics-inspired. **Sinkage, impact risk, water damage and all locomotion multipliers are gameplay inventions**, not experimentally measured physical constants.

### Terrain table

| Terrain | Published μ range¹ | Published Crr range² | Base μ | Crr | Sinkage | Impact risk | Water damage %/s | Wheels | Off-road | Tracks |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Asphalt | 0.72–1.00 | 0.010–0.020 | 0.90 | 0.015 | 0.00 | 0.02 | 0 | 1.00 | 0.95 | 0.75 |
| Rock | 0.50–0.90³ | 0.035–0.100³ | 0.65 | 0.065 | 0.00 | 0.35 | 0 | 0.75 | 1.20 | 1.15 |
| Sand | 0.10–0.40 | 0.100–0.300 | 0.30 | 0.180 | 0.75 | 0.05 | 0 | 0.45 | 0.95 | 1.50 |
| Mud | 0.10–0.30 | 0.100–0.250 | 0.25 | 0.200 | 0.90 | 0.08 | 0 | 0.40 | 1.10 | 1.65 |
| Water | — | — | 0.12 | 0.250 | 0.40 | 0.08 | 8 | 0.35 | 0.60 | 0.85 |
| Grass | 0.30–0.50³ | 0.025–0.080³ | 0.40 | 0.050 | 0.15 | 0.04 | 0 | 0.80 | 1.20 | 1.10 |
| Ice | 0.00–0.20 | 0.015–0.030 | 0.12 | 0.020 | 0.00 | 0.18 | 0 | 0.55 | 0.90 | 0.75 |

¹ Published ranges refer to representative tire–surface combinations, not universal material constants.

² Rolling-resistance references are primarily road-vehicle values. Their use in a small robot simulation is an approximation.

³ Rock and grass ranges are **engineering-inspired estimates**, not directly sourced measurements for the specified robot. Rock Crr uses rough/cobblestone terrain as a partial analogue; grass uses tire–grass traction references and an estimated Crr range.

Water is a gameplay-defined shallow-water obstacle. Its values do not model hydrodynamics or buoyancy.

Sources: [Engineering Toolbox — Friction](https://www.engineeringtoolbox.com/friction-coefficients-d_778.html), [Vehicle Traction](https://www.engineeringtoolbox.com/tractive-effort-d_1783.html), [WorkSafe — Road Friction](https://www.worksafe.govt.nz/topic-and-industry/extractives/guidance-position-statements/health-and-safety-at-opencast-mines-alluvial-mines-and-quarries/part-c/8-0-planning-for-roads-and-other-vehicle-operating-areas/), [Rolling Resistance Reference](https://www.mdpi.com/2077-0472/15/1/100/review_report).

### Terrain JSON

```json
{
  "version": "0.1.0",
  "units": {
    "baseFriction": "dimensionless",
    "rollingResistance": "dimensionless",
    "sinkage": "normalized_0_1",
    "impactRisk": "normalized_0_1",
    "waterDamagePctPerSecWithoutCase": "health_percentage_points_per_second",
    "tractionMultiplier": "dimensionless"
  },
  "terrains": [
    {
      "id": "asphalt",
      "name": "Asphalt",
      "baseFriction": 0.90,
      "rollingResistance": 0.015,
      "sinkage": 0.00,
      "impactRisk": 0.02,
      "waterDamagePctPerSecWithoutCase": 0,
      "tractionMultiplier": {
        "wheels": 1.00,
        "offroad_wheels": 0.95,
        "tracks": 0.75
      }
    },
    {
      "id": "rock",
      "name": "Rock",
      "baseFriction": 0.65,
      "rollingResistance": 0.065,
      "sinkage": 0.00,
      "impactRisk": 0.35,
      "waterDamagePctPerSecWithoutCase": 0,
      "tractionMultiplier": {
        "wheels": 0.75,
        "offroad_wheels": 1.20,
        "tracks": 1.15
      }
    },
    {
      "id": "sand",
      "name": "Sand",
      "baseFriction": 0.30,
      "rollingResistance": 0.180,
      "sinkage": 0.75,
      "impactRisk": 0.05,
      "waterDamagePctPerSecWithoutCase": 0,
      "tractionMultiplier": {
        "wheels": 0.45,
        "offroad_wheels": 0.95,
        "tracks": 1.50
      }
    },
    {
      "id": "mud",
      "name": "Mud",
      "baseFriction": 0.25,
      "rollingResistance": 0.200,
      "sinkage": 0.90,
      "impactRisk": 0.08,
      "waterDamagePctPerSecWithoutCase": 0,
      "tractionMultiplier": {
        "wheels": 0.40,
        "offroad_wheels": 1.10,
        "tracks": 1.65
      }
    },
    {
      "id": "water",
      "name": "Shallow Water",
      "baseFriction": 0.12,
      "rollingResistance": 0.250,
      "sinkage": 0.40,
      "impactRisk": 0.08,
      "waterDamagePctPerSecWithoutCase": 8,
      "tractionMultiplier": {
        "wheels": 0.35,
        "offroad_wheels": 0.60,
        "tracks": 0.85
      }
    },
    {
      "id": "grass",
      "name": "Grass",
      "baseFriction": 0.40,
      "rollingResistance": 0.050,
      "sinkage": 0.15,
      "impactRisk": 0.04,
      "waterDamagePctPerSecWithoutCase": 0,
      "tractionMultiplier": {
        "wheels": 0.80,
        "offroad_wheels": 1.20,
        "tracks": 1.10
      }
    },
    {
      "id": "ice",
      "name": "Ice",
      "baseFriction": 0.12,
      "rollingResistance": 0.020,
      "sinkage": 0.00,
      "impactRisk": 0.18,
      "waterDamagePctPerSecWithoutCase": 0,
      "tractionMultiplier": {
        "wheels": 0.55,
        "offroad_wheels": 0.90,
        "tracks": 0.75
      }
    }
  ]
}
```

## B. Maker-inspired parts catalog

### Catalog constraints

The v0 catalog contains **12 purchasable parts across seven functional categories**.

The parts are inspired by actual maker hardware classes, but their values are tuned for a playable game rather than an electrically and mechanically complete physical robot.

**Pricing:** Approximate single-unit European hobby-retail estimates, not verified supplier quotations. Prices are fixed gameplay purchase prices and should not be interpreted as current market offers.

**Power convention:** `powerW` represents approximate active electrical draw attributable to a part. Battery entries have `powerW: 0` because they store rather than consume energy. Motor entries represent an entire two-motor drive kit. Locomotion components contain no additional motor draw.

**Mass convention:** All quantities are for the purchasable assembly, including mounting hardware or bundled components where relevant.

Real-world reference points:

- Pololu's 6V micro metal gearmotors demonstrate the expected speed–torque trade-off between gearing ratios. For example, the 50:1 MP version specifies approximately 420 RPM and 0.54 kg·cm theoretical stall torque, while the 298:1 MP version specifies approximately 73 RPM and 2.4 kg·cm. [Pololu](https://www.pololu.com/product/2371/specs?utm_source=chatgpt.com)
- These reference torques are theoretical stall values and should not be treated as continuous operating torque.
- Sensor noise, gameplay speed caps, waterproofing effects and damage reduction are balancing assumptions.
- The `maxSpeedMs` and `torqueNm` values below are **effective simulation parameters**, not manufacturer specifications.

### Parts table

| ID | Part / Real maker class | Category | Mass kg | Cost € | Power W | Primary effect |
|---|---|---|---:|---:|---:|---|
| `chassis_basic` | 3D-printed PLA robot chassis + ESP32-class controller | Chassis | 0.280 | 28 | 0.8 | Base robot |
| `wheels_standard` | 65 mm rubber robot wheels | Locomotion | 0.120 | 12 | 0 | Standard wheels |
| `wheels_offroad` | 90 mm rubber off-road wheel set | Locomotion | 0.240 | 25 | 0 | Off-road wheels |
| `tracks_rubber` | Mini tracked chassis conversion kit | Locomotion | 0.450 | 55 | 0 | Tracks |
| `motor_torque` | Two high-ratio 6V geared DC motors | Motor | 0.180 | 22 | 12 | 2.2 m/s; 0.65 Nm |
| `motor_speed` | Two low-ratio 6V geared DC motors | Motor | 0.160 | 48 | 20 | 4.2 m/s; 0.25 Nm |
| `battery_2s` | 2S 18650 Li-ion pack, 2.5 Ah | Battery | 0.110 | 18 | 0 | 18.5 Wh |
| `battery_extended` | 2S2P 18650 Li-ion pack, 5 Ah | Battery | 0.220 | 39 | 0 | 37 Wh |
| `sensor_ultrasonic` | HC-SR04-class ultrasonic sensor | Sensor | 0.015 | 9 | 0.075 | Range 4 m; σ 0.03 m |
| `sensor_imu` | MPU-6050-class 6-axis IMU | Sensor | 0.010 | 18 | 0.02 | Tilt and motion measurements |
| `servo_stabilizer` | MG996R-class servo + stabilizer linkage | Extra | 0.080 | 16 | 3 | Impact mitigation |
| `case_waterproof` | IP67-style electronics enclosure | Extra | 0.180 | 35 | 0 | Water protection |

### Gameplay balancing decisions

**Motors**

The speed motor has approximately 1.9 times the speed but only 38% of the torque of the torque motor.

Both values describe complete virtual drivetrains, not individual physical motor shafts.

This creates an intentional trade-off between speed and difficult terrain.

**Batteries**

The extended pack doubles the capacity but also doubles its mass.

This creates a range-versus-weight trade-off.

For the v0 course, battery depletion may be uncommon. Longer races and higher-power loads will make the distinction more important.

**Sensors**

The ultrasonic sensor provides obstacle-distance estimates.

The IMU provides inclination and motion observations.

Since Jev receives code-supplied lookahead, the sensors should affect the **quality, range, or uncertainty of observations available to all policies**, rather than introducing an entirely different perception system.

**Waterproof enclosure**

The enclosure prevents the specified gameplay water-damage rate.

It does not imply that the robot is physically waterproof in every real-world condition.

**Full-kit validation**

Buying one of every catalog item costs:

**€325 > €250**

Therefore, the entire catalog cannot be purchased within budget.

The validation is stronger than this simple total: meaningful choices also exist within mutually exclusive slots.

### Parts JSON

```json
{
  "version": "0.1.0",
  "currency": "EUR",
  "budgetEur": 250,
  "pricesAreApproximateRetailEstimates": true,
  "physicalSpecsAreRepresentative": true,
  "gameplayValuesAreNotHardwareDatasheetGuarantees": true,
  "slots": {
    "chassis": {
      "required": true,
      "maxEquipped": 1
    },
    "locomotion": {
      "required": true,
      "maxEquipped": 1
    },
    "motor": {
      "required": true,
      "maxEquipped": 1
    },
    "battery": {
      "required": true,
      "maxEquipped": 1
    },
    "sensor": {
      "required": false,
      "maxEquipped": 2
    },
    "extra": {
      "required": false,
      "maxEquipped": 2
    }
  },
  "parts": [
    {
      "id": "chassis_basic",
      "name": "Maker Chassis",
      "category": "chassis",
      "realWorldClass": "3D-printed PLA chassis with ESP32-class control electronics",
      "massKg": 0.280,
      "costEur": 28,
      "powerW": 0.8,
      "effects": {
        "baseHealthPct": 100,
        "controlEnabled": true
      }
    },
    {
      "id": "wheels_standard",
      "name": "Street Wheels",
      "category": "locomotion",
      "realWorldClass": "65 mm rubber robot wheel set",
      "massKg": 0.120,
      "costEur": 12,
      "powerW": 0,
      "effects": {
        "locomotionType": "wheels"
      }
    },
    {
      "id": "wheels_offroad",
      "name": "All-Terrain Wheels",
      "category": "locomotion",
      "realWorldClass": "90 mm rubber off-road robot wheel set",
      "massKg": 0.240,
      "costEur": 25,
      "powerW": 0,
      "effects": {
        "locomotionType": "offroad_wheels"
      }
    },
    {
      "id": "tracks_rubber",
      "name": "Crawler Tracks",
      "category": "locomotion",
      "realWorldClass": "Mini rubber tracked-drive conversion kit",
      "massKg": 0.450,
      "costEur": 55,
      "powerW": 0,
      "effects": {
        "locomotionType": "tracks"
      }
    },
    {
      "id": "motor_torque",
      "name": "Torque Drive",
      "category": "motor",
      "realWorldClass": "Pair of high-ratio 6V geared DC motors with drive electronics",
      "massKg": 0.180,
      "costEur": 22,
      "powerW": 12,
      "effects": {
        "maxSpeedMs": 2.2,
        "torqueNm": 0.65
      }
    },
    {
      "id": "motor_speed",
      "name": "Speed Drive",
      "category": "motor",
      "realWorldClass": "Pair of low-ratio 6V geared DC motors with drive electronics",
      "massKg": 0.160,
      "costEur": 48,
      "powerW": 20,
      "effects": {
        "maxSpeedMs": 4.2,
        "torqueNm": 0.25
      }
    },
    {
      "id": "battery_2s",
      "name": "Standard Battery",
      "category": "battery",
      "realWorldClass": "Protected 2S 18650 Li-ion battery pack, 2.5 Ah nominal",
      "massKg": 0.110,
      "costEur": 18,
      "powerW": 0,
      "effects": {
        "capacityWh": 18.5,
        "nominalVoltageV": 7.4
      }
    },
    {
      "id": "battery_extended",
      "name": "Extended Battery",
      "category": "battery",
      "realWorldClass": "Protected 2S2P 18650 Li-ion battery pack, 5 Ah nominal",
      "massKg": 0.220,
      "costEur": 39,
      "powerW": 0,
      "effects": {
        "capacityWh": 37,
        "nominalVoltageV": 7.4
      }
    },
    {
      "id": "sensor_ultrasonic",
      "name": "Ultrasonic Sensor",
      "category": "sensor",
      "realWorldClass": "HC-SR04-class ultrasonic ranging module",
      "massKg": 0.015,
      "costEur": 9,
      "powerW": 0.075,
      "effects": {
        "sensorType": "distance",
        "rangeM": 4,
        "minRangeM": 0.02,
        "noiseSigma": 0.03,
        "noiseUnit": "m"
      }
    },
    {
      "id": "sensor_imu",
      "name": "Motion Sensor",
      "category": "sensor",
      "realWorldClass": "MPU-6050-class six-axis IMU breakout",
      "massKg": 0.010,
      "costEur": 18,
      "powerW": 0.02,
      "effects": {
        "sensorType": "imu",
        "rangeM": null,
        "noiseSigma": 1.5,
        "noiseUnit": "deg",
        "measurement": "inclination"
      }
    },
    {
      "id": "servo_stabilizer",
      "name": "Active Stabilizer",
      "category": "extra",
      "realWorldClass": "MG996R-class servo with mechanical stabilization linkage",
      "massKg": 0.080,
      "costEur": 16,
      "powerW": 3,
      "effects": {
        "impactDamageMultiplier": 0.75,
        "stabilizationEnabled": true
      }
    },
    {
      "id": "case_waterproof",
      "name": "Waterproof Case",
      "category": "extra",
      "realWorldClass": "IP67-style sealed electronics enclosure",
      "massKg": 0.180,
      "costEur": 35,
      "powerW": 0,
      "effects": {
        "waterDamageMultiplier": 0,
        "waterProtectionEnabled": true
      }
    }
  ]
}
```

## C. Robot presets

The three presets are designed to demonstrate different strategies in the same deterministic simulation.

They should compete on identical terrain seeds, using the selected `jev`, `heuristic`, or `random` policy.

The presets deliberately optimize for different conditions.

### Preset table

| Property | Speedster | Mud Crawler | All-rounder |
|---|---|---|---|
| Strategy | Maximum speed | Difficult-terrain survival | Balanced performance |
| Chassis | Maker Chassis | Maker Chassis | Maker Chassis |
| Locomotion | Street Wheels | Crawler Tracks | All-Terrain Wheels |
| Motor | Speed Drive | Torque Drive | Speed Drive |
| Battery | Standard | Extended | Extended |
| Ultrasonic | Yes | Yes | Yes |
| IMU | No | No | Yes |
| Stabilizer | Yes | No | No |
| Waterproof Case | No | Yes | Yes |
| **Total cost** | **€131** | **€188** | **€202** |
| **Remaining budget** | **€119** | **€62** | **€48** |
| **Mass** | **0.765 kg** | **1.325 kg** | **1.105 kg** |
| **Active power** | **23.875 W** | **12.875 W** | **20.895 W** |
| Max motor speed | 4.2 m/s | 2.2 m/s | 4.2 m/s |
| Motor torque | 0.25 Nm | 0.65 Nm | 0.25 Nm |
| Battery capacity | 18.5 Wh | 37 Wh | 37 Wh |
| Expected strength | Asphalt, speed | Mud, sand, water | Mixed terrain |
| Expected weakness | Mud, water | Top speed | Cost and weight |

**Balance notes:**

**Speedster** should dominate straightforward asphalt tracks. Its low mass and higher motor speed are advantageous, but the standard wheels suffer heavily on loose terrain.

**Mud Crawler** should perform best in mud, sand and shallow water. Its tracks offer stronger loose-terrain traction, while its higher mass and lower maximum speed make it less competitive on asphalt.

**All-rounder** should be the safest default for unknown courses. Its off-road wheels provide moderate terrain versatility, while the IMU can improve the quality of inclination observations.

These are intended behavioral differences, not verified race outcomes. Actual dominance must be established using deterministic simulations.

All three builds deliberately leave some budget unused. The budget is a ceiling, not a requirement to spend €250.

### Presets JSON

```json
{
  "version": "0.1.0",
  "budgetEur": 250,
  "presets": [
    {
      "id": "speedster",
      "name": "Speedster",
      "description": "Lightweight speed-focused robot for paved courses.",
      "strategy": "speed",
      "partIds": [
        "chassis_basic",
        "wheels_standard",
        "motor_speed",
        "battery_2s",
        "sensor_ultrasonic",
        "servo_stabilizer"
      ],
      "totalCostEur": 131,
      "remainingBudgetEur": 119,
      "totalMassKg": 0.765,
      "activePowerW": 23.875,
      "batteryCapacityWh": 18.5,
      "motorMaxSpeedMs": 4.2,
      "motorTorqueNm": 0.25,
      "locomotionType": "wheels",
      "strengths": [
        "asphalt",
        "low_mass",
        "top_speed"
      ],
      "weaknesses": [
        "mud",
        "sand",
        "water"
      ],
      "recommendedPolicy": "jev"
    },
    {
      "id": "mud_crawler",
      "name": "Mud Crawler",
      "description": "Tracked robot optimized for difficult terrain.",
      "strategy": "survival",
      "partIds": [
        "chassis_basic",
        "tracks_rubber",
        "motor_torque",
        "battery_extended",
        "sensor_ultrasonic",
        "case_waterproof"
      ],
      "totalCostEur": 188,
      "remainingBudgetEur": 62,
      "totalMassKg": 1.325,
      "activePowerW": 12.875,
      "batteryCapacityWh": 37,
      "motorMaxSpeedMs": 2.2,
      "motorTorqueNm": 0.65,
      "locomotionType": "tracks",
      "strengths": [
        "mud",
        "sand",
        "water",
        "torque",
        "battery_capacity"
      ],
      "weaknesses": [
        "asphalt_speed",
        "high_mass"
      ],
      "recommendedPolicy": "jev"
    },
    {
      "id": "all_rounder",
      "name": "All-rounder",
      "description": "Versatile robot for mixed-terrain challenges.",
      "strategy": "balanced",
      "partIds": [
        "chassis_basic",
        "wheels_offroad",
        "motor_speed",
        "battery_extended",
        "sensor_ultrasonic",
        "sensor_imu",
        "case_waterproof"
      ],
      "totalCostEur": 202,
      "remainingBudgetEur": 48,
      "totalMassKg": 1.105,
      "activePowerW": 20.895,
      "batteryCapacityWh": 37,
      "motorMaxSpeedMs": 4.2,
      "motorTorqueNm": 0.25,
      "locomotionType": "offroad_wheels",
      "strengths": [
        "mixed_terrain",
        "obstacle_detection",
        "inclination_awareness",
        "water_protection"
      ],
      "weaknesses": [
        "high_cost",
        "limited_torque"
      ],
      "recommendedPolicy": "jev"
    }
  ],
  "validation": {
    "allPresetsWithinBudget": true,
    "allPresetsHaveRequiredSlots": true,
    "allPartReferencesValid": true,
    "fullCatalogCostEur": 325,
    "fullCatalogExceedsBudget": true
  }
}
```

---

### v0 implementation caveats

The JSON is designed as **initial balancing data**, not a validated robotics physics model.

Three distinctions are essential:

**1. Physical plausibility versus gameplay.** The nominal speeds, torque values, traction multipliers and surface effects are simplified for RivetRun's deterministic 1D simulation. They must not be presented as predictions of actual robot performance.

**2. Brain Duel fairness.** Both policies must receive the same robot build, terrain seed, initial conditions and available observations. Sensor noise must be deterministic and generated from the same seed. Otherwise, differences between Jev and the baseline policies cannot be attributed reliably to decision quality.

**3. Energy and damage consistency.** `powerW` is a nominal active-draw estimate, not a complete variable-load electrical model. `impactRisk`, `sinkage` and traction coefficients need consistent interpretation in the existing simulation. The data intentionally does not invent or replace the simulation equations.

**Recommended initial acceptance criteria:** all three presets remain under €250; every terrain creates a meaningful traction difference; water protection changes survival; sensor-equipped robots receive additional relevant observations; and all three policies produce reproducible outcomes under fixed seeds.

This provides a concrete v0 dataset for balancing RivetRun without changing its fixed architecture.