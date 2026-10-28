# Server quality and capacity work order

Status: implementation and verification in progress. Baseline source: `074c7a6e94ca0f57c887a0eacdcdfba79bd97ab4`.

## Problem and intended behavior

The October 27–28 isolated retest did not qualify any of 17 gameplay workloads against all chosen latency, delivery, correctness, and presence gates. Authentication and identity refresh repeatedly parse file-backed stores; durable mutations rewrite unrelated records; active-world geometry is evicted and rebuilt once the room count exceeds small caches. These costs delay simulation and responses even while the HTTP health endpoint responds.

The changes must reduce those costs while retaining existing game rules, collision, active populations, session revocation, ownership, idempotent financial receipts, checkpoints, and backup/import compatibility. A lower measured cost does not by itself establish production capacity.

## Authorized implementation

1. Profile the existing server and simulation using isolated synthetic data. Retain source and harness provenance.
2. Move human credential and legacy-session derivation off the event loop without reducing existing PBKDF2 parameters. Use versioned verifiers appropriate to newly generated high-entropy opaque session secrets, retaining legacy readers and explicit issuance controls. Validate cached store snapshots against filesystem changes and preserve immediate revocation across store instances.
3. Deduplicate concurrent identity refreshes; reuse already materialized server-side RPG state. Clear identities after restore and existing avatar invalidation paths.
4. Batch queued user transactions behind one atomic commit while preserving each operation's rollback, receipt, response isolation, and acknowledgment boundary. Avoid rewriting unchanged account materialization.
5. Journal changed room records and persist only dirty rooms during periodic checkpoints. Keep forced canonical JSON checkpoints for backups and administrative export. Recover committed journal records after abrupt restart.
6. Retain collision and manifest resources for active rooms, release expired rooms, and avoid repeated same-step initialization. Keep standalone collision cache limits and all simulation features.
7. Separate eligible walking controls from scheduled simulation, retain short jump edges, and negotiate exact-content snapshot reuse with complete client hydration and legacy fallback.
8. Reuse world-directory results only while their inputs, ownership, atlas, and persisted generation match; project fresh population data without copying geometry and player histories.
9. Run correctness and integration regressions, equivalent gameplay workload pressure tests, storage growth, restart recovery, and admission pressure. Fix regressions before committing.

## Qualification gates

| Area | Acceptance |
| --- | --- |
| Real HTTP gameplay | p95 ≤100 ms; p99 ≤250 ms; ≥95% of offered 20 Hz input slots delivered by deadline; ≥99% completed requests successful; valid snapshots and all expected players present before and after |
| Current client protocol | Negotiate protocol 2 as the browser does, hydrate against the request's acknowledged baseline, and include hydration in response/delivery timing. Require general-world snapshot frame-age p95 ≤100 ms so fast acknowledgments cannot hide a stalled simulation. Native sports APIs are measured separately. |
| Room admission | Verify live presence and existing admission limits; cumulative acknowledged joins alone do not qualify a player count |
| Economy and ownership | Exactly-once spend receipts, conserved balances under competing purchases, no overdrafts or foreign-owner mutations, failed operations isolated |
| Sessions | Existing derivation strength; revoked, expired, removed or corrupted credentials fail closed; no cross-session CSRF acceptance |
| Restart and backup | Checked session, inventory, balance, published map and checkpointed position survive hard restart; forced export remains restorable |
| Simulation compute | Real collision/NPC simulation, unchanged light-world fixtures, 50 ms update budget; 1/15/128/1,000/10,000 populations reported separately |
| Admission bursts | Retain offered/issued/unissued/acknowledged counts and deadline throughput; generator backpressure is not a server rejection |

The 20-tick simulation sample is one simulated second. Short runs are qualification evidence for that workload, not a sustained public-launch certificate. Browser/GPU/VR performance, WAN conditions, live payment settlement, power-loss durability, and a multi-host fleet require separate tests.

The second iteration retains all original input/delivery/validity gates and adds frame freshness. Its negotiated wire payload changes while the hydrated gameplay state stays complete. Historical latency and payload measurements therefore compare implementations/protocols rather than identical wire bytes.

## Deployment and architecture boundaries

This work preserves the current Node runtime range and JSON backup interfaces. Local queues, journals, and caches do not turn file storage into a multi-host transactional database. A future room fleet needs exclusive room ownership/routing, shared transactional identity/economy storage, coordinated invalidation and recovery, and representative end-to-end fleet tests. No production deployment, external platform pressure test, payment, or infrastructure purchase is part of this work order.

## Evidence and completion

Baseline: `work/server-pressure/retest-20261027/report.html`. New profiles and checks: `work/server-quality/`.

Before the implementation commit, record the final changed behavior, executed commands, results, qualified workloads, remaining failed gates, and operational constraints here. Do not lower gates, shrink fixtures, disable gameplay features, or describe synthetic simulation players as authenticated live clients.
