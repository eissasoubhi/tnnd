# Content design / UX Writing — TNND

Treat content as a component of design. Read the surrounding feature flow and state machine before changing copy.

## Principles
- Say what the user can **do** and what happened; avoid implementation jargon, ambiguous abbreviations and empty reassurance.
- Prefer concise, action-specific buttons. A label must truthfully match the triggered behavior.
- Separate page title (where am I?) from help text (why/how?) and confirmation (what changed?).
- Use a neutral, friendly, professional voice, without patronizing language, robotic hype or guarantees the system can't substantiate.
- Keep terminology identical across web and extension; preserve existing locale, grammar, punctuation and translation systems.
- Place helpful examples next to hard forms; never use a placeholder as the only accessible label.
- Explain error cause only if known. Always offer a genuine next step when possible.

## Preferred concepts (validate actual feature naming first)
| User concept | Recommended wording | Avoid |
| --- | --- | --- |
| Stored user persona | Identity / Identity Builder | internal profile DTO |
| User-supplied story | Personal memory / Anecdote | synthetic fact |
| Generated text not yet sent | Draft / Create draft | Sent / Auto-sent |
| Proposed AI action | Suggested reply / Review draft | Delivered |
| Sending not confirmed | Sending / Waiting for confirmation | Success |
| Manual intervention required | Action required / Resume after manual action | Silently completed |
| No conversations | No conversations yet + concrete next action | 0 items with no guidance |
| Missing last message | Explain if manual input is needed and why | Latest message required without explanation |

## Message sending and automation
- The UI must differentiate **configure**, **preview**, **generate**, **review**, **approve**, **send**, and **verified sent**.
- Any rate or daily message limit must say **what is counted**, **its scope**, **when it resets** and whether it applies per chat or globally, but only after confirming actual enforcement behavior in code.
- For first contact, do not imply that multiple unresponded messages or global eligibility are safe/allowed by Tinder.
- Show effective per-conversation settings separately from defaults; "Auto" and "manual override" are explicit.
- Acknowledge confidence/uncertainty when profile information, conversation identity or latest message is not verifiable.

## Copy review checklist
- All headings/CTAs/help/errors/loading/empty/confirmation messages in the affected flow reviewed.
- Specific labels, appropriate hierarchy, consistent nouns, meaningful recovery actions, accurate success state.
- No misleading promises, invented data or hidden destructive actions.
