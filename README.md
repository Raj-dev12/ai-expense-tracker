# AI expense tracker

Type an expense as a sentence. An AI reads it, shows you what it understood, and you confirm
before anything is saved.

---

![The single page: an add box, summary cards, a category breakdown, a weekly trend line and the recent expenses](docs/screenshot.png)

<sub>Sample data, shown in euros — the currency is chosen on first run, so yours may read
differently. Each row in the recent list says where it came from — `added by seed`,
`added by mcp` — which is the `source` column described further down.</sub>

---

## What it does

You write "spent 42 euros at Lidl yesterday" into a box. The backend hands that sentence to
an AI parser, which returns a *suggestion*: an amount, a currency, a merchant, a category and
a date. The page shows that suggestion as editable chips so you can correct anything it got
wrong, and only when you press confirm does the browser call the ordinary, validated endpoint
that writes a row. Below the box, a dashboard shows the month's total against the same
stretch of last month, a pie of where the money went, a fourteen-week trend line, and every
expense in a list that scrolls inside its own box. You pick your currency the first time you open it, from all 162 ISO 4217 codes,
and every amount is shown in it; changing it later moves no stored number. A
button asks the AI to describe the month in a sentence or two, and the card underneath it says
which parser actually wrote that sentence. Any row in the list can be corrected in place or deleted,
using the same chips the confirm step uses, and categories can be added and removed. An MCP server lets an outside AI assistant query
the same data, add expenses and correct them, through the same API a browser uses.

## Architecture

```
                    ┌───────────────────────────────────────────────┐
                    │  docker compose                               │
                    │                                               │
  browser ──────────┼─▶ web ──── /api/* ──▶ backend ────▶ db        │
                    │   Caddy              Fastify       Postgres   │
                    │     │                                         │
                    │     └── everything else: the built React app  │
                    └───────────────────────────────────────────────┘
                            ▲
                            │ HTTP, the same public API
                            │
  an MCP client ───▶ mcp server
                     stdio, runs on your own machine,
                     not in docker compose — see below
```

Three containers. Only the web container is reachable from outside Docker: the backend
publishes no port of its own, so every request — from the browser, from curl, from the MCP
server — arrives through the same front door. Postgres is published to `127.0.0.1` only, so
a backend running outside Docker can still connect while the database stays unreachable from
anywhere else.

## The stack

| Piece | What | Why |
|---|---|---|
| Backend | TypeScript, Fastify, Drizzle, PostgreSQL, Zod | Zod validates every input crossing a boundary. Money is `numeric(12,2)` — a decimal column, never a float. Every row stores what was spent and its value in the base currency. |
| Frontend | TypeScript, React, Vite, Tailwind, Recharts | One page, no router. Light theme, one accent colour. |
| AI | `@anthropic-ai/sdk`, `openai`, and an offline mock | One `ExpenseParser` interface, three implementations, chosen by an environment variable. |
| MCP | `@modelcontextprotocol/sdk` over stdio | Seven tools, each calling the backend's HTTP API rather than the database. |
| Serving | Caddy | Serves the built frontend, proxies `/api`, and obtains HTTPS certificates by itself. |
| Exchange rates | Frankfurter (ECB data) | Free, no key, history back to 1999. Cached for 24 hours, with a static fallback table. Switched off by default — see below. |

## Running it locally

You need Docker. Two commands:

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
docker compose up -d --build
```

Then open **http://localhost**.

No API key is needed and nothing in `.env` needs editing first — see [It runs with no API
key](#it-runs-with-no-api-key). The backend applies its own database migrations every time it
starts, so there is no separate setup step.

The app starts with an empty database. To load the demo data — one user and 93 expenses
spread over three months, generated from a fixed random seed so it is identical every time:

```bash
docker compose exec backend node dist/db/seed.js
```

That script **deletes every existing expense** before it writes, which is why it refuses to
run unless `ALLOW_SEED=true` is set. `.env.example` sets it.

Useful afterwards:

```bash
docker compose logs -f          # watch all three containers
docker compose ps               # health of each
docker compose down             # stop, keeping the database
docker compose down -v          # stop and delete the database too
```

## The AI safety pattern

**The AI never writes to the database.** This is the rule the whole project is arranged
around, and it is worth more than any single feature in it.

`POST /api/ai/parse-expense` takes a sentence and returns a structured suggestion. It saves
nothing — no row, no draft, no side effect of any kind. The browser displays that suggestion
as editable fields. Only when a person presses confirm does the browser call
`POST /api/expenses`, an ordinary endpoint that validates its body with Zod and knows nothing
about where the values came from.

```
sentence ─▶ parse endpoint ─▶ suggestion ─▶ a person reads it ─▶ confirm ─▶ validated
            (saves nothing)                 and corrects it                 write
```

Three things fall out of this:

- **A wrong guess is a visible correction, not bad data.** Parsers misread sentences. Putting
  a person between the guess and the write turns that weakness into something you can point at.
- **There is exactly one way to write an expense**, and it validates. The web form uses it.
  The MCP server uses it. Nothing has a private back door to the table.
- **The promise is checked, not trusted.** The parse response includes `saved: false`, and the
  browser asserts that field with Zod on every single call.

The `source` column records whether a row came from the web form, the MCP server or the seed
script — so you can prove that an AI assistant really did write to the database, and by which
route.

## It runs with no API key

`AI_PROVIDER` defaults to `mock`: an offline parser built from regular expressions and
keyword rules. It finds a number, guesses a merchant from capitalised words, matches a
category by keyword, and understands simple dates like "yesterday". It is deliberately
imperfect — which is exactly what the confirm step is for.

Clone this repository, set no keys at all, and every part of the app works. Set
`AI_PROVIDER=claude` or `AI_PROVIDER=openai` with the matching key and a real model answers
instead. If that provider errors, times out, or returns something that fails validation, the
request falls back to the mock rather than failing — and the response names the parser that
*actually* answered, not the one configured, because on a fallback those differ.

## The currency is the first question

There is no conversion by default. There is one currency — yours — and you pick it before
anything else happens, on a screen that comes before the dashboard rather than beside it. The
demo expenses are plain numbers, so what they are numbers *of* is the first thing worth
establishing; a page showing `1,741.66` with no symbol has told you almost nothing.

The choice is remembered against the user, so it is asked once. Afterwards the picker at the
top right changes it, offering all 162 codes ISO 4217 defines.

**Switching currency changes the symbol and nothing else.** No stored figure moves, so going
from EUR to JPY to SEK and back to EUR leaves the database byte for byte where it started.
Re-running the seed resets the question so the first-visit flow can be seen again.

### Conversion is still here, switched off

An earlier version of this converted every foreign amount to a base currency at the European
Central Bank's rate for the day it was spent. All of that code is still in the repository —
the live rate lookup, the 24-hour cache, the business-day fallback for weekend dates, and the
fixed table used when the service cannot be reached. It is behind one environment variable:

```bash
FX_CONVERSION=on    # in .env, then: docker compose up -d backend
```

With it **off** (the default), a currency named in a sentence is ignored and the number is
stored exactly as typed — "30 quid" with a euro base records 30 euros. The currency field
disappears from the interface, because offering a choice that will be ignored is worse than
offering none.

With it **on**, the amount is converted at the rate from the day it was spent, both figures
are kept, and the original currency appears in small text beside any row that was not in the
base. The seed data has no foreign rows any more, so the way to see it work is to switch the
flag on and add one.

Why off by default: conversion made the base currency load-bearing. Changing it had to
rewrite stored figures, which made switching lossy and irreversible. Off, the base is a label,
and a label can be changed as often as you like.

## Categories are editable

They started as a fixed list of nine enforced by a Zod enum, which meant a category could
never be added — the list was compiled in. `build-plan.md` records the change; the
`categories` table is the source of truth now, and the enum is gone.

- **Add, rename and remove** them in the Categories panel, which shows how many expenses
  each one holds. The category dropdown on an expense only *chooses* — one control, one job.
- **Renaming rewrites the expenses too.** An expense stores its category as text rather than
  a foreign key, so there is no cascade to rely on; the rename and the rewrite happen in one
  transaction, and the panel says how many expenses it will touch before you confirm.
- **Delete an expense** from its row in the list, after a confirmation that repeats
  the expense back — amount, merchant, date and category — because the wrong Delete is one
  pixel from the right one.

### Deleting a category that has expenses in it

The panel says how many, and offers two answers:

| Choice | What happens |
|---|---|
| Move to Uncategorised | The expenses stay; only the label goes. |
| Delete them too | The expenses are removed with it. Not undoable. |

There is no default and no third "just do something sensible" option, because both guesses
are bad: one destroys expenses over a tidied label, the other keeps rows somebody meant to
clear out. The API refuses a delete that does not say which — `?expenses=` is required.

`Uncategorised` is a real category rather than an empty value, so charts, filters and totals
need no special case for "no category". It is the one category that cannot be deleted: it is
where the others send their expenses.

### The enum did not get weaker, it moved

Validation used to be `z.enum(CATEGORY_NAMES)` inside `createExpenseSchema`. It is now a
lookup against the table, in the route — a database read, which a synchronous Zod schema is
the wrong place for. The 400 it returns has the same shape, so a caller cannot tell which
kind of check refused it, and does not need to.

## The MCP server runs locally, not in compose

An MCP server exposes tools to an AI assistant. This one has seven: `add_expense`,
`update_expense`, `list_expenses`, `search_expenses`, `get_spending_by_category`,
`get_expense_summary` and `delete_expense`.

It is **not** a container and is **not** in `docker-compose.yml`, and that is deliberate
rather than unfinished. It speaks the stdio transport: the AI client launches it as a child
process on your own machine and talks to it over standard input and output. There is no port
for it to listen on and nothing for a remote server to connect to, so putting it in compose
would produce a container nothing could ever reach. Instead it calls the backend's HTTP API
over the network, exactly as a browser does.

That has a second benefit worth naming. Because every tool goes through the public API, the
validation rules live in exactly one place — the MCP server cannot store an expense the web
form would have rejected, because it uses the endpoint the web form uses.

The tools hold no copy of the category list either. They read `GET /api/categories` on every
call, the same way they ask which currency to report in, so an assistant is never offered a
category the server has stopped recognising. That is guidance, not enforcement: a tool that
was handed something unknown answers with the list that does exist, so the assistant can
correct itself — but the backend refuses an invented category regardless, and going straight
to `POST /api/expenses` with one still returns a 400.

To connect it, build it and point your MCP client at the compiled entry point:

```bash
cd mcp && npm install && npm run build
```

```json
{
  "mcpServers": {
    "expense-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": { "BACKEND_URL": "http://localhost" }
    }
  }
}
```

`BACKEND_URL` depends on how the backend is running: `http://localhost` under compose (port
80, through Caddy), or `http://localhost:3000` when running it directly with `npm run dev`.

## The API

```
GET    /api/health
POST   /api/expenses
GET    /api/expenses            from, to, category, minAmount, search, limit, offset
GET    /api/expenses/:id
PATCH  /api/expenses/:id      change any field; omitted fields are left alone
DELETE /api/expenses/:id
GET    /api/analytics/summary   month to date, vs the same days last month
GET    /api/analytics/categories
GET    /api/analytics/trend     weekly buckets
GET    /api/categories          the categories, with how many expenses each holds
POST   /api/categories          add one
PATCH  /api/categories/:name    rename it, and every expense filed under it
DELETE /api/categories/:name    remove one; ?expenses=reassign or ?expenses=delete
GET    /api/settings            the currency, whether it was chosen, and the ISO list
PATCH  /api/settings            change it; writes one column and no amounts
POST   /api/ai/parse-expense    sentence in, suggestion out, saves nothing
POST   /api/ai/monthly-summary  this month in a sentence or two, saves nothing
```

Unknown query parameters are rejected with a 400 rather than ignored, because
`?form=2026-08-01` is a typo, and silently ignoring it produces a chart that looks fine and
answers a different question.

## What is not built

Written down plainly, because a README that quietly implies more than exists is worse than
one that admits the gaps.

- **It is not deployed yet.** Everything above runs under `docker compose` on a laptop, and
  that has been tested from an empty database. The VPS, the sslip.io address and the HTTPS
  padlock are the remaining half of the deployment work and have not been done.
- **There is no login.** One demo user, created by the seed script, looked up on every
  request. `user_id` is never read from a request body, so adding real authentication later
  changes one function rather than every query.

## Deliberately out of scope

Budgets, recurring expenses, CSV import, receipt photos and multi-user support. All
reasonable ideas; all would make this a bigger project rather than a clearer one.

## Repository layout

```
.
├── backend/          Fastify API — routes, Drizzle schema, AI adapters, FX
│   └── Dockerfile    multi-stage: compiles TypeScript, ships only the result
├── frontend/         React single page
│   └── Dockerfile    multi-stage: vite build, then Caddy serving the files
├── mcp/              MCP server — seven tools, calls the HTTP API (no Dockerfile)
├── Caddyfile         serves the frontend, proxies /api to the backend
├── docker-compose.yml
├── build-plan.md     the full specification
├── learnings.md      every term explained, and why each decision was made
└── progress.md       what is built and what is not
```

`learnings.md` is written for someone learning this as they build it: every term introduced
gets a plain-language explanation, and every real decision gets a row in a table saying what
was chosen and why.
