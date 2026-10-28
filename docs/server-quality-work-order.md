# Server quality and capacity work order

Status: runtime fixes pushed to `main` in `7a1a203e`; current affected checks passed 19 selected files and 115 test cases, and all three build/static checks passed. Four of six sampled HTTP workloads and the checkpointed restart passed. Both current selected browser checks failed unresolved assertions. Capacity qualification remains partial. Earlier full runs remain attached to their original sources; they do not qualify the latest source. Baseline source: `074c7a6e94ca0f57c887a0eacdcdfba79bd97ab4`. Implementation checkpoint: `15b1febe208369e9175bd093ce45d3f56f3945f0`. Runtime corrections: `76faf548` and `928afd02`. Expanded collision and snapshot changes: `7ff7fd19`, corrected by `99e5059e`. Source-bound reporting and this work order were committed in `10382d28`.

## In-page travel and access recovery follow-up

Map selection now refreshes destination definitions and runs the existing scene teardown, fresh room join and readiness pipeline inside the current explorer page. Repeat visits also rebuild the scene; old clients, audio and projections are retired. Dedicated hockey and arcade applications keep their separate entry pages. A denied browser storage write no longer aborts world activation.

Expired access during active play opens the guest/sign-in choice over the retained map and restarts only after successful authorization. A late renewal cannot restart an obsolete world. Authentication and revocation remain enforced. Non-authentication action errors no longer default to a misleading sign-in message.

Generated speech network waits are bounded at eight seconds instead of sixty; existing installed-voice fallback and captions remain available. This does not establish zero-delay microphone communication or hardware/network performance. New executable transition tests cover fresh selection, repeat visits, join/readiness, denied storage and stale access replies. Previous capacity/browser failures remain open; this follow-up is not a new full-capacity qualification. Validation: nine selected Node files completed with 162 passed cases and one optional neural-generation integration skip, zero failures; production build and static dependency checks passed. Physical-device transition timing and live microphone latency were not measured.

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
9. Run correctness and integration regressions, equivalent gameplay workload pressure tests, storage growth, restart recovery, and admission pressure. Fix regressions before completing the implementation review.

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

### Integration with newer `main`

The main-branch push integrated remote `main` at `39e03d73`, which contained newer changes to geometry, resident planning, startup, audio and controls. The merge preserved those changes alongside the storage, authentication, scheduling and snapshot work. Collision retains lazy static faces, bounded placed variants and nearby mesh selection. Active resources are released only after their final owning room expires; a new two-room lifecycle regression checks this boundary. The regenerated registry contains 470 assets with no broken paths.

Viewer-specific resident filtering runs before protocol-2 component memoization. Review also found that builder room responses could expose saved conversations through their raw simulation records. Gameplay and builder responses now apply the same audience projection, including persisted personal memories, with owner/outsider and anonymous API tests. Stored conversations and builder geometry remain intact.

The recovery harness now captures balance, inventory and complete wallet receipts immediately before shutdown, compares exact saved state after restart, and records the earlier movement credits separately. This corrects the measurement boundary demonstrated below without altering historical artifacts. The integration subsequently received the runtime fixes and selected verification described below. Capacity measurements on an earlier source remain historical evidence.

### Latest affected source on `main` (`7a1a203e`)

Detectable software WebGL adapters now select the existing performance path before creating the main renderer, including its context-time antialiasing choice. Detection is cached separately for each power preference and releases its temporary probe context. The local map checks its own low-power adapter and disables multisample antialiasing only when that adapter is identified as software. Hardware map settings and named quality presets retain their existing selection rules. Renderer identifiers can be masked by browser privacy settings; these changes do not establish hardware or mobile frame-rate capacity.

Boat movement retains its three collision rays and exact placed-object raycast. It now prepares the actor exclusion map and native shot-collision view once within each synchronous blocked callback. The next callback refreshes membership and live poses. Custom collider overrides keep their original path, and a borrowed view cannot be used after its callback closes. This removes repeated preparation without reducing the number or changing the meaning of the collision tests.

The current application/assets/helper manifest is `9fd5af512fbb660b45787c481365f5628ad0c8eb177be010d43b96ce001c11e9`. Source-bound affected verification passed all 19 selected Node files and 115 cases, with no failures, skipped or cancelled cases, timeouts, blocked network events or runtime changes. This includes 12 software-quality cases and 12 local-map cases on the final boat bytes. Evidence: `work/server-quality/current-main/affected-current/results.json`. The selection covers 19 of 649 available files (`executionScope: selected`, `complete: false`); it is not another full-suite run. It was captured before committing the same runtime bytes in `7a1a203e`.

Fresh `build`, `check` and asset-registry checks all passed on these same runtime bytes, with no source changes (`work/server-quality/current-main/static-affected-release.json`). The unchanged transport-startup browser check failed its post-jump/ground-height assertion after 55.269 seconds. Its preceding input assertion passed: the look tap emitted no `jump:true` request. The final sampled local/server position was grounded at y≈0.22 with zero vertical velocity, matching a 0.20-high terminal floor plus the 0.02 walking gap. The fixture compares later heights against its pre-keyboard-jump baseline; this result does not prove that look input generated a jump. The assertion remains unresolved and is not relabeled as a pass.

The originally planned world-input check then ran unchanged, without retrying transport, and failed after 44.664 seconds at the quest-selector movement-request assertion. It did not capture a qualifying forward POST during the 1.8-second press and 0.2-second release window. Position and focus assertions, and the later map controls, were not reached. Its traceback lacks queue, readiness and position samples, so it does not establish a runtime key-loss or focus defect. Both failures remain in `work/server-quality/current-main/browser-affected-current/results.json`, with unchanged fixture hashes and runtime. The earlier failed-only browser checkpoint and the continuation command are retained. No current map-interface pass is claimed.

The completed HTTP follow-up retained 20-second workloads, 241 synthetic accounts, offered 20 Hz controls and all latency, delivery, presence, hydration and applicable frame-age gates. Its runtime source stayed unchanged. Four of the six attempted workloads passed:

| Current sampled workload | Input response p95 | Offered inputs delivered by deadline | Result |
| --- | ---: | ---: | --- |
| Builder, 1 player | 15.458 ms | 99.500% | Pass; frame-age p95 45 ms |
| Builder, 5 players | 47.125 ms | 95.452% | Pass; frame-age p95 47 ms |
| Builder, 15 players | 247.192 ms | 35.567% | Fail |
| Hockey, 10 players | 7.014 ms | 99.475% | Pass; native frame clock unmeasured |
| Arcade, 2 players | 6.838 ms | 99.750% | Pass; native frame clock unmeasured |
| Mixed activity, 30 players | 718.729 ms | 14.342% | Fail; frame-age p95 156 ms |

The corrected checkpointed restart passed in 1,440.782 ms. Balance was 2,000 before movement, immediately before shutdown and after restart; inventory, complete wallet receipts, session, published map and saved position were preserved exactly. Movement credits were zero, so this run is a normal recovery proof. The earned-coin recovery case has not been repeated on this latest source; its `99e5059e` diagnostic remains historical only.

Evidence: `work/server-quality/current-main/qualification-main-http/http.json` and `workflow.json`; the process finished in 167.014 seconds. Exit code 1 reflects the two failed gameplay gates, not a server crash. Portable current report: `work/server-quality/current-main/qualification-main-http/report.html`. Separate historical report: `work/server-quality/current-main/historical-99/report.html`.

Construction recovery and live motion have earlier-source results only. This six-workload follow-up does not repeat the complete 17-workload, storage-growth, simulation or admission matrices. Untested environments and larger targets remain unqualified on current source, and no rendering-capacity pass is claimed.

### Earlier combined-source verification (`4e61968f` / fixture corrections `6a9127d1`)

The earlier full 647-file run and its seven fixture-only repairs are retained in `work/server-quality/current-main/regressions/results.json` and `work/server-quality/current-main/verification-resume.json`. After the source-bound resume, 645 files passed and two unchanged physics files retained their 270-second outer timeouts: `shipping-navigation.test.mjs` and `vehicle-auto-server.test.mjs`. The 645 complete TAP summaries report 3,668 passed cases and two optional skips; the timed-out files have no complete case totals. This was not a full correctness pass. The first complete Node command and the fixture-resume command both retain exit code 1.

On that source, all three build/static commands passed. Only construction recovery passed among the four isolated browser checks; live motion, transport startup and world-input recovery failed. Those results motivated the software-rendering and collision-preparation work above and remain historical failures, not current passes. The full 45-world walking/jump/escape matrix did pass all 46 Node cases in 423.453 seconds on that earlier source. Capacity must be reported separately from those correctness checks.

### Pre-integration full pressure matrix on `99e5059e`

The final campaign ran sequentially from 18:52:38 to 19:06:29 UTC on October 28, 2026. Evidence: `work/server-quality/qualification-cached/`. Its workflow binds all four families to unchanged runtime SHA-256 `738e46130d7736b97913e8b26eeea2aff5571c6db1539e18c27791e5b08c8e0e`, with commands, file manifest and harness fingerprints retained. Earlier iterations below remain separate historical evidence.

Two of 17 gameplay workloads passed every applicable gate. These short local passes establish only the tested workloads; they do not establish consistent public capacity.

| `99e5059e` workload | Input response p95 | Offered inputs delivered by deadline | Result |
| --- | ---: | ---: | --- |
| Builder, 1 player | 14.749 ms | 99.750% | Pass; frame-age p95 44 ms |
| Builder, 5 players | 66.840 ms | 75.300% | Fail |
| Builder, 15 players | 203.234 ms | 37.100% | Fail |
| Dense builder, 15 players | 291.925 ms | 24.950% | Fail |
| Multiple rooms, 30 players | 877.629 ms | 13.992% | Fail |
| Multiple rooms, 60 players | 1,065.413 ms | 8.158% | Fail |
| Multiple rooms, 120 players | 1,883.241 ms | 4.402% | Fail |
| Multiple rooms, 240 players | 8,008.070 ms | 0.279% | Fail |
| Commons, 15 players | 12,098.636 ms | 0.283% | Fail; presence also failed |
| Commons, 32 players | 6,790.010 ms | 1.805% | Fail |
| Commons, 64 players | 8,002.146 ms | 0.625% | Fail |
| Commons, 128 players | 8,261.340 ms | 0.094% | Fail; presence also failed |
| Airport, 15 players | 7,118.432 ms | 2.500% | Fail |
| Construction, 15 players | 4,916.415 ms | 2.617% | Fail |
| Hockey, 10 players | 14.627 ms | 67.275% | Fail |
| Arcade, 2 players | 10.497 ms | 99.625% | Pass; native API has no frame-age clock pair |
| Mixed activity, 30 players | 487.244 ms | 17.750% | Fail; frame-age p95 128 ms |

The separate 15-login burst returned 201 for all requests, with 838.428 ms p95. The mixed workload's 11 acknowledged spends reconciled exactly: balance 2,000 to 1,989 with all signed ledger entries included and no missing or duplicate spend receipts. Those checks do not override failed gameplay delivery.

The hard-restart check preserved the session, inventory, published map and exact saved position, but its balance comparison failed. The original failure remains in `http.json`; that artifact omitted the before/after balances and receipts, so its cause cannot be classified retrospectively.

Two separate instrumented hard-restart attempts preserved the exact balance immediately before shutdown and every wallet receipt. In the second, movement earned a signed `MZK_COIN` credit: the balance changed from 2,000 before movement to 2,001 before shutdown and remained 2,001 after restart. The original pre-movement equality therefore reported failure despite preserving the newly earned coin. This reproduces a measurement error without proving the cause of the original campaign's failure. Evidence: `work/server-quality/recovery-diagnostic.json` and `recovery-diagnostic-provenance.json`, with matching before/after runtime manifests, instrumented script and canonical harness hashes, exact command, Node version and result digest. The canonical pressure harness stayed unchanged throughout that completed campaign and regression run. The main integration subsequently corrects its measurement boundary, retains earlier movement credits as diagnostics, and compares exact pre-shutdown state after reopening; that new harness needs its own runtime verification.

Isolated simulation completed all 20 measured ticks for 1 / 15 / 128 / 1,000 players, with tick p95 of 8.140 / 12.968 / 16.487 / 356.574 ms. The first three stayed within the 50 ms budget; the 1,000-player case missed it on all 20 ticks. The 10,000-player run reached the unchanged 120-second ceiling after 18 of 20 measured ticks. Its maximum observed tick was 26,067.153 ms and sampled peak RSS approximately 1.45 GiB; complete-run percentiles are unavailable. It is incomplete and unqualified, rather than a completed 20-tick result or an authenticated-client capacity.

The storage process finished in 11.659 seconds (11.238 seconds inside the harness) and passed all six correctness checks, four growth stages, and reopen invariants. At 10,000 records, economy operations reached 26.594/second with 954.998 ms p95; durable building mutations reached 440.791/second with 59.682 ms p95. Group-commit queue/service decomposition remains unmeasured.

Neither admission target passed. Of 1,000 offered attempts, 390 authenticated by the deadline and 517 including drain; 483 were unissued. Of 10,000 offered, 334 authenticated by the deadline and 358 including drain; 174 issued requests timed out and 9,468 were unissued. Generator backpressure, request timeouts and successful admissions are reported separately. None of these totals is gameplay concurrency.

### Committed behavior

`15b1febe` moves credential work off the event loop, validates cached authentication against the visible file generation, and uses versioned verifiers for newly generated high-entropy session secrets. Human passwords and access codes retain their existing derivation strength. Session revocation and legacy verification remain enforced.

Queued user transactions share atomic writes while preserving operation rollback and acknowledgment after persistence. Room journals persist changed records and recover acknowledged checkpoints after restart. Active collision resources stay resident until their rooms expire. Eligible modern walking inputs reuse a fresh scheduled simulation frame; stale frames and special movement retain the full authoritative path. Protocol 2 reuses acknowledged static content while the client reconstructs complete snapshots before rendering. Directory caches retain ownership-sensitive inputs and use fresh population projections.

### Earlier full matrix on `15b1febe`

Evidence: `work/server-quality/qualification/`. The workflow records the exact source manifest, harness hashes, sequential commands and unchanged-source checks for every family. Runtime SHA-256: `70b3b569726122e36014eb5dcd706b0b183545e299e4f4ec18e36e2761b3f8e4`.

The full HTTP run used 20 seconds per workload, 241 fixture accounts, offered 20 Hz controls and the original latency/delivery gates, with protocol hydration timing and frame freshness added. Four of 17 gameplay workloads passed, compared with zero in the original retest:

| Passing workload | Input response p95 | Offered inputs delivered by deadline | General-world frame age p95 |
| --- | ---: | ---: | ---: |
| Builder, 1 player | 10.900 ms | 99.750% | 42 ms |
| Builder, 5 players | 28.446 ms | 97.800% | 47 ms |
| Hockey, 10 players | 10.147 ms | 97.600% | Not exposed by native API |
| Arcade, 2 players | 16.006 ms | 95.375% | Not exposed by native API |

The 15-player builder room still failed: 185.914 ms p95 and 41.483% delivery. Dense rooms, larger multi-room populations and heavy native environments also failed. Acknowledged joins and a responsive health route do not qualify these workloads. Restart recovery passed in 1.161 seconds, preserving the checked session, inventory, balance, published map and saved position. All 15 guest logins completed, with 4.316 seconds p95; this completion check is separate from gameplay responsiveness.

All five isolated simulation populations completed 20 measured ticks. Tick p95 was 3.659 / 7.382 / 21.332 / 196.272 / 2,543.180 ms for 1 / 15 / 128 / 1,000 / 10,000 synthetic players. The 1,000- and 10,000-player cases remain above the 50 ms budget. These are in-memory simulation measurements, without authentication, HTTP, rendering or persistence, and are not connected-client capacity.

Storage passed all six correctness checks and all growth stages. The storage harness finished in 9.382 seconds, versus approximately 270 seconds in the original retest. At 10,000 records, the economy workload achieved 32.646 operations/second with 799.940 ms p95; the building workload achieved 291.519 operations/second with 63.940 ms p95. The fixed batch window changes the queue implementation, so end-to-end latency is reported without inventing a queue/service decomposition.

Admission bursts did not qualify either large target. Of 1,000 offered logins, 424 completed within the deadline and 552 including drain; of 10,000 offered, 419 completed within the deadline and 547 including drain. Issued requests returned 201, but generator backpressure left 448 / 9,453 requests unissued. Unissued requests are not server rejections, and these totals are not gameplay concurrency.

### Remaining work and release limits

`76faf54885e1afff6968bf6e1bd077332fc841e3` fixes the independently reproduced atlas-cache publication race. A cold directory build now verifies its persisted JSON content and file generation before caching. Atomic restores are reloaded; corrupt replacements fail closed; newer in-process atlas transactions are preserved. Repeated external changes stop after three rebuild attempts with HTTP 503. Unchanged cached reads still use the filesystem generation check. All 21 focused atlas/directory Node test cases passed.

The follow-up HTTP run is separate evidence in `work/server-quality/qualification-final/`, with runtime SHA-256 `d0f87e7ae9d1d7834f2c91dae1e74f54826e0cd3318a5f22cc01f32b91c7d3e4`. Its source stayed unchanged. It retained 20 seconds, 241 fixture accounts and every applicable gate:

| Follow-up workload | Input response p95 | Delivered by deadline | Result |
| --- | ---: | ---: | --- |
| Builder, 1 player | 15.814 ms | 98.500% | Pass |
| Builder, 5 players | 29.545 ms | 96.950% | Pass |
| Builder, 15 players | 156.078 ms | 41.200% | Fail |
| Hockey, 10 players | 10.531 ms | 98.950% | Pass |
| Arcade, 2 players | 6.329 ms | 99.250% | Pass |
| Mixed activity, 30 players | 644.821 ms | 14.858% | Fail |

The passing builder frame-age p95 was 47 ms in both cases. Mixed activity also failed the new freshness gate at 126 ms p95. Restart recovery passed again. Untested workloads on this follow-up source remain unqualified; the complete earlier matrix remains bound to `15b1febe`.

The broader Node suite then exposed a real cold-start initialization regression: persisted preparation timestamps could bypass migration when a runtime reopened within the same physics window. `928afd02` requires a matching per-runtime preparation epoch for both frame reuse and scheduled input, and rotates that epoch after cache invalidation. A failed transaction cannot publish its candidate's readiness stamp. The marker is absent from public snapshots. All four original construction migration/material-ledger tests pass unchanged, together with 18 other focused checks. A construction restart fixture was also corrected to retire its former single writer before continuing through the reopened runtime; its beam and material assertions remain intact.

The first full-suite attempt was stopped after 286 passing files, two failing files and two interrupted files. It is retained as diagnostic evidence, not a final pass. The revised source received a fresh HTTP supplement in `work/server-quality/qualification-release/`, with unchanged runtime SHA-256 `84d48cefd579dd3e9e26452f8a22b8bb111d49c51060e88dd2fd64f816329c7b`. The earlier `76faf548` supplement remains preserved, with its own source identity.

| Earlier `928afd02` workload | Input response p95 | Delivered by deadline | Result |
| --- | ---: | ---: | --- |
| Builder, 1 player | 10.957 ms | 99.751% | Pass |
| Builder, 5 players | 54.599 ms | 94.050% | Fail |
| Builder, 15 players | 171.074 ms | 43.567% | Fail |
| Hockey, 10 players | 7.433 ms | 99.975% | Pass |
| Arcade, 2 players | 23.523 ms | 92.000% | Fail |
| Mixed activity, 30 players | 636.387 ms | 16.617% | Fail |

That iteration's restart recovery passed in 1.337 seconds with the same checked state preserved. General builder frame-age p95 was 46 / 48 / 49 ms for 1 / 5 / 15 players; mixed activity failed freshness at 137 ms. Five-player builder and two-player arcade passed earlier samples but missed delivery in this one. Their responsiveness is variable and remains an open gate; earlier passes do not establish reliable capacity. No gate or missed-slot denominator was relaxed.

### Expanded collision and snapshot iteration (`7ff7fd19`)

Isolated browser diagnostics exposed eight-second request deadlines in the populated airport. A 20.46-second server CPU sample attributed 53.9% inclusive time to resident objective planning and 50.4% to route segment checks. Repeated collision queries assembled triangles from distant deployed craft, traffic and construction before filtering them to the local query. This profile is diagnostic evidence, not a capacity result.

The collision change selects current nearby mesh bounds before extracting triangles and retains the original exact bounds predicate, triangle order and live pose checks. Clearance reuses one placed-world view within a synchronous query. NPC counts, routing decisions, planning frequency, collision geometry and movement rules remain unchanged. Seventy-one focused collision cases passed, including dense/rotated geometry, moving hulls, instanced geometry and comparison with the full-query oracle.

Protocol 2 also resent unchanged scenery records. Updated clients and the pressure harness now explicitly negotiate `snapshotDecorActors: true`; the server can reuse exact full scenery records while hydration preserves every actor and field. Changed records and membership invalidate their revision. Residents and unclassified actors remain inline. Older protocol 2 requests retain their earlier format, and the client can disable this capability. Eighty-four combined snapshot/client/integration cases passed, including legacy compatibility and the new component's correctness checks. The 1,000-scenery-record unit fixture demonstrates reduced wire bytes; server capacity still requires measurement.

Browser fixture diagnostics proved outdated control assumptions: right-stick taps are neutral, the dedicated Jump button performs touch jumping, and mobile resident controls require the real More view controls menu. The fixtures now use those controls and the exact dialog Close button, retaining their movement, jump-height, boarding and input-release assertions. The attempted pressure campaign in `work/server-quality/qualification-expanded/` was interrupted as detailed below. Earlier evidence remains attached to its original source.

### Cache corrections and final campaign (`99e5059e`)

Independent review found two performance countercases before completing qualification. Nearby queries could repeatedly transform the same high-detail stationary hull. Full scenery records could also fill the cache together with duplicated actor metadata and evict otherwise reusable components. Neither issue was dismissed on the basis of passing correctness tests.

The collision cache now retains exact per-mesh transformed triangles while all inputs remain unchanged, including geometry, attribute/index/instance identities, buffers, counts and versions, interleaved data, inherited object ID and world matrix. Normal Three.js `needsUpdate` versioning refreshes changed geometry. The scenery component is admitted after base components only when both fit world and global limits; otherwise records remain inline and existing metadata acknowledgments stay reusable. Fallback and re-admission retain complete hydrated state. Eighty-five focused collision cases and 85 focused snapshot/client cases passed; these overlapping suite totals are not a count of unique assertions.

The `7ff7fd19` pressure attempt was interrupted by managed execution reattachment after 11 completed HTTP scenarios. Its workflow, raw failures and interruption note remain in `work/server-quality/qualification-expanded/` as diagnostic evidence; no completed-family or full-matrix pass is inferred. The final cache-corrected source completed a separate campaign in `work/server-quality/qualification-cached/`, with independent source/harness fingerprints and the results listed above. Fresh full Node, static and selected isolated browser checks follow it. Long-running drivers are detached and record PID/start identity to reduce disruption from tool-session reconnects.

### Pre-integration correctness verification on `99e5059e`

The full 587-file Node run finished at 19:35:04 UTC: 3,328 test cases, with 3,327 passed, one optional neural-voice skip, and zero failed or cancelled. All files passed with no timeouts, blocked network events or source changes. The standard per-file budget was 240 seconds inside Node and 270 seconds outside it. The full-world traversal matrix had a declared 1,200 / 1,230-second override before the run; all 45 worlds and 46 Node cases passed in 292.226 seconds with the original assertions and physics intact. The runner records every actual per-file command and deadline in its source fingerprint, together with the runtime, helpers, pressure harnesses, test hashes, guard and Node version. Broader source SHA-256: `9ee95e69f8a395dda3f7c34d0853cdb96ff6f7b2831fb43b6664a4f0a370d138`. Full source fingerprint: `407870f86c8683ae1a0bc47ff0ef083cb7d9e43fc7e7c47fd0ccfd61b668d953`.

Results remain in the original checkout's `work/server-quality/regressions/results.json`. Its build, static checks and asset-registry validation all passed without source changes. Three of four isolated browser checks passed: construction recovery, delayed live motion and transport startup. World-input recovery failed because the More-controls overflow intercepted a real crew-radio Close click; that failure is retained and is being addressed in the main integration. These results are not represented as checks on the subsequently merged source.

### Prior correctness verification on `928afd02`

The earlier Node run covered all 587 test files. Of these, 586 passed under the local runner's standard 240-second inner / 270-second outer per-file budget. The unchanged full-world traversal matrix exceeded that convenience budget while still progressing; its original timeout is retained. It then passed in an isolated, separately fingerprinted run with a 1,200-second inner / 1,230-second outer budget: all 45 explorer worlds and all 46 Node test cases passed in 392.424 seconds. Every world received the same original 320 ordered walking/jump inputs and late collision escape checks. No traversal assertions, game rules or HTTP pressure gates changed.

Those standard and extended runs match the exact earlier runtime, Node version, guard, runner and matrix-test fingerprints. Together they cover 3,311 unique Node test cases: 3,310 passed, one skipped, zero failed or cancelled. The skipped case is the existing opt-in real neural-voice synthesis/cancellation check (`MUZIKAZ_TEST_NEURAL_VOICES=1` was unset); basic voice validation passed. Incomplete matrix results are not counted twice. Raw evidence: `work/server-quality/regressions/history/20261028T191059191764Z/results.json` and `work/server-quality/extended-matrix.json`.

Four additional fixture repairs passed without changing production code: a shipping legacy-state injection now advances to the next physics frame; restored-world tests use the current single writer; jump and streaming sandboxes supply their existing production helper dependencies. Hull, exact-pose, jump, shader-cancellation and disposal assertions remain. The jump fixture also verifies that a blocking overlay sends no command or local prediction. Original failed attempts remain in the logs.

On that source, `npm run build`, `npm run check`, and `npm run check:asset-registry` all returned zero with no source or generated-asset mutations. Record: `work/server-quality/static-history/20261028T191058039160Z/static-release.json`. Browser history: `work/server-quality/browser-regressions/history/20261028T193510282353Z/results.json`. That earlier isolated browser run passed construction recovery and delayed live walking, and failed the transport and resident-panel checks that led to the control/overflow diagnostics above. That attempt is retained, rather than reported as a browser pass. Results from different source manifests must remain separately labeled.

Further capacity work must address larger rooms and heavy environments, extend sustained and WAN tests, and qualify fleet routing/storage before claiming public production capacity. Do not lower gates, shrink fixtures, disable gameplay features, or describe synthetic simulation players as authenticated live clients.

| Next work item | Concrete completion check |
| --- | --- |
| Validate the corrected recovery boundary on current runtime | The main harness now captures the authoritative balance, inventory and complete wallet receipts immediately before hard shutdown. The current normal restart passed. Add a deterministic earned-coin restart on current source, preserve exact receipts, and retain a real missing-balance/receipt failure. Keep historical raw campaign results unchanged. |
| Resolve transport's ground-height assertion | Retain the passed no-jump-request check and failed height result. Capture stationary support height after the preceding keyboard jump, including local/server grounded state and the terminal floor plus walking gap, before interpreting later height deltas. Do not infer a look-generated jump from the current evidence. |
| Resolve focused-selector movement sampling | Capture controlsReady, worldLoading, actual focus, in-flight input/queue state and position through the original key window. The current failure proves no qualifying POST was captured in that window; it does not prove physical key loss. Retain the assertion and its failed result while determining the readiness or queue boundary. |
| Verify current map interaction | Current map coverage is constructor/policy unit coverage. Run the actual open, inspect, select and Close interactions on the current software-renderer path; the latest browser sequences failed before reaching those map actions. |
| Close the two long boat/vehicle functional checks | `shipping-navigation.test.mjs` and `vehicle-auto-server.test.mjs` retain their earlier `4e61968f` 270-second outer timeouts. Repeat these unchanged assertions on current source with a declared appropriate correctness budget and retain both old and new outcomes. The smaller current affected checks do not replace either complete proof or change the HTTP timing gates. |
| Stabilize five-player builder and two-player arcade delivery | Profile skipped slots and long event-loop pauses in both server and generator. Retain the failed samples, repeat longer isolated workloads, and meet latency, delivery, validity and presence gates consistently before calling these room sizes qualified. |
| Explain native hockey delivery gaps | The historical `99e5059e` ten-player sample had 14.627 ms p95 response latency but only 67.275% offered-slot delivery: 1,299 skipped slots and ten issued inputs completed after the deadline. Maximum observed event-loop delay was 4,160.750 ms in the generator and 3,206.545 ms in the server; those observations do not establish their cause. Attribute missed slots to measured in-flight spans, scheduler gaps and process pauses; preserve the original denominator and repeat the unchanged workload. A native simulation clock is currently unmeasured, so do not label its frames fresh. |
| Profile the current 15-player builder path | Capture the final source and identify simulation, serialization, cloning, persistence and queue costs separately; rerun the unchanged 20-second/241-account workload and meet every HTTP gate. The earlier CPU profiles predate the final scheduled-input and directory changes. |
| Reduce heavy-world stalls | Profile commons, airport and construction independently, preserving their NPCs, geometry and interactions. Start with resident route planning and clearance queries implicated by the diagnostic profile; validate any cached paths against changed geometry, live hull poses and the existing full-query oracle. Require fresh frames and maintained presence as well as low response latency. |
| Increase concurrent room throughput | Re-run 30/60/120/240-player multi-room workloads with the same room sizes and input rate. Retain missed slots in the denominator and report incomplete or timed-out experiments. |
| Bound large simulation work | Reduce the measured 1,000/10,000-player tick and allocation costs while preserving collision and actors. Complete all 20 ticks inside the existing 120-second limit and meet the 50 ms tick budget; report peak RSS as well as timing. Repeat HTTP, authentication and persistence tests before converting any compute result into a player-capacity claim. |
| Prepare a fleet architecture | Define exclusive room ownership, routing, transactional economy/session storage, invalidation and crash recovery, then run an end-to-end multi-host workload. File-backed in-process queues are insufficient evidence for this target. |
| Establish release endurance | Add longer runs, WAN jitter and packet loss, representative mobile/browser rendering, reconnect storms and recovery exercises. The current short local samples remain the stated scope of qualification. |
