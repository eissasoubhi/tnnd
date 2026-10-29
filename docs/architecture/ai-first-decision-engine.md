# ADR — TNND AI-First Decision Engine
Status: **Accepted as architecture direction, incremental migration** — 2026-10-29
Scope: conversation intelligence, screening, timing, topic management and future Tinder automation features.

## Product principle

**The model understands and reasons. The app guides, configures, creates effective prompts, and executes authorized actions.**

The application is not a giant `if` statement: phrases in French, English,
Moroccan Darija (Latin and Arabic scripts), cultural idioms, emojis, quoted
text, negations, sarcasm and semantic paraphrases cannot be exhaustively
implemented as keyword lists.

Conversely, **an LLM is not an authorization system**. AI-generated decisions
are proposals, never proof that another person consented to off-platform
contact, that a Tinder message was delivered, or that an action is legally
or technically permitted.

## 3 layers

### 1. AI Decision Engine — semantic reasoning
Located on the authenticated API. For each task:
- *Inputs*: last verified message turn (direction + body), bounded recent
  history, relevant verified facts, user configuration, cultural/language
  preference, temporal evidence **only when genuinely verified**, previous
  decision with its source revision.
- *Task instructions*: role, objective, constraints, what decisions the
  model may make, alternative outcomes, uncertainty and examples of
  **contextual reasoning** instead of phrase dictionaries.
- *Output*: JSON schema and a domain-specific validator. A typical future
  shared contract could be `{action, strategy, topic, needsClarification,
  needsHumanReview, confidence, evidenceMessageIds, reasonCode}`; these
  fields are **proposed**, not all implemented in the current release.
- *Unknown / unavailable*: absence of approval, pending review.
- Inference may be reused for the same verified turn but invalidated when
  that turn, permissions or user configuration changes.

### 2. Configuration & Prompt Builder — product/application
- User and per-chat preferences (tone, language, directness, boundaries,
  priorities, mode), conversation history, facts and memories.
- Resolve conflicts: explicit user configuration and real message text
  override soft stylistic suggestions.
- Compose a short **versioned** effective prompt; expose the final inputs,
  structured decisions and uncertainty for debugging and quality review.
- Avoid logging private text, credentials and third-party identifiers.
- Orchestrate modes **Swipe → Matches → Chat** according to user settings,
  availability and authorization rather than invented semantics.

### 3. Execution & Safety Engine — deterministic code
- Auth/account ownership, eligibility, UI state, consent/opt-in, Tinder
  thread identity, current message revision, deduplication and durable
  attempt claims, quota/cadence/timeouts and source timestamps.
- Check permissions **before and again immediately before** irreversible
  external effects. Do not execute unsolicited extra Tinder messages.
- Fail closed on unknown/stale/malformed/low-confidence output.
- Keep manual approval and real delivery verification distinct from model
  confidence and generated wording.

## Current implementation and honest audit

| Module | Current role | Migration |
| --- | --- | --- |
| `apps/api/src/conversation-semantic-classifier.ts` | Gemini structured classification of conversation endings, acknowledgment and off-platform intent | **AI-driven, uses shared core** after this ADR |
| `apps/api/src/ai-decision-engine.ts` | Shared request builder, evidence isolation, schema output, validation, timeout and fail-closed semantics | **Implemented as foundation** |
| `src/conversation-pragmatics.ts` | Recognizes discomfort/interview complaints, vulnerability, language and stock phrases via regex | **Not migrated** — high priority |
| `apps/api/src/match-intent-screening.ts` | Infers marriage/casual intent with word lists; height rule is numeric | **Not migrated** — high priority; keep numeric height rule |
| `apps/api/src/conversation-flow.ts` | Infers greeting, small talk, topics and questions through regex | **Not migrated** — high priority; retain configurable flow ordering |
| `src/conversation-long-gap.ts` | Determines long gap from verified timestamps (valid arithmetic) but recognizes refusal/greetings/questions by regex | **Partially deterministic only** — AI should handle semantic part |
| `src/conversation-reply-safety.ts` / AI-identity checks | Combines safety and linguistic interpretation | **Audit and migrate semantic parts carefully** while retaining hard safety holds |
| `apps/api/src/conversation-topic-analysis-provider.ts` | Already calls Gemini for topic semantics | **AI-driven**; should share transport later |
| `apps/api/src/conversation-generation-service.ts` / `apps/api/src/extension-suggestions.ts` | Builds prompts from legacy heuristic advice, calls Gemini to draft | **Partially AI-driven**, move strategy into a consistent structured decision pipeline |
| `src/tinder-*-gate.ts`, `src/unified-activity-policy.ts` | Technical permissions, quotas, state transitions | **Keep deterministic** |

### Migration slices (do not silently change unrelated user flows)

1. **Core (this change)**: shared model transport and mandatory repo rule; reuse existing boundary classifier without changing its decisions. Validate privacy, schema, error handling and regression gates.
2. **Contextual strategy**: replace pragmatic word detectors by one model-produced, validated per-turn strategy (e.g. response priority, re-entry, emotional sensitivity, whether to ask a question, context continuation) shared by Web + extension.
3. **Intent screening & flow**: replace regex-based marriage/casual and conversational stage interpretation with model classification using verified profile evidence and saved preferences; height and explicit approval stay deterministic.
4. **Unified inference**: merge compatible semantic tasks into **one inference per verified turn** (or reuse an existing result) to minimize latency/token costs; expose versions and diagnostics; compare old/new in shadow evaluations before enabling all actions.
5. **Evaluation**: curate opt-in, redacted fixtures for French/English/Darija and challenging cases (paraphrase, negation, joking, quote, handoff vs mere handle request, temporal resume, boundaries). Report false positives, false negatives, abstentions, added latency and costs. Retain manual verdicts.

## Acceptance criteria for new semantic features

- No new literal phrase regex or hand-written rule tree that *determines the
  meaning* of a user's or match's message.
- A schema-constrained model decision with clear uncertainty and enough
  evidence to audit it, grounded in a verified per-chat context.
- Failure modes (provider down, timeout, stale context, malformed JSON) are
  tested to **defer/review**, never guess or auto-send.
- Tests with multilingual, adversarial and unseen phrasings, plus integration
  checks that existing explicit consent/quotas/anti-duplicate gates work.
- No claim of live Tinder behavior from mock tests alone.

## Rollout / performance note

Structured Gemini calls can be expensive or slow if repeated. Prefer reuse
from a **single authenticated, revision-specific decision** over calling the
model every time a scan polls. Cache key must include user, thread, source
turn revision and relevant user configuration; invalidate stale decisions.
Keep long-running generation and classification off SQL row locks.
Do not include unverified fabricated send timestamps in prompts.
