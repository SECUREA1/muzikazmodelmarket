# Member data retention

MUZIKAZ stores account, entitlement, Backpack, marketplace, and operational records on the persistent service disk configured by `MUZIKAZ_DATA_DIR`. The administrator data center includes a sanitized signup view containing usernames, normalized email addresses, wallet bindings, entitlement state, timestamps, and collected account data.

Passwords are never recoverable: only salted PBKDF2 password verifiers are stored. Session tokens and access secrets are also excluded from administrator responses.

Production member data must **not** be committed to GitHub. Git history is not a private database, cannot provide appropriate deletion or access controls, and would permanently expose personal information and credential material. The runtime files are ignored by Git. Configure encrypted snapshots/backups for the Render persistent disk (or migrate these stores to a managed encrypted database) to meet retention and recovery requirements.

Set the secret `MUZIKAZ_ETH_RPC_URL` in the deployment environment. MEKNX access is granted only after the server independently checks the connected wallet's current `balanceOf` against the approved Ethereum contract.
