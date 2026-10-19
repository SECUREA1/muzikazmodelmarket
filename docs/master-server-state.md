# Master server state

Open **Admin Data Center → Master server backup & restore**. Member, land, and saved-build buttons select searchable lists; the existing CSV export downloads the selected list.

**Download master server file** captures a consistent snapshot of configured server JSON stores and local uploads. The version 1 JSON file contains editable `encoding: "json"` records and checksum-verified base64 assets. It includes account credentials, account and game sessions, member inventories and saves, land deeds, builder assets and ownership, market listings, MZK transaction history, crypto payment records, saved room matches and campaigns, atlas pins, published maps, and locally uploaded models/images/audio. Available chat and support history is included. Treat it as private account data. Do not commit backups to source control.

To restore, select the file, review validated counts, check the replacement confirmation, and choose **Restore selected master state**. The server pauses requests and simulation/payment/background writes, drains in-flight work, verifies every record and destination, and writes an automatic `master-rollback-*.json` recovery file in its configured backup directory. It stages replacements before changing live files, rolls back if an installation operation fails, deletes managed files absent from the selected snapshot, and clears cached room/atlas/session data. The selected state becomes authoritative; it does not merge with newer records. Gameplay reconnects afterward. The admin session uses deployment authentication and remains independent of restored member sessions.

JSON records can be edited before re-upload. Preserve the format/version, declared root labels, schema, IDs and relationships. Binary assets must retain valid base64 and their SHA-256 digest. Validation rejects mismatched roots, path traversal, symbolic links, duplicate targets, invalid core schemas, negative MZK balances, oversized state, and damaged assets before applying changes. The limit is 256 MiB of decoded state and 384 MiB for upload JSON; the complete file is held in memory. Use an infrastructure backup for larger deployments. These operations assume the existing single server process owns the configured data stores.

For a separate deployment with its server stopped:

```sh
node scripts/restore-master-state.mjs /secure/muzikaz-master.json /var/data/muzikaz
```

The command prints the data and upload configuration for the restored files. Deploy the compatible application code and configure its secrets separately; then start the server using these paths. Existing path overrides must be updated to point to the new directory. The original directory-based backup restore command remains available for existing snapshots.

Only state available to this server is captured. External GLB/image URLs remain links; external assets are not downloaded. Blockchain payment hashes and statuses are restored as historical records; no payment or crypto transfer is replayed. Browser-only/unsaved builds, local tournament rounds, external service data, application code and deployment secrets are outside the backup. Existing fulfilled-order receipts and reward request IDs are preserved to prevent duplicate fulfillment. A new deployment must keep its normal payment verifier configuration.

A process or disk failure during replacement may require restoring the automatic recovery file while stopped. Keep a downloaded copy outside the server disk; an on-disk recovery copy cannot protect against loss of that disk.
