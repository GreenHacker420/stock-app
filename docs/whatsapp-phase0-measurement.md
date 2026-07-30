# WhatsApp Phase 0 measurement gate

Fixture source: `stock/src/modules/whatsapp/benchmark-fixtures.ts`

The deterministic fixture contains 1,000 conversations, 10,000 mixed messages,
300 rapid versioned status events, a duplicate/missing-event batch, an
AppState-flapping sequence, and weak/high-latency network profiles.

Real-device results are intentionally not fabricated. Record results for the
reference Android and iOS devices before approving the Phase 1 timeline or
SQLite rollout:

| Measurement | Android | iOS |
|---|---:|---:|
| Cold render, 1,000 conversations | Pending | Pending |
| Open 10,000-message conversation | Pending | Pending |
| Prepend 50 rows, anchor retained | Pending | Pending |
| Apply 300 rapid status events | Pending | Pending |
| Reconcile duplicate/missing events | Pending | Pending |
| Background/foreground flapping | Pending | Pending |
| Weak/high-latency send lifecycle | Pending | Pending |
| Background sustained CPU/network activity | Pending | Pending |

Capture device model, OS version, build profile, wall time, JS/UI frame
metrics, peak memory, and energy/network traces with each result.
