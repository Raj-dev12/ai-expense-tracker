# Build plan — AI Expense Tracker

Everything we agreed, written so you can hand chunks of it straight to Claude Code.
Term you don't recognise? It's in `learnings.md`.

---

## The one-paragraph version

A single-page web app where you type an expense as a sentence. An AI reads it, shows you
what it understood, and you confirm before it's saved. Everything is stored in euros. The
page shows a total, a pie chart of categories, a three-month trend line, and a list of
recent expenses. There's a button that asks the AI to write a summary of your month. An MCP
server lets an outside AI assistant query and add expenses. It all runs on a rented server
in Docker, behind HTTPS.

---

## Locked decisions

| Area | Decision |
|---|---|
| Login | None. One built-in demo user. |
| Look | Light, clean, generous spacing, one accent colour. |
| AI | Swappable providers behind one interface, plus an offline fake. |
| Seed data | ~90 expenses across 3 months, loaded by a re-runnable script. |
| Currency | Base EUR. Store original amount and converted amount. |
| Address | Free `sslip.io` address, real HTTPS. |
| Extra feature | AI monthly summary. No receipt photos. |
| AI safety | Confirm step. AI never writes to the database directly. |
| Charts | Pie for categories, line for the trend. |
| Pages | One scrolling page. No routing. |

---

## Repository layout

```
ai-expense-tracker/
├── README.md
├── learnings.md
├── progress.md
├── docker-compose.yml
├── Caddyfile
├── .env.example
├── .gitignore
├── backend/
│   ├── src/
│   │   ├── index.ts          server entry
│   │   ├── db/               schema, migrations, seed script
│   │   ├── routes/           expenses, analytics, ai, health
│   │   ├── ai/               interface + claude / openai / mock adapters
│   │   ├── fx/               exchange rate lookup and cache
│   │   └── schemas/          Zod validation
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── components/
│   └── Dockerfile
└── mcp/
    ├── src/index.ts          the six tools
    └── Dockerfile
```

Three separate applications sharing one repository. This is called a monorepo, and it suits
a demo because a visitor sees the whole system in one place.

---

## Database

Three tables. Resist adding a fourth.

**users** — `id`, `email`, `base_currency`, `created_at`
One row, inserted by the seed script.

**categories** — `id`, `name`
Fixed list: Groceries, Restaurants, Transport, Shopping, Bills, Entertainment, Health,
Travel, Other.

**expenses** — `id`, `user_id`, `amount`, `currency`, `amount_eur`, `merchant`, `category`,
`description`, `expense_date`, `created_at`, `source`

`source` records whether the row came from the web form, the MCP server, or the seed script.
Costs nothing, and lets you prove during the demo that an AI assistant really did write to
your database.

---

## Backend endpoints

```
GET    /api/health
POST   /api/expenses
GET    /api/expenses            filters: from, to, category, minAmount
GET    /api/expenses/:id
DELETE /api/expenses/:id
GET    /api/analytics/summary   total, count, daily average, vs last month
GET    /api/analytics/categories
GET    /api/analytics/trend
POST   /api/ai/parse-expense    sentence in, structured suggestion out, saves nothing
POST   /api/ai/monthly-summary
```

`/api/ai/parse-expense` saving nothing is the whole point. It suggests. The browser shows
the suggestion. Only when you press confirm does the browser call `POST /api/expenses`,
which validates properly and stores it.

---

## Hour by hour

Roughly five hours. If you fall behind, drop hour 5 — a working local app with a great
README still demos fine.

### Hour 1 — foundation

Postgres in Docker, Drizzle schema, migrations, seed script, expenses CRUD, health check.
Test with curl before touching the frontend.

> Ask Claude Code: *Set up a Fastify backend in TypeScript with Drizzle and PostgreSQL.
> Create users, categories and expenses tables as specified. Write a seed script that
> inserts one demo user and about ninety realistic euro expenses spread over the last three
> months, weighted so groceries and bills are the largest categories. Add CRUD routes for
> expenses with Zod validation on every input. Add a health endpoint.*

**Done when** you can create and list expenses with curl, and re-running the seed script
resets cleanly.

### Hour 2 — the AI layer

The provider interface, the mock, one real adapter, the parse endpoint.

Build the mock first. It should find a number, guess a merchant from capitalised words,
match a category by keyword, and read simple dates like "yesterday". Deliberately imperfect
— that's what the confirm step is for.

> Ask Claude Code: *Create an ExpenseParser interface with one method that takes a sentence
> and today's date and returns a structured expense suggestion with a confidence score.
> Implement three adapters: mock (regex and keyword rules, no network), claude, and openai,
> both using structured output. Choose the adapter from an environment variable, defaulting
> to mock. Validate every parser result with Zod before returning it, and fall back to mock
> if the real provider errors or times out.*

**Done when** `POST /api/ai/parse-expense` returns sensible structured data with no API key
set anywhere.

### Hour 3 — the frontend

One page. Add box at the top, then summary cards, then pie and trend charts, then the list.

> Ask Claude Code: *Build a React and Vite frontend in TypeScript with Tailwind. Single page,
> light theme, generous whitespace, one accent colour, no borders where spacing will do.
> Sections: a natural-language add box that calls the parse endpoint and displays the
> interpretation as editable chips before a confirm button saves it; summary cards; a
> Recharts pie of categories and a line chart of the last three months; a list of recent
> expenses showing the original currency in small grey text when it wasn't euros.*

**Done when** you can type a sentence, correct the interpretation, save it, and watch the
charts move.

### Hour 4 — MCP and the exchange rate API

Six tools: `add_expense`, `list_expenses`, `search_expenses`, `get_spending_by_category`,
`get_expense_summary`, `delete_expense`. Every one calls your existing HTTP endpoints rather
than the database — one set of rules, enforced in one place.

Write the tool descriptions carefully. The AI reads them to decide what to call, so they're
prompts, not documentation.

FX: fetch rates from a free exchange rate API, cache for 24 hours, fall back to a hardcoded
table if it's unreachable. Convert on the way in and store both amounts.

> Ask Claude Code: *Build an MCP server with the TypeScript SDK exposing these six tools,
> each calling the backend's HTTP API. Write clear tool descriptions. Separately, add a
> currency module that fetches daily rates, caches them for 24 hours, falls back to static
> rates on failure, and converts non-euro amounts to euros before storage.*

**Done when** you can connect the MCP server to an AI client and ask how much you spent on
restaurants this month, then tell it to add an expense, and see it appear in the browser.

### Hour 5 — deployment

Dockerfiles, compose, Caddy, server, live.

Order matters: get it working with compose on your own machine first. Only then touch the
server. Debugging a broken build over SSH is miserable.

> Ask Claude Code: *Write Dockerfiles for frontend, backend and MCP, a docker-compose.yml
> including PostgreSQL with a named volume, and a Caddyfile that serves the frontend and
> proxies /api to the backend, using a domain from an environment variable.*

Then: create the smallest Hetzner server in the Finland region, install Docker, copy the
repo across, point Caddy at `expenses.<your-ip-with-dashes>.sslip.io`, start it, run the
seed script.

**Done when** the address loads over HTTPS with a padlock.

---

## Also worth an hour: the README

For a demo repository this matters more than any single feature. Most visitors read it and
nothing else.

Include a screenshot near the top, one paragraph on what it does, an architecture diagram,
the stack, how to run it locally in two commands, a short section on the AI safety pattern,
and a note that it runs with no API key thanks to the mock provider. That last detail
signals more engineering maturity than most of the code will.

---

## Traps

- **Secrets in Git.** Write `.gitignore` before your first commit, with `.env` in it.
- **Floating point money.** Use a decimal column, never a float. `0.1 + 0.2` is not `0.3`.
- **Building the AI first.** Prove the boring path works before adding the clever part, or
  you'll be debugging two things at once.
- **A slow demo.** Cache exchange rates and keep the AI call off the critical path.
- **Scope creep.** Budgets, recurring expenses and CSV import are all reasonable ideas and
  all belong in a "possible next steps" section of the README, not in this build.
