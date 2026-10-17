# Historical outgoing Instagram / WhatsApp contact backfill

The normal sync identifies high-confidence, newly saved **outgoing** contact shares. Older synced messages may need an optional backfill. The command runs **dry-run by default**, scoped to one TNND account, with no model calls, Tinder actions, external sends, or contact extraction logs.

## Preconditions

- Access to the current PostgreSQL schema (read-only for dry run). Apply requires permission to write `human_actions`.
- Supply only your own internal `users.id` UUID. Do not put account IDs, handles, transcripts, passwords or API keys in GitHub files or Actions logs.
- Start your local Docker/Postgres service first if the database is local. CI/tests never touch real user data.
- Review dry-run counts and the intended account before applying.

From `apps/api`:

    # DRY RUN: at most 25 conversations; no writes
    npm run backfill:outgoing-contacts -- --user-id=<ACCOUNT-UUID>

    # Larger bounded chunk, at most 200 conversations
    npm run backfill:outgoing-contacts -- --user-id=<ACCOUNT-UUID> --max-conversations=50

    # Resume from the previous report's nextCursor
    npm run backfill:outgoing-contacts -- --user-id=<ACCOUNT-UUID> --after-conversation=<NEXT-CURSOR> --max-conversations=50

    # Only after confirming a dry run: explicit write
    npm run backfill:outgoing-contacts -- --user-id=<ACCOUNT-UUID> --max-conversations=50 --apply

Run the same conversation range again with `--apply` after reviewing the dry-run. The output contains: mode, conversationsScanned, messagesScanned, newCandidates, alreadyRecorded, inserted, nextCursor and mayHaveMore. The cursor advances by conversation UUID, and each chat is streamed in timestamp/message-ID pages of 200.

## Safeguards

- Only outgoing messages are considered; contact direction is never inferred from profile names.
- A distinctive standalone handle/number is eligible only following an immediate incoming request for that social platform; or when the outgoing message itself explicitly labels the contact.
- An event stores only platform, direction and source message ID; no additional phone or handle.
- Under a conversation-row lock, the writer checks the persisted outgoing source and existing event before inserting. Repeated runs are idempotent; concurrent live sync is protected by the same lock.
- Dry-run results reflect candidates at inspection time; apply may write fewer if live sync has already recorded them.
- No automatic startup, migration, CI or background task invokes this command; real data is untouched by this PR.
- Ambiguous past exchanges remain unknown. Human review and richer provenance are separate future work.
