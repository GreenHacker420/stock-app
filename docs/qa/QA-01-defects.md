# QA-01 Gates and Defects

Severity:

- `P0`: data isolation/corruption, release blocked.
- `P1`: core functional failure, release blocked.
- `P2`: mobile UX failure in core workflow.
- `P3`: cosmetic/low impact.

| Gate ID | Severity | Gate | Execution | Why It Blocks Release | Required Evidence | Existing Automated Coverage | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QA01-GATE-001 | P1 | Real Android lifecycle validation not yet executed | Run scenarios QA01-001 through QA01-017 on Android dev/internal build | Device was not available in this automated environment | Pending manual device QA | Existing automated tests cover contracts, not native lifecycle | OPEN |
| QA01-GATE-002 | P1 | Staging failure-recovery validation not yet executed | Run Redis outage and backend restart scenarios in local/staging only | External service control not exercised in this environment | Pending staging QA | Existing backend tests cover Redis fallback and dispatcher retry contracts | OPEN |
| QA01-GATE-003 | P2 | Large-dataset performance not yet measured in production-like build | Load synthetic 5k customer / 10k item / 100 category dataset and profile with dev mode disabled | Requires synthetic dataset and Android build/profile run | Pending performance QA | Selector micro-measurements exist from DATA-02 only | OPEN |
| QA01-GATE-004 | P2 | 320px critical UI smoke not yet executed after data architecture changes | Run critical workflow list on small Android viewport/device | Requires device/emulator visual QA | Pending mobile UI QA | UI typecheck cannot verify layout/keyboard overlap | OPEN |
| QA01-GATE-005 | P2 | Accessibility smoke not yet executed | Enable TalkBack and inspect critical workflows | Requires real Android accessibility QA | Pending accessibility QA | No automated accessibility suite exists | OPEN |

Known pre-existing functional blockers, not introduced by QA-01:

| Defect ID | Severity | Scenario | Reproduction | Root Cause | Fix | Regression Test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BLOCKER-FUNCTIONAL-01 | P1 | `OrderDetail` convert-to-sale path can report fake success | Trigger convert-to-sale path in `OrderDetail.tsx` | Placeholder `Promise.resolve({})` conversion mutation | Separate functional implementation required | Add integration test for real conversion mutation | OPEN |
| BLOCKER-FUNCTIONAL-02 | P1 | `DailySummary` PDF export fake success path | Trigger PDF export flow | Pre-existing fake success behavior | Separate functional implementation required | Add PDF export integration test | OPEN |
