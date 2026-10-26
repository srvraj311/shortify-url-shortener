# 0003 — Random Base62 short codes; unique index is the authority

**Date:** 2026-09-02 · **Status:** Accepted

## Context
Plan §9 lists random, sequential→Base62, and Snowflake→Base62. V0 used a shared
`salt` counter with a read-modify-write race.

## Decision
7-char random Base62 (`crypto.randomInt`). Generate → insert → on duplicate-key
(11000) retry up to 5×; exhaustion → controlled 500. Never "check then insert".

## Consequences
- No coordination, no hot counter document, no clock dependency.
- Codes are unguessable and non-enumerable (good for privacy).
- Collision probability at 7 chars (~3.5e12 space) is negligible for this scale;
  the retry loop absorbs the rare hit.
- Not sortable by creation order — we don't need that (list sorts by `createdAt`).
- Sequential/Snowflake strategies are implemented as helpers (`toBase62`) and
  discussed for the "what if we need ordered, denser codes" interview question.
