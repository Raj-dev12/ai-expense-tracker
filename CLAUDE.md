# CLAUDE.md

Read `build-plan.md` for the full specification. This file is the rules.

## Project

A single-page AI expense tracker. The user types an expense as a sentence, an AI parses it,
the user confirms the interpretation, and it's stored. Dashboard shows totals, a category
pie, a three-month trend and a recent list. An MCP server exposes the data to outside AI
assistants. Runs on a VPS in Docker behind Caddy.

## Who you're working with

The person building this is a beginner and does not know programming terminology. When you
introduce a concept, library or pattern for the first time, explain it in one or two plain
sentences, and add an entry for it to `learnings.md` under the right section. Do not assume
familiarity with anything. Do not skip the explanation because the code is obvious to you.

Keep `progress.md` updated as work completes. Add to the decisions table in `learnings.md`
whenever a real choice gets made, including the reasoning.

## Non-negotiable rules

- The AI never writes to the database. It returns a suggestion; the user confirms; a
  validated endpoint stores it. Never shortcut this.
- Every input crossing a boundary is validated with Zod. HTTP request bodies, AI responses,
  MCP tool arguments, external API responses. No exceptions.
- Money uses a decimal column type, never a float.
- Secrets live in `.env`, which is gitignored. Never hardcode a key, never commit one, never
  print one in logs.
- The MCP server calls the backend's HTTP API. It never touches the database directly, so
  validation rules live in exactly one place.
- The app must run fully with no API key set, using the mock parser.

## Conventions

- TypeScript everywhere. No plain JavaScript files.
- Backend: Fastify, Drizzle, PostgreSQL, Zod.
- Frontend: React, Vite, Tailwind, Recharts. One page, no router.
- Light theme, generous whitespace, one accent colour. Sentence case in all UI text.
- Amounts display as euros. Show the original currency in small muted text when it wasn't
  euros.
- Prefer plain code over clever code. This repository is a demonstration; readability is a
  feature.

## Scope discipline

Build only what is in `build-plan.md`. Budgets, recurring expenses, CSV import and
multi-user support are explicitly out of scope. If one seems worth adding, suggest it and
wait — do not build it.

Receipt scanning *was* on that list and is now built. It came off it because the reasons it
was rejected stopped applying: OCR runs in the browser, so there is no upload, no image
storage and no API key. A reversal like that gets a row in the decisions table saying what
changed, not a quiet edit.

Do not add a dependency without saying what it's for and what the alternative was.

## Commands

```
docker compose up -d          start everything
npm run dev        (backend)  dev server with reload
npm run db:migrate            apply schema changes
npm run db:seed               reset and load demo data
npm run dev        (frontend) vite dev server
```

## Environment variables

```
DATABASE_URL
AI_PROVIDER          mock | claude | openai        default mock
ANTHROPIC_API_KEY    optional
OPENAI_API_KEY       optional
FX_API_URL
BACKEND_URL          used by the MCP server
DOMAIN               used by Caddy
```

## Before saying a task is done

- It runs with `AI_PROVIDER=mock` and no keys present.
- New inputs are Zod-validated.
- `learnings.md` covers any new term introduced.
- `progress.md` reflects reality.
