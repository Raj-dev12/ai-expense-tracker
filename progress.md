# Progress

What's built, what isn't. Updated as we go.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Hour 1 — foundation

- [x] Repository created and first commit made
- [x] PostgreSQL running in Docker
- [x] Drizzle configured and connected
- [x] Schema written: users, categories, expenses
- [x] Migration applied
- [x] Seed script writes one demo user and 97 expenses over 3 months
- [x] `GET /api/health` responds
- [x] Expenses CRUD works, verified with curl
- [x] Zod validation on every route

## Hour 2 — the AI layer

- [x] `ExpenseParser` interface defined
- [x] Mock parser works with no network access
- [x] Claude adapter using structured output
- [x] OpenAI adapter using structured output
- [x] Provider chosen by environment variable, defaults to mock
- [x] Parser output validated with Zod before it leaves the backend
- [x] Falls back to mock when a real provider fails — errors, timeouts, a missing key,
      and replies that fail validation all end up on the mock
- [x] `POST /api/ai/parse-expense` returns a suggestion and saves nothing

## Hour 3 — the frontend

- [x] Analytics endpoints: summary, categories, trend (listed in the build plan but
      missed by hour 1, and needed before any chart can be drawn)
- [x] React and Vite project running
- [x] Tailwind configured
- [x] Natural-language add box
- [x] Interpretation shown as editable chips before saving
- [x] Confirm button saves via the validated endpoint
- [x] Summary cards
- [x] Category pie chart
- [x] Three-month trend line
- [x] Recent expenses list, original currency shown when not EUR

## Hour 4 — MCP and exchange rates

- [x] MCP server scaffolded
- [x] `add_expense`
- [x] `list_expenses`
- [x] `search_expenses`
- [x] `get_spending_by_category`
- [x] `get_expense_summary`
- [x] `delete_expense`
- [x] Tool descriptions written clearly
- [x] Connected to an AI client and verified end to end
- [x] Exchange rates fetched and cached for 24 hours
- [x] Static fallback rates when the API is unreachable
- [x] Non-euro amounts converted before storage

## Hour 5 — deployment

- [x] Dockerfiles for frontend and backend (the MCP server runs locally over stdio,
      so it has none and is not in compose)
- [x] `docker compose up` works locally
- [x] Caddyfile serves frontend and proxies `/api`
- [x] Backend applies migrations itself on every start, so a new machine needs no
      manual setup step
- [x] Verified from an empty database in a throwaway copy of the stack: up, migrate,
      seed, 97 expenses, analytics answering. The real database was never touched.
- [ ] Hetzner server created, Finland region
- [ ] Docker installed on the server
- [ ] Repository deployed
- [ ] sslip.io address resolving
- [ ] HTTPS padlock showing
- [ ] Seed script run in production

## Beyond the plan

Asked for after the build plan was written, and built on request rather than suggested.

- [x] `PATCH /api/expenses/:id` — any field editable, same Zod field schemas as create,
      and the euro figure recomputed only when the amount, currency or date moves
- [x] Edit control on each row of the recent list, reusing the confirm step chips
- [x] `update_expense` MCP tool, so an assistant can correct a row it added
- [x] Verified: 67 backend tests, all render checks, all seven MCP tools over stdio
- [x] Base currency is a setting, not a hardcoded EUR: `users.base_currency` is finally read,
      `amount_eur` renamed to `amount_base` throughout, a picker at the top right, and a
      `PATCH /api/settings` that relabels rows already in the old base and recomputes the rest

## Finishing

- [x] Extra feature: `POST /api/ai/monthly-summary` and a button on the dashboard.
      Works on the mock with no key, and the card names the parser that actually wrote
      the sentence rather than the one configured.
- [x] README written: screenshot, architecture diagram, stack, two-command local setup,
      the AI safety pattern, the no-key promise, and why the MCP server is not in compose.
      Also lists plainly what is not built yet.
- [ ] `learnings.md` complete
- [ ] Repository pushed to GitHub and made public

---

## Blockers

Anything currently stuck, and what it's waiting on.

_None yet._
