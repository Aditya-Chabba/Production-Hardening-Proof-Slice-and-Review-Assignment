# PromptPilot: Circuit Breaker (Production-Hardening Proof Slice)

## 1. Risk addressed
When the model provider is failing or slow, every ticket still waits on a doomed call. Calls pile up and the whole reply path degrades.

## 2. Chosen control
A circuit breaker in `src/circuitBreaker.js` (`createCircuitBreaker`). `src/replyService.js` wraps the provider call with it and returns a safe fallback when it trips.

## 3. How to run / test
`node --test` (Node 18+). Expected: 8 tests, 8 pass, 0 fail.

## 4. Evidence
`test/circuitBreaker.test.js`:
- "opens once failures cross the threshold with enough volume"
- "short-circuits without calling the dependency while open"
- "probes after the open window and closes on a successful probe"
- "a failed probe re-opens the circuit"
- "degrades to a safe fallback once the circuit opens"

## 5. Observability note
Counters: `metrics.breaker_open_total` rises on every trip to OPEN and `metrics.short_circuited_total` rises on every blocked call. `onStateChange(state)` fires on each transition (CLOSED, OPEN, HALF_OPEN). Fallback replies carry `reason: 'circuit_open'` or `'provider_error'`. Nothing logs ticket text, tokens or personal data.

## 6. Trade-off
While open, healthy requests also get the fallback, so users see "queued for a human agent" instead of a model draft until the probe succeeds.

## 7. Remaining risk
- It does not cover a provider that is slow but not failing (no timeout).
- It does not cover wrong or low-quality model output.
- State is in memory per process, so each instance trips on its own.
- Settings are not tuned to real traffic.

## 8. How this control protects Modules 1–3
It protects the earlier decision that the ticket path must stay alive when the model provider fails. The fallback sends the ticket to a human agent instead of dropping it.