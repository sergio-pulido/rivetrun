# RivetRun — Brain Arena (decided Sat 03:20)

Marker: RR-ARENA

Goal: same robot, same seed, same sensors, same question, different brains. Measure decision quality and decision speed. Builds on docs/BRAIN_V3_SENSING.md (RR-BRAIN-V3).

## Contestants
- Jev (TypeSafe), the heuristic driver, random.
- LLM adapters. Anthropic first: claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5. OpenAI, DeepSeek or others only when the human adds a key and gives the exact model IDs; no model ID is guessed.
- Humans: from logged Drive-mode runs on the same mission, build and seed.

## Fairness rules
- Same Observation (RR-BRAIN-V3), same options, same question text. Each provider gets it as plain text plus a JSON schema for the answer: { choice, confidence 0..1 }.
- Temperature 0 where supported. One call per trigger. No tools. No extended reasoning unless the entry is labelled "(reasoning)".
- Latency is real and applied in sim time: the robot holds its last command until the answer arrives.
- No heuristic fallback in the arena, for any contestant, Jev included. A hard timeout of 10 s counts as "no decision".
- Keys only in apps/web/.env.local (ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY), never committed, logged or sent to the client. A provider without a key is skipped and shown as "not configured".

## Runs
- Offline first: M1–M7 × 3 seeds × each contestant, on the default build, plus Deep Diver on M6.
- Results go to docs/ARENA.md and a JSON the app reads, with the date, model IDs and a hash of the prompt template.
- Metrics: finish %, mean score, time, damage, scans done, decisions per run, p50 and p95 latency, crashes after a late decision (hazard reached before the answer arrived), cost per run when the provider reports usage.
- Live, stretch only: a /screen "Arena" race with up to 4 brain bots on one seed, each lane labelled with its model and its latest latency.

## Display
- /lab "Brain Arena": the results table, a latency-vs-score scatter, and the line "Our sim, our prompts, N runs, <date>. Not a general model ranking."
- Stretch: the telemetry console shows each contestant's decision thread when watching an arena replay.

## Ownership
- brain: provider adapters (Anthropic first), shared prompt builder, arena runner script, results JSON and docs/ARENA.md, /screen arena mode (stretch).
- sim: runHeadless accepts async policies with latency applied in sim time (the RR-BRAIN-V3 mechanism), and a no-fallback mode.
- ui: the /lab Brain Arena section.

## Priority
P2, by 13:00, after the RR-BRAIN-V3 P1 work. Offline arena first; live arena only if time remains before the 14:00 freeze.
