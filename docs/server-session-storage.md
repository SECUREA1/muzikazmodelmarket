# Session verifier formats and rollout

New account and game sessions use 32 cryptographically random bytes encoded as an opaque bearer token. Account CSRF proofs remain deterministic HMAC-SHA-256 outputs bound to that token. Neither raw value is persisted.

`sha256-opaque-v2` stores a randomly salted SHA-256 verifier with an explicit version domain, account/game kind, and bearer/CSRF purpose. Readers require canonical encodings, exact digest/salt/secret lengths, supported algorithm metadata, and constant-time digest comparison. Positive caches include the algorithm and proof context. Revocation, expiry, and file-replacement checks still run during authentication.

Fast hashing is restricted to newly generated high-entropy session secrets. User passwords and access codes continue using the existing 210,000-iteration PBKDF2 scheme. Session records with absent algorithm metadata are also verified using that unchanged legacy PBKDF2 scheme. Unknown or null algorithm metadata is rejected.

## Issuance configuration

`MUZIKAZ_SESSION_ISSUANCE_ALGORITHM` accepts exactly:

- `sha256-opaque-v2`: the default for new issuance.
- `pbkdf2-sha256-v1`: issue the legacy format while retaining both readers.

The `DurableSessionStore` constructor also accepts `issuanceAlgorithm`. This setting chooses the format for new sessions; it never reinterprets or downgrades existing verifiers. CSRF migration retains the format attached to each existing and previous proof.

## Deployment and rollback

Deploy v2-capable readers everywhere before enabling v2 issuance in any deployment with multiple readers. This does not authorize multiple writer processes sharing the JSON files; the current file-store coordination remains process-local.

Rollback must retain a v2-capable reader for already issued v2 sessions. Switching issuance to the legacy format does not make an older PBKDF-only binary understand v2 records. If such a binary must be restored, affected sessions need an explicit revocation and sign-in recovery plan; do not silently relabel hashes.

Include the complete session JSON files in the existing protected backup/master-state procedures. They contain authentication verifiers and must remain private even though raw bearer tokens are not stored.
