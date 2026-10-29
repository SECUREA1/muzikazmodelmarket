# Room snapshot protocol and scheduled walking

The browser requests compact input replies with `snapshotProtocol: 2` and `snapshotAcknowledgements` from its last completely hydrated state. The server retains players, actor identities, dynamic fields, unknown gameplay fields, and action results. Unchanged definitions, assets, terrain, and supported bulky components can be omitted only when the request acknowledges their current exact-content revision.

Revisions are scoped to a server encoder instance and world. The server compares encoded values, not a collision-prone short digest or an assumed immutable definition. Memory limits and idle eviction cause full retransmission. Missing or incorrect acknowledgments never authorize gameplay or make the server reject a command.

The client captures a baseline for each request and hydrates that response against that baseline before validating or rendering it. Transport bookkeeping stays separate from the complete gameplay state. Concurrent replies cannot borrow an unrelated newer baseline. If the baseline is missing, the client retains the displayed scene and requests a full next response without rejoining or replaying a discrete action.

Legacy clients continue using their existing full/compact responses. Join replies, discrete actions, and scene changes supply recovery baselines. The browser client also accepts an explicit `snapshotProtocol: 1` option for legacy interoperability checks.

Updated clients additionally request `snapshotDecorActors: true`. This capability allows the `@decorActors` component to reuse complete authored scenery actor records. The client restores those records before applying actor metadata, so hydrated snapshots retain every actor and field. Any record or membership change changes the exact-content revision and retransmits the component, including changes to positions, health, opening, ownership or previously unknown fields. Residents, traffic and other unclassified actors remain inline. The server does not send this component to an older protocol 2 client that has not requested the capability. The client option `snapshotDecorActors: false` retains that earlier format, and older servers can ignore the new request flag.

Scenery reuse is optional within the world and global cache limits. It is admitted after base components only when both can remain cached together; otherwise scenery remains inline. This fallback preserves existing metadata acknowledgments instead of repeatedly evicting and resending them.

## Scheduled controls

Production enables `scheduledInputs` on `AuthoritativeRooms`; the constructor default remains false for existing manual-clock callers. Fresh ordered on-foot controls in an initialized, unchanged, eligible world acknowledge against the latest authoritative frame. The existing 50 ms timer owns normal movement and world maintenance. Inputs do not advance or postpone the simulation clock.

Preparation must have completed in the current runtime. A persisted timestamp cannot make a reopened or cache-invalidated runtime skip initialization and migrations; a rejected transaction cannot publish its candidate preparation epoch.

Short grounded jump edges are retained until a real physics step consumes them. Input epochs, expiry, and activity changes clear obsolete edges. Replayed, stale, expired, changed-world, vehicle, and special-activity controls retain the established full processing path. A frame older than 250 ms also falls back to full processing.

Control latency and simulation freshness are separate measurements. The qualification harness includes client hydration in its input timing and checks general-world frame age as well as input delivery. An acknowledged request alone does not demonstrate timely simulation or smooth rendering.
