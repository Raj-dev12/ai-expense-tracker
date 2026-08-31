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
      `amount_eur` renamed to `amount_base` throughout, and a picker at the top right
- [x] Superseded that: switching currency now changes the symbol and nothing else, so a
      round trip is lossless. Conversion moved behind `FX_CONVERSION`, off by default, with
      every part of it kept — live rates, the cache, the business-day fallback, the fixed table
- [x] Seed data is plain numbers: the four foreign-currency rows are gone, 93 expenses
- [x] Currency is chosen on first visit, before anything can be entered, from all 162 ISO 4217
      codes, and remembered on the user so it is asked once
- [x] `GET /api/categories` reads the categories table, which the seed had been writing and
      nothing had ever read
- [x] MCP tools hold no category list of their own: read fresh on every call, matched
      case-insensitively, and an unknown one is answered with the list that does exist
- [x] `build-plan.md` updated first: categories are no longer a fixed list of nine, and the
      interface can delete expenses and add or remove categories
- [x] `POST` and `DELETE /api/categories`; `createExpenseSchema` validates against the table
      instead of the `CATEGORY_NAMES` enum, so the enum stops blocking new categories
- [x] "Type a new category" in the category box; a Categories panel that deletes one, showing
      how many expenses it holds and offering reassign-or-delete; a delete button on each
      expense with a confirmation naming what goes
- [x] `Uncategorised` is a real category, seeded and migrated in, and cannot be deleted
- [x] Fixed: the browser sent `Content-Type: application/json` on DELETE requests that have
      no body, which Fastify refuses — the same bug fixed in the MCP client in hour 4, back
      again because they are two applications with two clients. Four checks now inspect the
      request that goes out, so a third recurrence fails the build
- [x] All category management in one panel — add, rename, delete — and the dropdown on an
      expense only chooses. Renaming rewrites every expense holding the old name, in one
      transaction, with the count shown first
- [x] The expense list shows all of them in one request, scrolling inside a fixed height
      rather than growing the page
- [x] The MCP check script cleans up after itself even when it throws: a sweep in a finally,
      and another at startup for the case a finally cannot cover — proved by sabotaging it
- [x] Day view: a table of one day with a date picker, reusing `GET /api/expenses` with
      `from` and `to` set to the same date rather than adding an endpoint
- [x] The summary button was never dead: the parser is deterministic, so a second press
      returned the identical sentence and nothing changed on screen. It now blanks the
      text while it works and stamps the time it was written
- [x] Pie slices and legend rows open a panel listing that period's expenses in the
      category, dismissed by clicking away or pressing Escape
- [x] Period dropdown: day, week, month, quarter, half year, three quarters, year — all
      calendar, all running from the start of their block to today. It governs the cards,
      the written summary and the pie, so the three cannot describe different stretches
- [x] `GET /api/analytics/summary` and `POST /api/ai/monthly-summary` now take `from` and
      `to`; both took nothing at all before, so this was a backend change, not just wiring
- [x] Query box: `POST /api/ai/ask` turns a question into a structured query the backend
      runs. The model never sees an expense and never produces a figure — a five-member
      closed grammar is the boundary, and declining is a member of it rather than an error
- [x] Text that reads as an expense is signposted to the add box rather than refused
- [x] 46 pure tests pin the boundary, including the ones that must be refused
- [x] Summary cards stopped saying "month": every label assumed one, so six of the seven
      periods were reported wrongly. The comparison note now names the window it actually
      compared against, taken from the response rather than described in prose
- [x] README audited end to end against the code; thirteen drifted claims fixed
- [x] Seed guarantees one expense per category in the current calendar month — seeding on
      the 1st used to open an empty dashboard, which reads as broken rather than as new
- [x] New screenshot, with a caption that describes what the image actually shows
- [x] The never-drop-a-constraint rule moved from three preposition-shaped guards to one
      whitelist that accounts for every word, checked before any query shape is chosen —
      "lowest food expense" had walked past all three and answered with a real number

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
