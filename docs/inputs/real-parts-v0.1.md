# RivetRun — Real-World Maker Component Reference v0.1

**Scope:** All 15 fixed part IDs, mapped to real maker hardware used with Arduino, Raspberry Pi, and ESP32.

This reference is intended for RivetRun's educational component descriptions, Garage UI, and hardware-inspired catalog.

### Source and accuracy conventions

- **VERIFIED:** Specification supported by a manufacturer datasheet or technical reference.
- **UNKNOWN:** No sufficiently reliable specification found for the selected module or assembly.
- **ESTIMATE:** Indicative EU hobby-retail price, not a verified current European quotation.
- **BOARD-DEPENDENT:** Compatibility requires appropriate power regulation, motor drivers, interfaces, or level shifting.
- **NOT APPLICABLE:** The component is passive or the specification does not apply.

All prices are indicative consumer retail ranges in euros, generally excluding shipping. No affiliate or shopping links are included.

**Important:** The real-world specifications below are separate from RivetRun's gameplay statistics. A motor's manufacturer-rated RPM, for example, must not be substituted directly for the game's `maxSpeedMs`.

## 1. Component reference table

| ID | Real-world component | Main specifications | Compatible controllers | Est. EU price |
|---|---|---|---|---|
| `wheels` | Pololu 70×8 mm silicone-tire wheels | Ø70 mm; width 8 mm; ~14.2 g/wheel; 3 mm D-shaft | Arduino, ESP32, Pi via motor drivetrain | €7–12/pair |
| `offroad_wheels` | Pololu 90×10 mm silicone-tire wheels | Ø90 mm; width 10 mm; ~22.7 g/wheel; 3 mm D-shaft | Arduino, ESP32, Pi via motor drivetrain | €9–16/pair |
| `tracks` | DFRobot Gladiator tracked robot chassis class | 6–12 V motors; 193×163×60 mm; 470 g assembly | Arduino, ESP32, Pi + motor driver | €45–85 |
| `motor_light` | Pololu 50:1 Micro Metal Gearmotor MP 6V | 6 V; 420 RPM no-load; 70 mA no-load; 0.67 A stall; 9.5 g | Arduino, ESP32, Pi + H-bridge | €15–30/unit |
| `motor_torque` | Pololu 298:1 Micro Metal Gearmotor MP 6V | 6 V; 73 RPM no-load; 0.67 A stall; 2.4 kg·cm theoretical stall torque | Arduino, ESP32, Pi + H-bridge | €15–30/unit |
| `battery_small` | Adafruit-class protected 3.7 V 500 mAh LiPo | 3.7 V nominal; 500 mAh; 1.85 Wh; 10.5 g | All, with suitable regulation | €7–14 |
| `battery_large` | Adafruit-class protected 3.7 V 2500 mAh LiPo | 3.7 V nominal; 2500 mAh; 9.25 Wh; 50 g | All, with suitable regulation | €14–25 |
| `ultrasonic` | HC-SR04 ultrasonic distance sensor | 5 V; ~15 mA; 2–400 cm; 40 kHz | Arduino; ESP32/Pi with level shifting | €2–6 |
| `imu` | MPU-6050 six-axis IMU breakout | Accelerometer ±2/4/8/16 g; gyro ±250/500/1000/2000 °/s; I²C | Arduino, ESP32, Pi | €3–15 |
| `camera` | Raspberry Pi Camera Module 3 | Sony IMX708; 11.9 MP; 25×24×11.5 mm; 4 g | Raspberry Pi with compatible CSI | €25–40 |
| `moisture_probe` | DFRobot SEN0193 capacitive soil moisture sensor | 3.3–5.5 V; 5 mA; analog 0–3 V; 15 g | Arduino, ESP32; Pi with ADC | €5–12 |
| `scout_drone` | Bitcraze Crazyflie 2.1 micro quadrotor | 29 g; 92×92×29 mm; ~7 min flight | Standalone STM32; Pi/PC via radio | €170–260 |
| `winch` | Geared DC motor + spool + cable assembly | Motor-class dependent; assembly specs UNKNOWN | Arduino, ESP32, Pi + driver | €15–45 |
| `waterproof_case` | IP67 polycarbonate electronics enclosure | IP67-class enclosure; dimensions/mass model-dependent | All; passive enclosure | €8–35 |
| `bumper` | Pololu Romi bumper switch module | 3 mechanical switches; ~12 g; digital contact output | Arduino, ESP32, Pi GPIO | €8–18 |

**Verified technical foundations:** Pololu publishes wheel and gearmotor dimensions and electrical performance; DFRobot documents its tracked chassis and moisture sensor; Raspberry Pi publishes Camera Module 3 specifications; Bitcraze publishes Crazyflie mechanical and flight specifications. [Pololu](https://www.pololu.com/product/1425/specs?utm_source=chatgpt.com)

### Critical hardware distinctions

The `scout_drone` is a separate flying robot, not a small plug-in sensor. Crazyflie 2.1 has its own flight controller, battery, motors, and radio system.

The `moisture_probe` measures moisture in soil or similar media. It is not a generic waterproof terrain-identification sensor. RivetRun can abstract its readings into terrain information, but that would be a **gameplay interpretation**.

The `tracks` reference is a complete tracked chassis assembly, including motors. If the game treats tracks and motors as separate purchases, that is a deliberate abstraction.

The `camera` reference is specifically a Raspberry Pi CSI camera. Unlike a USB camera, it cannot be connected directly to an ordinary Arduino or ESP32 GPIO interface.

Finally, the `winch` has no universal datasheet because it describes an assembly, not one standardized product.

---

## 2. Complete JSON catalog

The JSON preserves the exact 15 RivetRun part IDs.

Each `specs` object contains available technical information and explicit `UNKNOWN` values. Each `sources` entry identifies a manufacturer or technical reference.

```json
[
  {
    "id": "wheels",
    "realClass": "Pololu 70x8mm silicone-tire robot wheels, 3mm D-shaft",
    "oneLiner": "Standard lightweight wheels for efficient movement on smooth surfaces.",
    "specs": {
      "referenceModel": "Pololu 1425",
      "componentType": "passive_mechanical",
      "supplyVoltageV": "NOT APPLICABLE",
      "currentA": "NOT APPLICABLE",
      "diameterMm": 70,
      "widthMm": 8,
      "massGPerWheel": 14.2,
      "shaftDiameterMm": 3,
      "shaftType": "D-shaped",
      "tireMaterial": "silicone",
      "hubMaterial": "plastic",
      "tractionCoefficient": "UNKNOWN",
      "maxRecommendedLoadKg": "UNKNOWN",
      "sourceStatus": "VERIFIED"
    },
    "worksWith": [
      "Arduino Uno with suitable motor and driver",
      "Arduino Nano with suitable motor and driver",
      "ESP32 with suitable motor and driver",
      "Raspberry Pi with suitable motor and driver"
    ],
    "retailEurRange": {
      "min": 7,
      "max": 12,
      "unit": "pair",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "Pololu 70x8mm wheel pair",
      "3mm D shaft robot wheels",
      "70mm silicone robot wheels"
    ],
    "sources": [
      {
        "name": "Pololu 70x8mm Wheel Specifications",
        "url": "https://www.pololu.com/product/1425/specs",
        "type": "manufacturer_technical_reference",
        "covers": [
          "dimensions",
          "mass",
          "shaft compatibility",
          "materials"
        ]
      }
    ]
  },
  {
    "id": "offroad_wheels",
    "realClass": "Pololu 90x10mm silicone-tire robot wheels, 3mm D-shaft",
    "oneLiner": "Larger wheels that improve obstacle clearance compared with smaller wheels.",
    "specs": {
      "referenceModel": "Pololu 1435",
      "componentType": "passive_mechanical",
      "supplyVoltageV": "NOT APPLICABLE",
      "currentA": "NOT APPLICABLE",
      "diameterMm": 90,
      "widthMm": 10,
      "massGPerWheel": 22.7,
      "shaftDiameterMm": 3,
      "shaftType": "D-shaped",
      "tireMaterial": "silicone",
      "hubMaterial": "plastic",
      "treadType": "UNKNOWN",
      "tractionCoefficient": "UNKNOWN",
      "maxRecommendedLoadKg": "UNKNOWN",
      "sourceStatus": "VERIFIED_WITH_GAMEPLAY_INTERPRETATION"
    },
    "worksWith": [
      "Arduino Uno with suitable motor and driver",
      "Arduino Nano with suitable motor and driver",
      "ESP32 with suitable motor and driver",
      "Raspberry Pi with suitable motor and driver"
    ],
    "retailEurRange": {
      "min": 9,
      "max": 16,
      "unit": "pair",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "Pololu 90x10mm wheels",
      "90mm robot wheels 3mm shaft",
      "large rubber robot wheels"
    ],
    "sources": [
      {
        "name": "Pololu 90x10mm Wheel Specifications",
        "url": "https://www.pololu.com/product/1435/specs",
        "type": "manufacturer_technical_reference",
        "covers": [
          "dimensions",
          "mass",
          "shaft compatibility",
          "materials"
        ]
      }
    ]
  },
  {
    "id": "tracks",
    "realClass": "DFRobot Black Gladiator tracked robot chassis class",
    "oneLiner": "Provides continuous-track locomotion for loose and uneven ground.",
    "specs": {
      "referenceModel": "DFRobot Black Gladiator",
      "componentType": "mechanical_drivetrain",
      "motorSupplyVoltageV": {
        "min": 6,
        "max": 12
      },
      "nominalMotorVoltageV": 12,
      "motorNoLoadCurrentA": 0.1,
      "motorNoLoadSpeedRpm": {
        "min": 170,
        "max": 350
      },
      "lengthMm": 193,
      "widthMm": 163,
      "heightMm": 60,
      "assemblyMassG": 470,
      "chassisMaterial": "aluminium alloy",
      "trackMaterial": "engineering plastic",
      "includedMotors": 2,
      "trackWidthMm": "UNKNOWN",
      "groundPressureKPa": "UNKNOWN",
      "tractionCoefficient": "UNKNOWN",
      "sourceStatus": "VERIFIED"
    },
    "worksWith": [
      "Arduino with external motor driver",
      "ESP32 with external motor driver",
      "Raspberry Pi with external motor driver"
    ],
    "retailEurRange": {
      "min": 45,
      "max": 85,
      "unit": "chassis kit",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "DFRobot Gladiator tracked chassis",
      "Arduino tank robot chassis",
      "rubber track robot platform"
    ],
    "sources": [
      {
        "name": "DFRobot Black Gladiator Product Specifications",
        "url": "https://www.dfrobot.com/product-1860.html",
        "type": "manufacturer_technical_reference",
        "covers": [
          "motor voltage",
          "motor current",
          "motor speed",
          "chassis dimensions",
          "assembly mass",
          "materials"
        ]
      }
    ]
  },
  {
    "id": "motor_light",
    "realClass": "Pololu 50:1 Micro Metal Gearmotor MP 6V",
    "oneLiner": "A compact geared DC motor optimized for relatively high output speed.",
    "specs": {
      "referenceModel": "Pololu 2365",
      "componentType": "brushed_dc_gearmotor",
      "nominalVoltageV": 6,
      "gearRatio": 51.45,
      "noLoadSpeedRpm": 420,
      "noLoadCurrentA": 0.07,
      "stallCurrentA": 0.67,
      "stallTorqueKgCm": 0.54,
      "stallTorqueNmApprox": 0.053,
      "maxOutputPowerW": 0.55,
      "bodyDimensionsMm": [10, 12, 25],
      "massG": 9.5,
      "outputShaftDiameterMm": 3,
      "encoderIncluded": false,
      "continuousRatedTorqueNm": "UNKNOWN",
      "notes": "Stall torque is theoretical. Do not operate continuously at stall.",
      "sourceStatus": "VERIFIED"
    },
    "worksWith": [
      "Arduino with H-bridge motor driver",
      "ESP32 with H-bridge motor driver",
      "Raspberry Pi with H-bridge motor driver"
    ],
    "retailEurRange": {
      "min": 15,
      "max": 30,
      "unit": "motor",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "Pololu 50:1 micro metal gearmotor",
      "6V micro DC gear motor",
      "N20 gearmotor 50:1"
    ],
    "sources": [
      {
        "name": "Pololu 50:1 Micro Metal Gearmotor MP 6V",
        "url": "https://www.pololu.com/product/2365/specs",
        "type": "manufacturer_technical_reference",
        "covers": [
          "voltage",
          "current",
          "RPM",
          "gear ratio",
          "stall torque",
          "dimensions",
          "mass"
        ]
      }
    ]
  },
  {
    "id": "motor_torque",
    "realClass": "Pololu 298:1 Micro Metal Gearmotor MP 6V",
    "oneLiner": "A heavily geared DC motor that trades rotation speed for greater output torque.",
    "specs": {
      "referenceModel": "Pololu 2371",
      "componentType": "brushed_dc_gearmotor",
      "nominalVoltageV": 6,
      "gearRatio": 297.92,
      "noLoadSpeedRpm": 73,
      "noLoadCurrentA": 0.07,
      "stallCurrentA": 0.67,
      "stallTorqueKgCm": 2.4,
      "stallTorqueNmApprox": 0.235,
      "maxOutputPowerW": 0.44,
      "bodyDimensionsMm": [10, 12, 25],
      "massG": 9.5,
      "outputShaftDiameterMm": 3,
      "encoderIncluded": false,
      "continuousRatedTorqueNm": "UNKNOWN",
      "notes": "Stall torque is theoretical and can exceed safe gearbox loading.",
      "sourceStatus": "VERIFIED"
    },
    "worksWith": [
      "Arduino with H-bridge motor driver",
      "ESP32 with H-bridge motor driver",
      "Raspberry Pi with H-bridge motor driver"
    ],
    "retailEurRange": {
      "min": 15,
      "max": 30,
      "unit": "motor",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "Pololu 298:1 micro metal gearmotor",
      "high torque N20 gear motor",
      "6V 300:1 DC gearmotor"
    ],
    "sources": [
      {
        "name": "Pololu 298:1 Micro Metal Gearmotor MP 6V",
        "url": "https://www.pololu.com/product/2371/specs",
        "type": "manufacturer_technical_reference",
        "covers": [
          "voltage",
          "current",
          "RPM",
          "gear ratio",
          "stall torque",
          "dimensions",
          "mass"
        ]
      }
    ]
  },
  {
    "id": "battery_small",
    "realClass": "Protected single-cell 3.7V 500mAh LiPo battery",
    "oneLiner": "A lightweight rechargeable battery for small embedded electronics.",
    "specs": {
      "referenceModel": "Adafruit 1578",
      "componentType": "lithium_polymer_battery",
      "nominalVoltageV": 3.7,
      "maximumCellVoltageV": 4.2,
      "capacityMah": 500,
      "nominalEnergyWh": 1.85,
      "lengthMm": 29,
      "widthMm": 36,
      "thicknessMm": 4.75,
      "massG": 10.5,
      "connector": "JST-PH 2-pin",
      "protectionCircuitIncluded": true,
      "maximumChargeCurrentMa": 500,
      "continuousDischargeCurrentA": "UNKNOWN",
      "notes": "Requires an appropriate Li-ion/LiPo charging and voltage-regulation circuit.",
      "sourceStatus": "VERIFIED"
    },
    "worksWith": [
      "Arduino with appropriate power regulator",
      "ESP32 with appropriate power regulator",
      "Raspberry Pi with appropriate 5V power conversion"
    ],
    "retailEurRange": {
      "min": 7,
      "max": 14,
      "unit": "battery",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "LiPo 3.7V 500mAh JST",
      "protected 500mAh lithium polymer battery",
      "Adafruit 1578 battery"
    ],
    "sources": [
      {
        "name": "Adafruit Lithium Ion Polymer Battery 500mAh",
        "url": "https://www.adafruit.com/product/1578",
        "type": "manufacturer_technical_reference",
        "covers": [
          "nominal voltage",
          "capacity",
          "mass",
          "dimensions",
          "connector",
          "charge limits"
        ]
      }
    ]
  },
  {
    "id": "battery_large",
    "realClass": "Protected single-cell 3.7V 2500mAh LiPo battery",
    "oneLiner": "A higher-capacity battery that increases runtime at the expense of mass.",
    "specs": {
      "referenceModel": "Adafruit 328",
      "componentType": "lithium_polymer_battery",
      "nominalVoltageV": 3.7,
      "maximumCellVoltageV": 4.2,
      "capacityMah": 2500,
      "nominalEnergyWh": 9.25,
      "lengthMm": 50,
      "widthMm": 60,
      "thicknessMm": 7.3,
      "massG": 50,
      "connector": "JST-PH 2-pin",
      "protectionCircuitIncluded": true,
      "maximumRecommendedChargeCurrentMa": 1200,
      "continuousDischargeCurrentA": "UNKNOWN",
      "notes": "Requires a suitable charging circuit and voltage regulator.",
      "sourceStatus": "VERIFIED"
    },
    "worksWith": [
      "Arduino with appropriate power regulator",
      "ESP32 with appropriate power regulator",
      "Raspberry Pi with appropriate 5V power conversion"
    ],
    "retailEurRange": {
      "min": 14,
      "max": 25,
      "unit": "battery",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "LiPo 3.7V 2500mAh JST",
      "2500mAh protected lithium battery",
      "Adafruit 328 LiPo"
    ],
    "sources": [
      {
        "name": "Adafruit Lithium Ion Polymer Battery 2500mAh",
        "url": "https://www.adafruit.com/product/328",
        "type": "manufacturer_technical_reference",
        "covers": [
          "voltage",
          "capacity",
          "mass",
          "dimensions",
          "charging current"
        ]
      }
    ]
  },
  {
    "id": "ultrasonic",
    "realClass": "HC-SR04 ultrasonic ranging module",
    "oneLiner": "Measures distance to obstacles using reflected ultrasonic pulses.",
    "specs": {
      "referenceModel": "HC-SR04",
      "componentType": "ultrasonic_distance_sensor",
      "supplyVoltageV": 5,
      "operatingCurrentMaApprox": 15,
      "minimumRangeCm": 2,
      "maximumRangeCm": 400,
      "ultrasonicFrequencyKhz": 40,
      "triggerInterface": "digital pulse",
      "echoInterface": "5V digital pulse",
      "dimensionsMm": [45, 20, 15],
      "massG": "UNKNOWN",
      "accuracyMm": "UNKNOWN",
      "notes": "A voltage divider or suitable level shifter is required on ECHO for 3.3V-only GPIO.",
      "sourceStatus": "PARTIALLY_VERIFIED"
    },
    "worksWith": [
      "Arduino Uno directly",
      "Arduino Nano directly when using 5V logic",
      "ESP32 with ECHO level shifting",
      "Raspberry Pi with ECHO level shifting"
    ],
    "retailEurRange": {
      "min": 2,
      "max": 6,
      "unit": "module",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "HC-SR04 ultrasonic sensor",
      "Arduino ultrasonic distance module",
      "40kHz ultrasonic ranging sensor"
    ],
    "sources": [
      {
        "name": "HC-SR04 Technical Reference",
        "url": "https://solderhub.com/sensors/hc-sr04",
        "type": "technical_reference",
        "covers": [
          "voltage",
          "current",
          "range",
          "frequency",
          "interface"
        ]
      }
    ]
  },
  {
    "id": "imu",
    "realClass": "MPU-6050 six-axis accelerometer and gyroscope breakout",
    "oneLiner": "Measures robot acceleration and angular movement for orientation estimation.",
    "specs": {
      "referenceModel": "Adafruit MPU-6050 breakout",
      "componentType": "inertial_measurement_unit",
      "breakoutSupplyVoltageV": {
        "min": 3,
        "max": 5
      },
      "interface": "I2C",
      "accelerometerAxes": 3,
      "gyroscopeAxes": 3,
      "accelerometerRangesG": [2, 4, 8, 16],
      "gyroscopeRangesDegPerSec": [250, 500, 1000, 2000],
      "nominalCurrentMa": "UNKNOWN",
      "breakoutDimensionsMm": "UNKNOWN",
      "breakoutMassG": "UNKNOWN",
      "angularAccuracyDeg": "UNKNOWN",
      "notes": "Voltage range refers to the selected regulated breakout, not the bare MPU-6050 IC.",
      "sourceStatus": "PARTIALLY_VERIFIED"
    },
    "worksWith": [
      "Arduino over I2C",
      "ESP32 over I2C",
      "Raspberry Pi over I2C"
    ],
    "retailEurRange": {
      "min": 3,
      "max": 15,
      "unit": "module",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "MPU6050 GY-521 module",
      "6 axis IMU Arduino",
      "MPU6050 I2C breakout"
    ],
    "sources": [
      {
        "name": "Adafruit MPU-6050 Technical Guide",
        "url": "https://learn.adafruit.com/mpu6050-6-dof-accelerometer-and-gyro/pinouts",
        "type": "manufacturer_technical_reference",
        "covers": [
          "breakout supply voltage",
          "I2C interface",
          "sensor functionality"
        ]
      },
      {
        "name": "Adafruit MPU-6050 Breakout Reference",
        "url": "https://www.adafruit.com/product/3886",
        "type": "manufacturer_technical_reference",
        "covers": [
          "sensor class",
          "controller compatibility",
          "breakout electronics"
        ]
      }
    ]
  },
  {
    "id": "camera",
    "realClass": "Raspberry Pi Camera Module 3 with Sony IMX708 sensor",
    "oneLiner": "Captures visual information for robot perception and scene analysis.",
    "specs": {
      "referenceModel": "Raspberry Pi Camera Module 3",
      "componentType": "camera",
      "sensor": "Sony IMX708",
      "resolutionMegapixels": 11.9,
      "resolutionPixels": [4608, 2592],
      "horizontalFieldOfViewDeg": 66,
      "diagonalFieldOfViewDeg": 75,
      "interface": "MIPI CSI-2",
      "autofocus": true,
      "widthMm": 25,
      "heightMm": 24,
      "depthMm": 11.5,
      "massG": 4,
      "supplyVoltageV": "UNKNOWN",
      "operatingCurrentMa": "UNKNOWN",
      "minimumFocusDistanceCmApprox": 10,
      "notes": "Requires a compatible Raspberry Pi camera interface and appropriate ribbon cable.",
      "sourceStatus": "VERIFIED_WITH_UNSOURCED_ELECTRICAL_FIELDS"
    },
    "worksWith": [
      "Raspberry Pi with compatible CSI camera connector",
      "Arduino: NOT DIRECTLY COMPATIBLE",
      "ESP32: NOT DIRECTLY COMPATIBLE"
    ],
    "retailEurRange": {
      "min": 25,
      "max": 40,
      "unit": "module",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "Raspberry Pi Camera Module 3",
      "Sony IMX708 camera",
      "Raspberry Pi CSI autofocus camera"
    ],
    "sources": [
      {
        "name": "Raspberry Pi Camera Module 3",
        "url": "https://www.raspberrypi.com/products/camera-module-3/",
        "type": "manufacturer_technical_reference",
        "covers": [
          "sensor",
          "resolution",
          "dimensions",
          "field of view",
          "autofocus"
        ]
      },
      {
        "name": "Raspberry Pi Camera Documentation",
        "url": "https://www.raspberrypi.com/documentation/computers/camera_software.html",
        "type": "manufacturer_technical_reference",
        "covers": [
          "camera interface",
          "software compatibility"
        ]
      }
    ]
  },
  {
    "id": "moisture_probe",
    "realClass": "DFRobot SEN0193 capacitive soil moisture sensor",
    "oneLiner": "Measures moisture in soil using capacitive sensing rather than exposed resistive electrodes.",
    "specs": {
      "referenceModel": "DFRobot SEN0193",
      "componentType": "capacitive_moisture_sensor",
      "minimumSupplyVoltageV": 3.3,
      "maximumSupplyVoltageV": 5.5,
      "operatingCurrentMa": 5,
      "minimumOutputVoltageV": 0,
      "maximumOutputVoltageV": 3,
      "outputType": "analog",
      "lengthMmApprox": 98,
      "widthMmApprox": 23,
      "massG": 15,
      "connector": "PH2.0-3P",
      "measurementAccuracyPct": "UNKNOWN",
      "calibrationRequired": true,
      "notes": "Designed for soil moisture measurement. It does not directly identify asphalt, rock, ice, or other terrain classes.",
      "sourceStatus": "VERIFIED"
    },
    "worksWith": [
      "Arduino with analog input",
      "ESP32 with analog input",
      "Raspberry Pi with external analog-to-digital converter"
    ],
    "retailEurRange": {
      "min": 5,
      "max": 12,
      "unit": "sensor",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "DFRobot SEN0193 moisture sensor",
      "capacitive soil moisture Arduino",
      "Gravity analog moisture sensor"
    ],
    "sources": [
      {
        "name": "DFRobot SEN0193 Technical Wiki",
        "url": "https://wiki.dfrobot.com/sen0193/",
        "type": "manufacturer_technical_reference",
        "covers": [
          "voltage",
          "current",
          "analog output",
          "dimensions",
          "mass",
          "interface",
          "controller compatibility"
        ]
      }
    ]
  },
  {
    "id": "scout_drone",
    "realClass": "Bitcraze Crazyflie 2.1 open-source micro quadrotor",
    "oneLiner": "A miniature flying robot used to scout obstacles and gather observations ahead of the main vehicle.",
    "specs": {
      "referenceModel": "Bitcraze Crazyflie 2.1",
      "componentType": "micro_quadcopter",
      "massG": 29,
      "widthMm": 92,
      "depthMm": 92,
      "heightMm": 29,
      "mainMicrocontroller": "STM32F405",
      "radioMicrocontroller": "nRF51822",
      "mainCpuFrequencyMHz": 168,
      "wirelessInterfaces": [
        "2.4GHz radio",
        "Bluetooth Low Energy"
      ],
      "flightTimeMinutesApprox": 7,
      "recommendedMaximumPayloadG": 15,
      "batteryCapacityMah": 250,
      "batteryVoltageV": "UNKNOWN",
      "operatingCurrentMa": "UNKNOWN",
      "maximumRadioRangeM": "UNKNOWN",
      "notes": "A separate autonomous flight platform. Requires appropriate firmware and radio integration to communicate with another robot.",
      "sourceStatus": "VERIFIED_WITH_UNSOURCED_ELECTRICAL_FIELDS"
    },
    "worksWith": [
      "Standalone STM32 flight controller",
      "Raspberry Pi through supported radio integration",
      "Arduino: custom external integration required",
      "ESP32: custom external integration required"
    ],
    "retailEurRange": {
      "min": 170,
      "max": 260,
      "unit": "complete drone kit",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "Bitcraze Crazyflie 2.1",
      "open source micro quadcopter",
      "programmable nano drone"
    ],
    "sources": [
      {
        "name": "Bitcraze Crazyflie 2.1 Datasheet",
        "url": "https://github.com/bitcraze/hardware/blob/master/src/products/crazyflie-2_1/datasheet/index.md",
        "type": "manufacturer_datasheet",
        "covers": [
          "dimensions",
          "mass",
          "flight time",
          "payload",
          "microcontrollers",
          "battery capacity",
          "radio interfaces"
        ]
      }
    ]
  },
  {
    "id": "winch",
    "realClass": "Miniature geared DC motor with cable spool and hook",
    "oneLiner": "Reels in a cable to pull the robot or help it overcome difficult obstacles.",
    "specs": {
      "referenceModel": "CUSTOM_ASSEMBLY",
      "componentType": "electromechanical_winch",
      "motorReferenceClass": "6V metal DC gearmotor",
      "nominalMotorVoltageV": 6,
      "motorNoLoadCurrentA": "UNKNOWN",
      "motorStallCurrentA": "UNKNOWN",
      "spoolDiameterMm": "UNKNOWN",
      "cableLengthM": "UNKNOWN",
      "maximumLinePullN": "UNKNOWN",
      "assemblyDimensionsMm": "UNKNOWN",
      "assemblyMassG": "UNKNOWN",
      "gearboxRatio": "UNKNOWN",
      "notes": "6V is a representative gearmotor supply, not a verified specification for a complete winch. Motor, spool, mounting frame, cable and hook must be specified individually.",
      "sourceStatus": "REFERENCE_CLASS_ONLY"
    },
    "worksWith": [
      "Arduino with motor driver",
      "ESP32 with motor driver",
      "Raspberry Pi with motor driver"
    ],
    "retailEurRange": {
      "min": 15,
      "max": 45,
      "unit": "DIY assembly",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "mini robot winch motor",
      "N20 gearmotor cable spool",
      "Arduino robotic winch DIY"
    ],
    "sources": [
      {
        "name": "Pololu Micro Metal Gearmotor Family",
        "url": "https://www.pololu.com/product-info-merged/2367",
        "type": "manufacturer_technical_reference",
        "covers": [
          "representative geared motor specifications",
          "motor shaft compatibility"
        ],
        "limitations": "Does not specify a complete winch assembly."
      }
    ]
  },
  {
    "id": "waterproof_case",
    "realClass": "IP67-rated polycarbonate electronics enclosure",
    "oneLiner": "Protects the robot's electronics from dust and temporary water immersion when properly assembled.",
    "specs": {
      "referenceModel": "Polycase WQ-series enclosure class",
      "componentType": "passive_protective_enclosure",
      "ingressProtectionRating": "IP67",
      "supplyVoltageV": "NOT APPLICABLE",
      "currentA": "NOT APPLICABLE",
      "material": "polycarbonate-class enclosure",
      "lengthMm": "UNKNOWN",
      "widthMm": "UNKNOWN",
      "heightMm": "UNKNOWN",
      "massG": "UNKNOWN",
      "gasketMaterial": "UNKNOWN",
      "maximumSupportedWaterDepthM": "UNKNOWN",
      "maximumSupportedImmersionDurationMinutes": "UNKNOWN",
      "notes": "Exact dimensions, gasket details, mass and immersion limits depend on the selected enclosure. Cable entries and modifications can invalidate the rating.",
      "sourceStatus": "REFERENCE_CLASS_ONLY"
    },
    "worksWith": [
      "Arduino installations",
      "ESP32 installations",
      "Raspberry Pi installations"
    ],
    "retailEurRange": {
      "min": 8,
      "max": 35,
      "unit": "enclosure",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "IP67 polycarbonate electronics enclosure",
      "waterproof Arduino project box",
      "sealed Raspberry Pi electronics case"
    ],
    "sources": [
      {
        "name": "Polycase IP67 Enclosure Reference",
        "url": "https://www.polycase.com/wq-50",
        "type": "manufacturer_technical_reference",
        "covers": [
          "IP67 enclosure class",
          "construction",
          "mechanical documentation"
        ],
        "limitations": "Example enclosure is larger than a typical miniature robot. Exact enclosure model remains unspecified."
      }
    ]
  },
  {
    "id": "bumper",
    "realClass": "Pololu Romi mechanical bumper switch module",
    "oneLiner": "Detects physical contact with obstacles using mechanical snap-action switches.",
    "specs": {
      "referenceModel": "Pololu 3678",
      "componentType": "mechanical_contact_sensor",
      "numberOfSwitches": 3,
      "switchType": "snap-action roller-lever",
      "outputType": "digital contact",
      "signalBehavior": "active low with pull-up",
      "supplyVoltageV": "NOT APPLICABLE",
      "operatingCurrentMa": "NOT APPLICABLE",
      "massG": 12,
      "lengthMm": "UNKNOWN",
      "widthMm": "UNKNOWN",
      "heightMm": "UNKNOWN",
      "actuationForceN": "UNKNOWN",
      "maximumSwitchingCurrentA": "UNKNOWN",
      "notes": "Mechanical contacts do not require active sensor power. The connected controller determines GPIO voltage and pull-up configuration.",
      "sourceStatus": "PARTIALLY_VERIFIED"
    },
    "worksWith": [
      "Arduino digital GPIO",
      "ESP32 digital GPIO",
      "Raspberry Pi digital GPIO"
    ],
    "retailEurRange": {
      "min": 8,
      "max": 18,
      "unit": "module",
      "status": "ESTIMATE"
    },
    "searchTerms": [
      "Pololu Romi bumper switch",
      "Arduino robot collision switch",
      "robot bumper microswitch module"
    ],
    "sources": [
      {
        "name": "Pololu Romi Bumper Switch Kit",
        "url": "https://www.pololu.com/product/3678/specs",
        "type": "manufacturer_technical_reference",
        "covers": [
          "number of switches",
          "mass",
          "contact sensing"
        ]
      },
      {
        "name": "Pololu Romi Bumper Switch Assembly",
        "url": "https://www.pololu.com/product/3673",
        "type": "manufacturer_technical_reference",
        "covers": [
          "GPIO connection",
          "pull-up behavior",
          "mechanical switch arrangement"
        ]
      }
    ]
  }
]
```

## 3. Engineering accuracy notes

Four limitations matter if RivetRun presents these components as educational representations of real hardware.

**First, real hardware is not automatically interchangeable.** A Raspberry Pi camera requires a compatible CSI interface; an HC-SR04 generally needs voltage adaptation when connected to a 3.3 V-only board; geared motors require an appropriate driver; and batteries require matching power conversion and protection.

**Second, some items represent assemblies rather than individual components.** Tracks, a winch, and a scout drone contain multiple mechanical or electrical elements. Their mass, cost, power, and compatibility depend on the complete assembly.

**Third, the two battery references are 3.7 V single-cell LiPo packs.** They are not interchangeable with the earlier hypothetical 7.4 V 2S packs. The selected references are supported by manufacturer documentation, but using them in a physical robot would require matching the system's voltage and peak-current requirements. [Adafruit](https://www.adafruit.com/product/1578?utm_source=chatgpt.com)

**Fourth, estimated retail prices are not verified current quotations.** Manufacturer technical documents support the hardware specifications; they do not establish the European price intervals. Keep these estimates separate from the game's €250 balancing economy.

### Recommended data treatment

For the RivetRun Garage, use `realClass`, `oneLiner`, `searchTerms`, and `sources` to provide authentic maker-oriented educational content.

Use the existing game's separate simulation statistics for gameplay behavior.

**Do not derive traction, damage reduction, decision accuracy, or robot speed directly from this reference catalog.** Doing so would imply scientific validation that the underlying simulation does not provide.

This distinction allows RivetRun to be both approachable as an arcade game and technically credible as an introduction to robotics.