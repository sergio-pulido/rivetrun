# RIVET MK-II — Bill of Materials (v1)

Checked 2026-10-10. Designed, not yet built or test-printed. Machine-readable copy: `docs/inputs/bom-mk2.json`.

MK-II is a 4WD skid-steer rover: Raspberry Pi 5, four Pololu micro metal gearmotors, an RC LiPo pack and a printed PETG chassis. Every printed part fits a 180×180×180 mm bed, so it prints on any current Bambu Lab printer, the A1 mini included.

## Rules
- Links go only to the manufacturer's page or its official store. No marketplaces, no affiliate links.
- Every url was opened on checkedAt and matched to the product. url null means no official page was verified.
- priceShown is copied from the page as displayed, in its own currency. null means the page showed no price. Prices are not converted or summed across currencies.
- Specs come from the product page or its datasheet. Game stats are tuned for play and are not the real specs.
- status: verified = page checked; unverified = no official source found; experimental = real but unsuitable or no buyable part; design = a printed-part proposal, not yet validated.

## Core kit (every build)
| Part | Qty | Source | Price shown | Status | Notes |
|---|---|---|---|---|---|
| Raspberry Pi 5 4GB | 1 pcs | [Raspberry Pi Ltd Raspberry Pi 5 4GB RAM - Unit only](https://www.raspberrypi.com/products/raspberry-pi-5/) | — | verified | 4GB variant listed in the selector. The page shows no price for it. |
| 5V, 3A Step-Up/Step-Down Voltage Regulator S13V30F5 | 1 pcs | [Pololu S13V30F5 (#4082)](https://www.pololu.com/product/4082) | US$17.95 | verified | Covers 1S–4S. The Pi 5 asks for 5 V/5 A; 3 A leaves less headroom for USB peripherals. |
| Magnetic Encoder Pair Kit for Micro Metal Gearmotors, 12 CPR, 2.7-18V | 2 pair kit | [Pololu #3081](https://www.pololu.com/product/3081) | US$9.95 | verified | Two kits cover all four motors. Needs the extended-shaft motors. |
| XT60 male & female plug (3 pairs) | 1 pack (3 pairs) | [Genspow GmbH (Gens ace EU store) GEAXT603](https://gensace.de/products/xt60-male-female-plug-3-pairs) | €5,99 | verified | Sold out when checked. |
| ATO / ATC Fuse - 5 Amp | 1 pack of 2 | [Blue Sea Systems 5239](https://www.bluesea.com/products/5239) | — | verified | Sized for four motors at 0.75 A stall plus the Pi regulator. |
| In-Line ATO / ATC Fuse Holder | 1 pcs | [Blue Sea Systems 5064](https://www.bluesea.com/products/5064/in-line_ato___atc_fuse_holder) | — | verified |  |
| ruthex M3 threaded inserts RX-M3x5.7 (100 pcs) | 1 pack of 100 | [ruthex RX-M3x5.7 (GE-M3x57-001)](https://www.ruthex.de/products/ruthex-gewindeeinsatz-m3-100-stuck-rx-m3x5-7-messing-gewindebuchsen) | €8,99 | verified | Official ruthex shop. The recommended hole size is not on the page; take it from the ruthex datasheet before modelling bosses. |
| Mounting Kit with M3/M4 Screws, Nuts & Washers | 1 kit | [DFRobot FIT0224](https://www.dfrobot.com/product-699.html) | $11.95 | verified | Low stock when checked. |
| Bambu PETG HF | 1 spool | [Bambu Lab PETG HF](https://eu.store.bambulab.com/products/petg-hf) | — | verified | Density from the official store's spec table. Price did not render. |

## Depends on battery cells

| Cells | Motor driver | Power switch | Motor voltage | Note |
|---|---|---|---|---|
| 1S | [DRV8835 Dual Motor Driver Kit for Raspberry Pi](https://www.pololu.com/product/2753) (US$14.95) | [Mini Pushbutton Power Switch with Reverse Voltage Protection, LV](https://www.pololu.com/product/2808) (US$4.95) | 6V |  |
| 2S | [Dual MAX14870 Motor Driver for Raspberry Pi (Assembled)](https://www.pololu.com/product/3759) (US$29.95) | [Big Pushbutton Power Switch with Reverse Voltage Protection, MP](https://www.pololu.com/product/2812) (US$5.95) | 12V |  |
| 3S | [Dual MAX14870 Motor Driver for Raspberry Pi (Assembled)](https://www.pololu.com/product/3759) (US$29.95) | [Big Pushbutton Power Switch with Reverse Voltage Protection, MP](https://www.pololu.com/product/2812) (US$5.95) | 12V |  |
| 4S | [Dual MAX14870 Motor Driver for Raspberry Pi (Assembled)](https://www.pololu.com/product/3759) (US$29.95) | [Big Pushbutton Power Switch with Reverse Voltage Protection, MP](https://www.pololu.com/product/2812) (US$5.95) | 12V | A full 4S pack (16.8 V) is above the 12 V motor rating: cap PWM at about 70 %. |

## Motors (4 per rover)
| Part | Qty | Source | Price shown | Status | Notes |
|---|---|---|---|---|---|
| 50:1 Micro Metal Gearmotor MP 6V | 4 pcs | [Pololu #2365](https://www.pololu.com/product/2365) | US$23.95 | verified | 1S builds only. |
| 50:1 Micro Metal Gearmotor HPCB 12V with Extended Motor Shaft | 4 pcs | [Pololu #3050](https://www.pololu.com/product/3050) | US$27.45 | verified | 2S–4S builds, encoder-ready. A full 4S pack (16.8 V) exceeds the 12 V rating: cap PWM at about 70 %. |
| 298:1 Micro Metal Gearmotor MP 6V | 4 pcs | [Pololu #2371](https://www.pololu.com/product/2371) | US$23.95 | verified | 1S builds only. |
| 298:1 Micro Metal Gearmotor HPCB 12V with Extended Motor Shaft | 4 pcs | [Pololu #3056](https://www.pololu.com/product/3056) | US$27.45 | verified | 2S–4S builds, encoder-ready. Same 4S overvoltage caveat as the 50:1. |

## Batteries (Gens ace official EU store)
| Part | Qty | Source | Price shown | Status | Notes |
|---|---|---|---|---|---|
| Gens ace 500mAh 3.7V 60C 1S1P LiPo, JST-SYP | 1 pcs | [Gens ace GEA5001S60JRED](https://gensace.de/products/gea5001s60jred) | €9,99 | verified | Official Gens ace EU store (Genspow GmbH). The JST-SYP plug needs an adapter to the XT60 harness. |
| Gens ace 1000mAh 2S 30C 7.4V LiPo, XT60, Soaring | 1 pcs | [Gens ace GEA102S30X6GT](https://gensace.de/products/gens-ace-g-tech-soaring-1000mah-7-4v-30c-2s1p-lipo-battery-pack-with-xt60-plug) | €9,49 | verified | Smallest 2S pack with an XT60 plug in the official store. |
| Gens ace 850mAh 3S 60C 11.1V LiPo, XT60, Adventure | 1 pcs | [Gens ace GEA8503S60X6GT](https://gensace.de/products/gea8503s60x6gt) | €18,99 | verified | Either C rating is far above the rover's current draw. |
| Gens ace 850mAh 4S 60C 14.8V LiPo, XT60, Adventure | 1 pcs | [Gens ace GEA8504S60X6GT](https://gensace.de/products/gea8504s60x6gt) | €16,99 | verified |  |
| battery_large 1S | — | — | — | unverified | No official pack of this size found. |
| Gens ace 2200mAh 2S 30C 7.4V LiPo, XT60, Soaring | 1 pcs | [Gens ace GEA222S30X6GT](https://gensace.de/products/gens-ace-g-tech-soaring-2200mah-7-4v-30c-2s1p-lipo-battery-pack-with-xt60-plug) | €14,99 | verified |  |
| Gens ace G-Tech Soaring 2200mAh 11.1V 30C 3S1P LiPo, XT60 | 1 pcs | [Gens ace GEA223S30X6GT](https://gensace.de/products/gens-ace-g-tech-soaring-2200mah-11-1v-30c-3s1p-lipo-battery-pack-with-xt60-plug) | €19,99 | verified |  |
| Gens ace 2200mAh 4S 30C 14.8V LiPo, XT60, Soaring | 1 pcs | [Gens ace GEA224S30X6GT](https://gensace.de/products/gens-ace-g-tech-soaring-2200mah-14-8v-30c-4s1p-lipo-battery-pack-with-xt60-plug) | €27,99 | verified | Longest pack (107 mm): the battery tray must fit it inside the 180 mm print volume. |

## Locomotion
| Part | Qty | Source | Price shown | Status | Notes |
|---|---|---|---|---|---|
| Pololu Wheel 60×8mm Pair - Black | 2 pair | [Pololu #1420](https://www.pololu.com/product/1420) | US$6.75 | verified | Game size S. Press-fits the gearmotor shaft. |
| Pololu Wheel 80×10mm Pair - Black | 2 pair | [Pololu #1430](https://www.pololu.com/product/1430) | US$8.75 | verified | Game size M. |
| Pololu Wheel 90×10mm Pair - Black | 2 pair | [Pololu #1435](https://www.pololu.com/product/1435) | US$9.49 | verified | Game size L. The largest wheel in this family is 90 mm; no 100 mm version exists. |
| Printed TPU off-road tread on Pololu wheel hubs (design proposal) | 4 pcs | — | — | design | No official knobbly tyre exists for this shaft family. Proposal: print a TPU tread over the Pololu hub of the chosen size. Needs a printer that handles TPU. |
| Pololu 30T Track Set - Black | 1 set | [Pololu #3033](https://www.pololu.com/product/3033) | US$17.49 | verified | Fits micro metal gearmotors. One motor drives each side; idlers replace the other two. |

The game's 100 mm wheel maps to the real 90 mm Pololu wheel, the largest in the family.

## Game parts → real parts
| Game part | Real part | Source | Price shown | Status | Notes |
|---|---|---|---|---|---|
| `ultrasonic` | HC-SR04 Ultrasonic Sonar Distance Sensor + 2 x 10K resistors | [Adafruit (vendor of generic HC-SR04) HC-SR04 (Adafruit PID 3942)](https://www.adafruit.com/product/3942) | $3.95 USD | verified | The included resistors divide the 5 V Echo signal for Pi GPIO. |
| `imu` | Adafruit MPU-6050 6-DoF Accel and Gyro Sensor - STEMMA QT Qwiic | [Adafruit MPU-6050 (PID 3886)](https://www.adafruit.com/product/3886) | $12.95 USD | verified |  |
| `camera` | Raspberry Pi Camera Module 3 | [Raspberry Pi Camera Module 3 (standard)](https://www.raspberrypi.com/products/camera-module-3/) | Available from $25 | verified | The Pi 5 uses the smaller 22-pin camera connector; check the cable. |
| `moisture_probe` | Gravity: Analog Capacitive Corrosion Resistant Soil Moisture Sensor | [DFRobot SEN0193](https://www.dfrobot.com/product-1385.html) | $5.90 | verified | Analog output: the Pi 5 needs an external ADC. |
| `scout_drone` | Crazyflie 2.1+ | [Bitcraze AB Crazyflie 2.1+](https://store.bitcraze.io/products/crazyflie-2-1-plus) | $240.00 USD | verified | A separate flying robot with its own controller and battery, not a plug-in sensor. |
| `winch` | Winch motor: 1000:1 Micro Metal Gearmotor HP 6V with Extended Motor Shaft (spool printed) | [Pololu #2373](https://www.pololu.com/product/2373) | US$36.95 | verified | DIY winch: motor + printed spool + line. Keep loads under 2.5 kg·cm. Needs its own motor-driver channel. |
| `waterproof_case` | 1554J2GY polycarbonate watertight enclosure | [Hammond Mfg. 1554J2GY](https://www.hammfg.com/part/1554J2GY) | — | verified | Closest size match. Hammond sells through distributors, so the page shows no price. |
| `bumper` | Bumper Switch Kit for Romi/TI-RSLK MAX (Not Soldered, Left or Right) | [Pololu #3678](https://www.pololu.com/product/3678) | US$9.95 | verified | One left and one right kit. The rover needs a printed bumper mount. |
| `thruster_kit` | T200 Thruster | [Blue Robotics T200 (BR-102911-001)](https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/) | From: $230.00 | experimental | Real, but oversized for a 1.5 kg rover (427 g, hundreds of watts) and needs an ESC. No smaller official thruster found. |
| `piston_jump` | Spring-loaded jump piston (DIY concept) | — | — | experimental | No purchasable part does this. A small solenoid gives about 0.06 J; a 10 cm hop for 1.5 kg needs about 1.5 J. |

## Alternatives
| Part | Qty | Source | Price shown | Status | Notes |
|---|---|---|---|---|---|
| 5V, 5.5A Step-Down Voltage Regulator D36V50F5 | 1 pcs | [Pololu D36V50F5 (#4091)](https://www.pololu.com/product/4091) | US$39.95 | verified | 2S–4S alternative that meets the Pi 5's 5 A spec. Step-down only, so not for 1S. |
| WQ-38 Hinged Waterproof Box | 1 pcs | [Polycase WQ-38](https://www.polycase.com/wq-38) | $27.51 | verified | Alternative with a listed price. Taller (87 mm): the battery stacks above the Pi. |

## Locked parts (coming soon in the game)
| Part | Scenario | Source | Price shown | Notes |
|---|---|---|---|---|
| RPLIDAR C1 | earthquake rubble | [Slamtec RPLIDAR C1](https://www.slamtec.com/en/C1) | — | Maps rubble and corridors in 2D. Slamtec sells through distributors. |
| Raspberry Pi Camera Module 3 NoIR | night | [Raspberry Pi Camera Module 3 NoIR](https://www.raspberrypi.com/products/camera-module-3/) | Available from $25 | No IR filter: sees in the dark with infrared lighting. |
| Adafruit MLX90640 IR Thermal Camera Breakout - 55 Degree | fire | [Adafruit MLX90640 (PID 4407)](https://www.adafruit.com/product/4407) | $74.95 | Finds hot spots and body heat. Out of stock when checked. |
| Adafruit VEML7700 Lux Sensor - I2C Light Sensor - STEMMA QT / Qwiic | night | [Adafruit VEML7700 (PID 4162)](https://www.adafruit.com/product/4162) | $4.95 | Tells the brain when to switch to night vision or lights. |
| MightyOhm Geiger Counter kit | nuclear | [MightyOhm Geiger Counter kit with SBM-20 tube](https://mightyohm.com/blog/products/geiger-counter/) | $99.95 USD | Kit with tube, no case. Ships from the US. |
| Adafruit BME688 - Temperature, Humidity, Pressure and Gas Sensor - STEMMA QT | fire | [Adafruit BME688 (PID 5046)](https://www.adafruit.com/product/5046) | $19.95 | VOC readings work as smoke and air-quality cues. |
| Adafruit Ultimate GPS Breakout - 66 channel w/10 Hz updates - PA1616S | navigation | [Adafruit Ultimate GPS PA1616S (PID 746)](https://www.adafruit.com/product/746) | $29.95 USD | Outdoors only; no fix indoors or under rubble. |
| VL53L1X Time-of-Flight Distance Sensor Carrier with Voltage Regulator, 400cm Max | earthquake rubble | [Pololu #3415](https://www.pololu.com/product/3415) | US$22.95 | Precise close-range distance in cluttered spaces. |
| Stepper Motor: Unipolar/Bipolar, 200 Steps/Rev, 42×48mm, 4V, 1.2 A/Phase | precision | [Pololu #1200 (NEMA 17)](https://www.pololu.com/product/1200) | US$43.12 | Precise positioning (arms, turrets). Heavy at 350 g; needs a stepper driver. |
| Brushless DC Motor with Encoder 12V 159RPM | rough terrain | [DFRobot FIT0441](https://www.dfrobot.com/product-1364.html) | $19.90 | Driver built in, so no separate ESC. Suits a 3S pack. |
| Micro Servo - High Powered, High Torque Metal Gear - TowerPro MG92B | search and rescue | [TowerPro (sold by Adafruit) MG92B (Adafruit PID 2307)](https://www.adafruit.com/product/2307) | $11.95 USD | Two for a pan-tilt camera mount. |
| Adafruit I2S MEMS Microphone Breakout - SPH0645LM4H | earthquake rubble | [Adafruit SPH0645LM4H (PID 3421)](https://www.adafruit.com/product/3421) | $6.95 USD | Listens for calls or tapping from survivors. |
| Arduino UNO R4 WiFi | — | [Arduino UNO R4 WiFi](https://store.arduino.cc/products/uno-r4-wifi) | €30.50 (VAT incl.) | Alternative real-time controller: runs motors and sensors without a Pi; no camera or onboard AI. |
| Sharp/Socle GP2Y0A21YK0F Analog Distance Sensor 10-80cm | navigation | [Pololu (vendor) #136](https://www.pololu.com/product/136) | US$12.95 | Infrared distance sensor. Analog output: the Pi 5 needs an ADC. |
| 4-AA Battery Holder | — | [Pololu (vendor) #1153](https://www.pololu.com/product/1153) | US$2.99 | Simplest power option for a light test build; no balance charging, low current. |

## Fab Lab tools
| Tool | Used for | Source | Price shown | Notes |
|---|---|---|---|---|
| Bambu Lab A1 mini | prints every MK-II chassis part (180 mm bed) | [Bambu Lab A1 mini](https://eu.store.bambulab.com/products/a1-mini) | €199.00 EUR / €319.00 EUR | Two prices shown, likely base and Combo; the page does not label them. |
| Bambu Lab A1 | prints the chassis parts | [Bambu Lab A1](https://eu.store.bambulab.com/products/a1) | €339,00 EUR / €429,00 EUR | Two prices shown without labels. |
| Bambu Lab P1S | prints the PETG chassis in an enclosure | [Bambu Lab P1S](https://eu.store.bambulab.com/products/p1s) | €849,00 EUR / €999,00 EUR | Build volume from the official US store page. |
| Bambu Lab P2S | prints the PETG chassis in an enclosure | [Bambu Lab P2S](https://eu.store.bambulab.com/products/p2s) | €749.00 EUR |  |
| Bambu Lab H2D | prints two materials in one job (dual nozzle) | [Bambu Lab H2D](https://eu.store.bambulab.com/products/h2d) | €2.199,00 EUR | 350×320×325 mm is the combined volume of both nozzles. |
| xTool S1 Enclosed Diode Laser Cutter | cuts plywood or acrylic deck plates and engraves labels | [xTool S1](https://www.xtool.eu/en-es/products/xtool-s1-laser-cutter) | €1.814,00 (Basic Bundle) | Out of stock when checked. Bundle price only. |
| PINECIL Smart Mini Portable Soldering Iron (Version 2) | solders motor leads, encoders and headers | [PINE64 Pinecil V2](https://pine64.com/product/pinecil-smart-mini-portable-soldering-iron/) | Community price: $25.99 |  |
| Siglent SDS804X HD | debugs motor PWM and encoder signals | [Siglent SDS804X HD](https://www.siglenteu.com/digital-oscilloscopes/sds800x-hd-digital-storage-oscilloscope/) | €409 | VAT not stated. |
| Fluke 107 Pocket Digital Multimeter | checks pack voltage and wiring continuity | [Fluke 107](https://www.fluke.com/es-es/producto/comprobacion-electrica/multimetros-digitales/fluke-107) | — | Spanish page shows no price; sold through distributors. |
| Siglent SPD1305X Programmable DC Power Supply | powers the electronics on the bench with a current limit | [Siglent SPD1305X](https://www.siglenteu.com/power-supplies/spd1000x-series-programmable-dc-power-supply/) | € 249 | VAT not stated. |
| ISDT 608AC Smart Charger | balance-charges the 1S–4S LiPo packs | [ISDT 608AC](https://www.isdt.co/608ac.html) | — | Mains-powered; covers every pack in this BoM. |

## Engineering caveats
- Pololu's Raspberry Pi motor drivers fit the 40-pin header; their pages do not name the Pi 5. Check GPIO/PWM library support on the Pi 5 before wiring.
- 4S: the 12 V HPCB motors are overvolted by a full pack. Cap PWM at about 70 %.
- 1S: needs the DRV8835 driver, 6 V MP motors and the LV switch, and there is no official ~2200 mAh 1S pack. 1S is a light build only.
- The winch needs its own motor-driver channel; the drive driver's two channels are taken by the wheels.
- `thruster_kit` (Blue Robotics T200) is real but oversized for a 1.5 kg rover. `piston_jump` has no buyable equivalent. Both stay in the game, marked experimental.
- Game stats (mass, cost, power) are tuned for play and are not these real specs.
- Printed parts, grams and print hours come from `docs/inputs/printed-parts.json` (Blender agent). Bambu Studio's CLI writes print time and filament grams to `result.json` when slicing (`--slice`).
