# Jev — integration notes

Source: the official TypeSafe docs at https://docs.typesafe.ai, read on 2026-10-09 (pages: Introduction, Quick start, Jev with coding agents, System One, Primitives, Choice, Confidence, Models, API reference, Jev 1.13 jaggedness, JavaScript SDK + `TypeSafeClientConfig` / `RetryPolicy`).
Everything below is taken from those pages. Anything the docs do not state is marked UNKNOWN. Nothing here has been verified with a live call yet (`scripts/jev-smoke.ts` in the brain session does that).

## Gate result
- Callable over HTTP from a Node.js server: **yes** (plain `POST`, JSON, bearer token; an official JS SDK for Node ≥ 20 also exists).
- Per-option probabilities exposed: **yes** (Choice answers return `probabilities`, a map of every option to a float, summing to 1).

## What Jev is
A "System One" decision model. It does not generate text. It takes a `state` plus a map of typed `questions` (Choice, Score, Noul) and returns one typed answer per question. RivetRun uses one **Choice** question per decision point.

## Auth
- Header: `Authorization: Bearer <API_KEY>`.
- Keys are created at https://console.typesafe.ai/keys.
- The SDK reads `TYPESAFE_API_KEY` by default. RivetRun stores the key as `JEV_API_KEY` and passes it explicitly (server-side only). The SDK refuses browser use unless explicitly allowed; we never allow it.

## Endpoints
| Method | URL | Purpose |
| - | - | - |
| POST | `https://api.typesafe.ai/v1/systemone` | Evaluate `state` against `questions` |
| GET | `https://api.typesafe.ai/v1/models` | List model names/aliases available to the account |

Headers for POST: `Authorization: Bearer <API_KEY>`, `Content-Type: application/json`.

## Request — single-choice question
Top level: `state` (string | object | array, required), `model` (string, required), `questions` (map of id → Question, required). The question id is chosen by us, is not sent to the model, and keys the answer.

Choice question: `type: "choice"`, `instructions` (string | object | array, required), `criteria` (map of option → string | object | array | null, required; max 255 options; `null` when an option needs no description).

Shape RivetRun will send (field contents are ours, the structure is the documented one):

```json
{
  "model": "jev-1.13.0",
  "state": {
    "perceived": { "terrainAhead": "mud", "obstacleAheadM": "unknown", "slipPct": 12 },
    "robot": { "speedMps": 1.4, "batteryPct": 71, "damagePct": 8 },
    "priority": "safety"
  },
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "Which driving action should the robot take next, given `priority`?",
      "criteria": {
        "cruise": "Hold current speed. Predicted: progress 2.1 m, damage +0 %, energy 0.4 %",
        "slow_down": "Reduce speed. Predicted: progress 1.2 m, damage +0 %, energy 0.3 %",
        "brake": null
      }
    }
  }
}
```

`instructions` and each `criteria` value may be structured objects; data fields are referred to by name in backticks.

## Response — Choice answer

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "action": {
      "type": "choice",
      "choice": "slow_down",
      "probabilities": { "cruise": 0.12, "slow_down": 0.88, "brake": 0.0 },
      "confidence": 0.82
    }
  },
  "usage": { "input_tokens": 318, "output_tokens": 34 }
}
```

- `choice`: the highest-probability option (the argmax is already applied by the API).
- `probabilities`: every option → probability, floats summing to 1.
- `confidence`: 0–1, derived from the probabilities: `(p_max − 1/n) / (1 − 1/n)` for `n` options.
- `model`: the versioned id that actually answered (log it).
- `usage`: `input_tokens`, `output_tokens`.

(The numbers in the example above are illustrative, in the documented shape; they are not a measured response.)

## Model id to pin
- Pin **`jev-1.13.0`**.
- Aliases: `jev-latest` → `jev-1.13.0`, `jev-preview` → `jev-1.13.0` (both move when a release ships). The docs say to pin the versioned id when behaviour must not change under you; versioned ids are accepted even if `GET /v1/models` lists only aliases.

## Latency
- No latency SLA or official figure is published: **UNKNOWN**.
- One data point in the docs: the "Self-consistency: choices" cookbook reports a mean round-trip of **114 ms** for a Choice call in that run (15 samples, sequential). Treat it as indicative only; measure ours in `jev-smoke.ts` and the benchmark.
- SDK default timeout is 10 000 ms per attempt with 2 retries. That is far above the spec's 1200 ms budget, so we must set our own timeout (1200 ms) and `maxRetries: 0` (or use `fetch` + `AbortController`).

## Rate limits (Jev 1.13)
- 100K tokens per second and 80 requests per second. Over either → `429 Too Many Requests`.
- The docs warn that limits "are adjusting dynamically" and can change without notice.
- Whether these limits are per key, per account or per plan tier: UNKNOWN.
- `retry-after` header: the SDKs honour it "when the response carries one".

## Errors
| Status | Meaning |
| - | - |
| 401 | Missing or invalid API key |
| 422 | Request body failed validation (body details the offending field) |
| 429 | Rate limit exceeded; back off and retry |
| 529 | TypeSafe temporarily overloaded; retry after a short delay |

Exact JSON error body schema: UNKNOWN (docs say only "a JSON body describing what went wrong").

## Pricing (Jev 1.13)
- $0.042 per million input tokens ($42 per billion). Output tokens are free.
- Free tier / trial credits / hackathon quota: UNKNOWN.

## Limits
- Context: 64k tokens per request (state + all questions); 32k for state + the single longest question.
- Text only (string, JSON object or array of text values).
- Max 255 options per Choice.

## JavaScript SDK (optional)
- Package `@typesafe-ai/sdk` (npm shows 0.6.0), Node ≥ 20, ESM + CJS + types.
- `new TypeSafeClient({ apiKey, defaultModel, timeout, ... })`, `client.systemOne({ state, questions })`, helper `choice(instructions, criteria)`.
- Retry defaults: 2 retries on 408, 429, 500–599, connection errors and timeouts; backoff 500 ms doubling to 5000 ms.
- Either the SDK or a direct `fetch` works for us; a direct `fetch` keeps the 1200 ms budget explicit.

## Documented model caveats that affect RivetRun (Jev 1.13 jaggedness)
- **Numbers:** "Jev is not a calculator". It handles semantic representations better than numeric ones; the docs recommend doing maths in code and passing "the computed number or a named bucket". Our lookahead numbers are computed in code; the brain session should consider adding named buckets (e.g. `damage: "none" | "light" | "heavy"`) next to the raw numbers.
- **Choice option order:** the model can lean toward the option listed first. The docs suggest reordering to check consistency. Do not always list the same action first without testing it.
- **Literal reading:** state the exact condition in `instructions`; put boundary cases in `criteria`.
- **Large state:** send only the fields the question needs.

## Still UNKNOWN (not in the docs read)
- Official latency figures / SLA and server region(s).
- Scope of rate limits (per key vs account) and any free quota.
- Error body schema.
- Whether responses are deterministic for identical requests.
- CORS behaviour (irrelevant for us: calls are server-side only).
