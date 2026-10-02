---
name: Commit message prefixes
description: Commit subjects use Conventional Commit type prefixes describing the change, never "Bump version to X (...)".
metadata:
  type: feedback
  keywords: commit, git, message, prefix, conventional commits, version bump, changelog
obligations:
  - Start every commit subject with a Conventional Commit type prefix (feat/fix/docs/style/refactor/test/chore) that names the change.
  - NEVER lead a commit subject with "Bump version"; the version bump rides along in the same commit and goes in the subject suffix as (vX.Y.Z).
---

# Commit Message Prefixes

## Rule

- Format: `<type>: <imperative summary of the change>` — NO `(vX.Y.Z)` suffix (dropped 2026-10-02: the pre-commit hook bumps the version after the message is written).
- `<type>` describes the CHANGE, NOT the version bump:

| Type       | Use for                                          |
| ---------- | ------------------------------------------------ |
| `feat`     | New user-visible capability                      |
| `fix`      | Bug fix                                          |
| `style`    | Visual/CSS/layout change with no behavior change |
| `refactor` | Code restructure, no behavior change             |
| `docs`     | README, CLAUDE.md, memories                      |
| `test`     | Tests only                                       |
| `chore`    | Tooling, deps, release-only bumps                |

- Patch bump is automatic (`.githooks/pre-commit`); manual major/minor bumps are staged in the same commit as the change.
- Lowercase type, no trailing period, subject ≤72 chars where practical; detail goes in the body.

## Examples

- GOOD: `feat: sync database/files between environments`
- GOOD: `fix: don't wait on Pantheon housekeeping workflows`
- BAD: `Bump version to 0.4.12 (don't wait on Pantheon housekeeping workflows)`

**Why:** User called "Bump version to …" subjects ridiculous — every subject read the same and hid what changed; history was rewritten to type prefixes on 2026-10-02.

**How to apply:** Every `git commit` in this repo, including amends and history rewrites.
