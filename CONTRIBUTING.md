# Contributing

## Branch model

- `master` — published; never pushed to directly
- `development` — integration branch; target all work here
- Short-lived branches off `development`: `feat/<topic>`, `fix/<topic>`, `refactor/<topic>`, `docs/<topic>`, `chore/<topic>`
- One branch = one phase = one review unit

Direct pushes to `development` and `master` are not allowed. Every change arrives via a pull request.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): subject`

Standard types: `feat`, `fix`, `refactor`, `docs`, `chore`

Non-trivial commits must include a body — a blank line after the subject, followed by a bullet list of concrete changes:

```
docs(balance): update FINDABILITY_MIN threshold

- Lower FINDABILITY_MIN from 0.06 to 0.04 based on playtest-log.md entry 2026-09-01
- Add rationale to balance.md changelog
```

- One bullet per logical change; present-tense imperative ("Add", "Remove", "Fix", "Update")
- Omit the body only for genuinely single-action commits
- **Never include AI/Claude co-authorship attribution in commit messages**

## Before pushing

```bash
make verify   # lint + test (≥90% branch coverage) + audit
```

CI runs the same three stages on every pull request. Do not open a PR before the pipeline passes (exception: draft PRs for early feedback).

## TDD

Tests are written before implementation. Deferred tests use `test.fails(...)` — vitest asserts they do fail, so a deferred test that unexpectedly passes breaks the build.

## Pull request description

Every PR must include:
- Summary of the change and its intent
- Linked issue (if applicable)
- Test evidence (what was run and the outcome)
- Any deployment or backward-compatibility notes
