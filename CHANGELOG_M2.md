# RVU Commerce M2 — change log

**Implemented in source, not yet runtime-accepted:**

- Replaced vertical RVU Commerce header/footer logo with a purpose-built, horizontal SVG mark and favicon; created matching instructor SVG.
- Added mobile navigation and refreshed quote/offer UI.
- Added a server-stored custom workstation quotation workflow and B01 controlled client-trust flaw.
- Added persisted per-order promotional applications and B04 controlled history flaw.
- Added 30-minute checkout intents, server price/version checks, and B08 unrelated-payment-proof confirmation flaw.
- Added promotional stored-value composition B10 with repeat GIFT20 and single-redemption Gift Cards.
- Added store voucher and R01 split check/claim concurrency flaw; safe profiles use atomic cart locking.
- Added instructor-only profile choice, atomic run reset, independent instructor session and persisted-evidence counters.
- Added migration 002, store role grants, dedicated backend regression tests and instructor scenario guide.
- Preserved M1 baseline APIs and migrated existing DBs without deleting previous run/ledger history.

**Unimplemented:** the other 13 scenarios from the approved 18-lab blueprint. The source is a working target for validation, not an accepted final release; see `docs/M2_STATIC_QA.txt`.
