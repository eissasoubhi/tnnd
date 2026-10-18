# TNND — ChatGPT Plus Cloud product & engineering workflow

Status: workflow policy for human-led, AI-assisted delivery. No autonomous code runner, external service, or BMAD agent is installed merely by adding this file.

## Objective and execution model

ChatGPT Plus (Chat/Work) acts as the **product / engineering coordinator**. Approved connected GitHub actions can inspect the repository, maintain branch-based documentation, issues and PRs, and submit code changes **when actual write permissions are present**. GitHub Actions is the reproducible cloud execution environment for build, tests, browser smoke checks and artifacts.

Do not claim that ChatGPT Chat/Work has a local terminal, Docker, real Tinder session, or unrestricted GitHub write access. Browser-based Work tasks only have access to supported sites and connected apps; use the available permissions rather than assuming they exist. For operations not supported by the active session, record an actionable handoff instead of claiming success.

BMAD is an **optional planning protocol** (including ChatGPT web bundles), not an automatically installed multi-agent runtime. A persona is a review role, not proof that a separate independent agent ran.

## Existing TNND sources of truth (read before changing anything)

- Product roadmap: GitHub issue #5 (single backlog source; avoid fragmenting the roadmap).
- This repository's `AGENTS.md`, `docs/v1-release-checklist.md`, and current GitHub Actions workflows.
- User-facing changes: `.agents/skills/product-design-expert/SKILL.md`, `docs/design/PRODUCT_PROFILE.md`, `docs/design/neo-bento.md`, applicable design references, and existing CSS/component implementations.
- Real Tinder integration: use `docs/tinder-diagnostic-observations.md` and current diagnostic evidence. Never invent DOM selectors, bypass send/consent/manual-takeover gates, or state that an external action happened without confirmation.
- Privacy: never commit or paste real private profiles, message bodies, session tokens, production database exports, or secrets into public GitHub artifacts.

## Team responsibilities (invoke only when relevant)

| Role | Required decision or evidence |
| --- | --- |
| Product Owner (human) | Priority, scope, approval of sensitive UX/behavior and release decisions |
| Product Manager / analyst | User problem, current behavior, acceptance criteria, issue #5 alignment |
| Engineering Lead (ChatGPT) | Risk classification, delegation, dependencies, traceability, delivery status |
| Software architect | Contracts, state transitions, security, data migrations, rollback strategy |
| Product design lead | Flow, hierarchy, Neo Bento components, UX writing, accessibility, responsiveness |
| Engineer | Small, isolated code changes, tests and migration compatibility |
| QA / test architect | Risk-driven test plan, negative paths, evidence, regression and real-world test gaps |
| Independent reviewer | Review the changed diff and assumptions without treating the author's confidence as evidence |
| DevOps / release owner | GitHub Actions, artifacts, deploy/rollback, monitoring, release gate |

Separate **review passes** are required for meaningful changes; multiple named personas in one chat are not equivalent to independent automated reviewers.

## Workflow for every feature/bug

1. **Inspect reality:** read `main`, open PRs, applicable issue #5 section, relevant files, tests and CI. Classify risk as *small / medium / high*; identify impacted web, API/DB, extension, integrations and privacy boundaries. Record what was actually observed vs inferred.
2. **Define the outcome:** problem, intended user behavior, reproducible scenarios, testable acceptance criteria, out-of-scope and possible rollback. Preserve existing supported behavior; design changes need the product-design skill.
3. **Design / architecture:** use existing Neo Bento tokens and information architecture. Cover idle/loading/empty/error/success/offline/paused states as relevant; define API/data/state contracts, migration and failure cases. For high-risk changes, obtain human approval of the change in behavior.
4. **Implement on an isolated branch:** do not commit directly to `main`; favor one responsibility per PR. Work in up to three independent lanes (Web/UX, API/DB, Extension), but serialize overlapping files, shared contracts and database migrations. Never merge over an open overlapping PR without reconciliation.
5. **Verify:** author tests for expected and failing scenarios, run matching GitHub Actions checks on the PR; inspect failing job logs and screenshots/interaction artifacts. CI passing is not proof of successful live Tinder delivery.
6. **Review:** inspect PR diff, architectural impact, UX/accessibility/responsiveness where applicable, safety/privacy and regression risk. Report explicit blockers; fix, re-run, and re-review.
7. **Deliver:** record evidence in the PR template, ensure required checks pass, merge only under the existing approval/release rules; verify `main` checks. Preserve user approval for releases or live actions when required.

### Small changes vs critical changes

- **Small:** narrow change, clear acceptance criteria, affected tests and CI; a short PR review.
- **Medium:** explicit cross-surface impact review and functional/browser checks for the affected UI.
- **High:** real-user messaging, swipe automation, authentication, DB migrations, privacy or irreversible actions; failure-path tests, manual intervention rules, rollback, independent review and explicit residual risk assessment. Do not silently enable previously blocked automation.

## Definition of Done: evidence, not assertions

- [ ] Requirement and acceptance criteria written, with references to source issue/context.
- [ ] Impacted architectural/data/UX/security scenarios considered.
- [ ] Appropriate tests added and **executed**, with named checks and commit-specific outcomes.
- [ ] For UI: screenshots/traces from the actual CI/browser run inspected; desktop/mobile and extension checked where touched. Mocked browser UI tests are not real signed-in Tinder tests.
- [ ] For risky integrations: separate real-environment test evidence collected with explicit authorization; otherwise mark **UNVERIFIED / BLOCKED**, never `done`.
- [ ] PR reviewed for unrelated changes, privacy leaks, compatibility and regressions.
- [ ] CI green where required and manual blockers explicitly tracked before declaring release-ready.

**Reporting statuses:**
- `IMPLEMENTED / UNVERIFIED`: code exists but required validation has not happened.
- `CI VERIFIED`: specified automated checks passed for the named commit.
- `MANUAL VERIFICATION REQUIRED`: a real browser/Tinder or local Docker/Postgres validation is still needed.
- `RELEASE READY`: all applicable release-checklist gates are satisfied with evidence, not just green CI.

## Cloud verification: existing commands and CI

The repo already has these GitHub Actions:
- `.github/workflows/ci.yml`: root extension build, Neo Bento visual browser smoke, Web functional browser QA, downloadable screenshots/artifacts.
- `.github/workflows/web-ci.yml`: Web typecheck, tests and build.
- `.github/workflows/api-ci.yml`: API typecheck/tests and database-related checks.
- `.github/workflows/v1-release-gate.yml`: V1 checks and documented limitations.
- `.github/workflows/local-quality-audit.yml`: **opt-in private self-hosted runner**, never for public PR data or as a substitute for tests.

Prefer extending those checks instead of adding another redundant orchestration framework or new paid service. Never use production credentials or real conversation content in cloud runners.

Local PostgreSQL in Docker on the user's machine is not reachable from GitHub-hosted CI just because a workflow exists. Use disposable CI fixtures or a deliberately provisioned, approved private runner where required; do not assume access.

## ChatGPT Work task brief (paste into Work)

> Act as TNND Engineering Lead for `eissasoubhi/tnnd`, working on the repository through the available authorized GitHub connector and supported cloud tools, without Codex. First inspect current `main`, open PRs, CI, issue #5, AGENTS.md, this playbook, and the relevant TNND design/release contracts. Prioritize current blockers and regression risks before new features. For each task, state acceptance criteria, impact on Web/API/DB/Extension, UX and privacy, then perform isolated modifications via a branch and PR only if this session provides verified write access. Use GitHub Actions for executable tests and browser QA, and inspect their results and visual artifacts. Never invent tests, screenshots or real Tinder evidence. Do not merge changes or launch risky live actions without meeting project gates. Report `IMPLEMENTED / UNVERIFIED`, `CI VERIFIED` or `MANUAL VERIFICATION REQUIRED` accurately. If tooling cannot run code or change files, provide precise instructions, file diffs or a reviewable handoff; do not claim the work was completed.

## Adopting BMAD without Codex

Use a ChatGPT-compatible BMAD web bundle for **discovery, PRDs, architecture or UX planning** when it adds value. Move its output into issue #5 or a scoped PR. Implementation remains a distinct GitHub change + CI + review workflow. Do not claim the BMAD web bundle can execute arbitrary repository tests or that its personas are independent reviewers. Reference: https://docs.bmad-method.org/customize/use-web-bundles/

## Safety rails

Do not edit the intentionally empty public `README.md`. Keep all private user data and credentials out of public issues, PRs, logs and CI artifacts. Never state a real Tinder message or swipe succeeded based solely on a test fixture, mock, DOM click or planned action. Follow the explicit release checklist when real integration gates remain open.
