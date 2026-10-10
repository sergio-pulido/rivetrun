# RivetRun — Sound pack (decided Sat 13:15)

Marker: RR-SOUND

Split:
- Procedural WebAudio (apps/web/src/game/audio/sfx.ts) stays for everything tied to the frame: engine, slip, impacts, scans, warnings, jump. It reacts instantly and costs no bytes.
- ElevenLabs adds what code cannot: ambience per place, an announcer for the big screen, and short stingers.

## Files
Output: apps/web/public/sfx/<name>.mp3 at 128 kbps, mono for SFX and stereo for ambience. The whole pack stays at or under 2.5 MB, and each file is lazy-loaded only on the screen that uses it.

### Ambience loops (Sound Effects, 20 s each, seamless loop; crossfade in code if the clip does not loop cleanly)
| name | where | prompt |
|---|---|---|
| amb_m7_quake | /run M7 | Aftermath of an earthquake in a ruined city: low distant rumble, settling debris and small concrete crumbles, wind whistling through broken buildings, far-off sirens fading in and out, no music, no voices |
| amb_m9_polar | /run M9 | Polar research station at night: steady howling wind, ice creaking, faint metallic hum of a generator, light snow hiss, no music, no voices |
| amb_storm | /run M8 and rain missions | Heavy rain on open ground with gusting wind and distant rolling thunder, no music, no voices |
| amb_workshop | /workshop | Quiet maker workshop: soft hum of a 3D printer working, a small fan, occasional click of tools on a bench, calm and warm, no music, no voices |
| amb_arena | /screen race and play modes | Indoor robotics arena before a race: low electronic hum, soft crowd murmur, occasional excited cheer, no music, no voices |

### One-shots (Sound Effects)
| name | length | where | prompt |
|---|---|---|---|
| fx_quake_tremor | 4 s | M7 start | Strong earthquake aftershock: deep rumble swelling and fading, rattling debris and glass |
| fx_race_go | 1.5 s | /screen at the start | Electronic race start horn, bright and punchy |
| fx_win_sting | 2.5 s | result: win | Short triumphant synth fanfare, modern, upbeat |
| fx_lose_sting | 2 s | result: not first | Short playful descending synth jingle, light, not sad |
| fx_photo_finish | 2 s | /screen, gap under 0.5 s | Camera flash burst with a rising whoosh |

### Announcer (Text to Speech, one energetic premade English voice, used only on /screen, never on phones)
| name | line |
|---|---|
| vo_countdown | Three. Two. One. Go! |
| vo_jev_lead | Jev takes the lead! |
| vo_human_lead | A human takes the lead! |
| vo_photo_finish | Photo finish! |
| vo_ai_wins | The AI wins it! |
| vo_human_wins | The human wins it! |
| vo_best_combo | New best combo of the day! |
| vo_thinking | Too slow: still thinking! |

`vo_thinking` plays when a lane's brain reaches a hazard before its answer arrives (a late decision). It is the thesis, said out loud.

## Playback rules
- One small module, apps/web/src/game/audio/samples.ts: load on demand, loop with a crossfade, one-shots, ducking (ambience drops by 6 dB while the announcer speaks).
- It respects the existing HUD mute toggle and starts only after a user gesture.
- Phones: ambience at a low level and no announcer, because 40 phones in one room must not drown the projector. /screen: ambience, announcer and stingers.
- If a file fails to load, stay silent and keep the procedural sound.
- Credit in /lab "How it was built": "Ambience, announcer and stingers: ElevenLabs. Engine and event sounds: procedural WebAudio."
