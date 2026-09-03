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


## Hour 5b — Vercel and Supabase, alongside Docker

Added on request. The Docker setup is untouched: same Dockerfiles, same `docker-compose.yml`,
same `Caddyfile`, still the way the project is meant to be read.

- [x] `backend/src/app.ts` — `buildApp()` split out of `index.ts`, so the app is built in one
      place and only the last three lines of `index.ts` know about opening a port
- [x] `backend/api/index.ts` — one serverless function answering every `/api/` path,
      handing each request straight to that same app. No route, schema or query changed
- [x] `DB_POOL_MAX` and `DB_SSL` added to the environment schema and used by the pool, plus a
      10-second connection timeout so a function cannot burn its whole budget waiting
- [x] `backend/vercel.json` (build command, `maxDuration: 30`, which `AI_TIMEOUT_MS=15000`
      needs and Vercel's default 10 would have killed) and a small `public/index.html` so the
      backend project has something to serve
- [x] `frontend/vercel.json` — SPA fallback plus the `/api/*` rewrite to the backend project,
      which is what keeps the browser on one origin and this repository free of CORS
- [x] `tsconfig.api.json`, and `npm run build` now type-checks the Vercel entry point too, so
      a typo there fails locally and in Docker rather than only during a deploy
- [x] MCP request timeout 10s → 20s, to cover a cold start. Nothing else about the MCP server
      changed: it still reads categories and the base currency fresh on every call
- [x] Verified: 113 backend tests pass; both entry points answered against the local database
      — the listening one and the serverless one, the latter through a throwaway harness that
      calls the handler exactly as Vercel does. Health, analytics, the 404 handler and a
      rejected POST all behaved identically
- [x] `README.md` has a "Deploying it: two ways" section with the full Supabase and Vercel
      walkthrough; `learnings.md` gained ten terms and nine decision rows; `.env.example` and
      `build-plan.md` record the addition
- [x] Supabase project created (Central EU, Frankfurt), migrations applied from a laptop
      against the session pooler, seeded with 93 expenses
- [x] Backend deployed: `ai-expense-tracker-rho-silk.vercel.app`, `/api/health` reporting the
      database reachable through the transaction pooler
- [x] `TZ` dropped from the Vercel variables — Vercel reserves the name, and nothing has ever
      read it. `lib/dates.ts` names the zone explicitly, which `/api/health` confirms
- [x] Fixed after probing the live deployment: `api/[...path].ts` was borrowing Next.js's
      catch-all convention, which plain Vercel routing does not have. It read the brackets as
      one dynamic segment called `...path`, so `/api/health` worked by accident,
      `/api/analytics/summary` never reached Fastify at all, and every request carried a stray
      `...path` query parameter that the strict filter schemas refused. Now `api/index.ts`
      with an explicit `/api/(.*)` rewrite. Verified locally on nested paths before pushing
- [x] `frontend/vercel.json` points at the backend's production domain — the stable one, not
      the per-deployment URL, which carries a hash that changes on every deploy and would have
      pinned the frontend to one old backend while still looking healthy
- [ ] Frontend imported as a second Vercel project, root directory `frontend`
- [ ] `BACKEND_URL` in `.env` switched to the deployed address and the MCP server retried
      against it


## After deployment — three reports from the live app

Found by using it, not by testing it. Each was investigated before anything was changed.

- [x] **The pie's tooltip and its click-through disagreed about the same slice.** Hovering the
      folded slice said €116.60 across 5 expenses; clicking it listed one, a €38.49 Posti
      expense. The fold collapses everything past the fifth category into one slice, and that
      slice carried only the name `Other` — which is also a real category — so the panel
      filtered on the literal name. Confirmed against the live API before touching anything:
      the five folded categories sum to exactly €116.60, and `?category=Other` returns exactly
      the one Posti row
- [x] The same bug explained the second report: `Restaurants` had no slice on the chart while
      the query box still answered questions about it by name. It was inside the folded slice,
      unnamed
- [x] A slice now carries `members`, the categories it stands for. `GET /api/expenses` takes a
      repeated `category` key so the panel asks for exactly that set — in the backend rather
      than filtering in the browser, so there is one definition of what "in these categories"
      means
- [x] A folded slice is labelled as a group, `Other · 5 categories`, and writes its members out
      in the legend and the tooltip, so a real category can no longer vanish from the chart
- [x] Checks that pin the seam: the group's total and count must equal its members', the panel
      must ask for every one of them, and by repeated key rather than a joined string. The
      existing checks all tested the fold's arithmetic and all passed while the chart and the
      panel disagreed — the bug lived between two things that were each correct
- [x] **"That is 2586% more than the stretch before it."** On the 1st of a month the period is
      one day and the stretch before it is one day, so the percentage described whether a
      single purchase happened to land inside the window. Not capped — a cap still answers a
      question that should not have been asked. `lib/baseline.ts` decides whether the baseline
      is a sample at all, and fewer than three expenses is not one
- [x] "Nothing recorded then" and "too little to compare" are now different sentences on the
      card and in the written summary, rather than one dash meaning either. The real-provider
      prompt is told the same rule, and told never to leave the comparison out silently
- [x] **A compound question was half-answered.** "How much did I spend on restaurants today and
      where did I spend it" returned the amount and dropped "where" without a word. It passed
      every existing guard: every word known, category and date both matched, nothing unread.
      `unreadWords` guards against dropping a *constraint*; this was an unrecognised *ask*,
      which the whitelist cannot see because "where" is a perfectly known word
- [x] `asksIn()` counts the interrogative heads, in the order the sentence asks them, before a
      shape is chosen. Keyed on heads rather than question words, so "which month did I spend
      most on restaurants" is still one question rather than two
- [x] Each ask then becomes a query of its own and the sentences are joined, so both halves are
      answered rather than both refused. They share the filters the whole sentence sets — the
      "it" in "where did I spend it" means the restaurant spending of that day, and reading the
      clauses separately would have widened the second part into a different question
- [x] An ask with no shape at all — "who" — is named in the reply rather than dropped, so a
      partly answerable question says which part it could not do. A compound is typed to hold
      only answerable parts, so it cannot contain a refusal or another compound
- [x] `where` and `when` now answer — by shop and by day. Both were known words no shape read,
      so "where did I spend the most" had been quietly becoming a plain total
- [x] Found while fixing that: a period phrase was being read twice. "Where did I spend the most
      this month" grouped by *month* and answered with the highest month, having been asked
      about shops. The matched window is removed before the grouping is chosen
- [x] Found while verifying: `npm run cycle` had three checks that could never pass. They
      counted `<form>` elements and expected two, which was true when the page had one form and
      stopped being true when the query box and the categories panel arrived. They now ask for
      the Save expense button by name
- [x] Verified: 133 backend tests, all frontend checks, the full cycle check, all seven MCP
      tools, and the folded set confirmed end to end against a real database — tooltip €116.60
      across 5, click-through €116.60 across 5


## Period navigation

Asked for after the deployment fixes. The dropdown was anchored to today, so July was
unreachable.

- [x] The period is a *selection* now, not a period name: a named block plus an offset, or a
      custom range. `windowForSelection` is the one place that turns it into dates
- [x] Back and forward arrows step the block. Forward stops at the present — there is no
      spending in the future, and walking into empty months invites the wrong question
- [x] A stepped block is complete (1–31 August) while the current one runs to today. That is
      what makes the comparison like for like: a whole August against a whole July
- [x] Month arithmetic never touches a `Date`. `setMonth` rolls over rather than clamping —
      31 March minus one month is 3 March — so whole months are shifted as numbers and the day
      is attached afterwards
- [x] Labels are absolute once stepped: "August 2026", "Q2 2026", "2025". Never "last month",
      which is readable once, and never "three quarters ago", which collides with the period of
      that name. The grammar follows too — "Spent in August 2026", "Spent on 2 Sep 2026"
- [x] Custom range: two date inputs, each bounded by the other so a range cannot be typed
      backwards. No arrows, because stepping one would have to invent a stride
- [x] A custom range gets no comparison. `compare=false` on the summary endpoint and in the
      written summary; the card says "No comparison for a custom range" rather than showing a
      dash, which would be indistinguishable from the two silences already there
- [x] The trend line follows the period's *end* while staying fourteen weeks wide. This retires
      the "trend chart ignores the dropdown" entry from the not-built list rather than deepening
      it — pinned to today it would have been one chart on a July dashboard describing September
- [x] The expenses list follows the period too. It had been asking for the most recent expenses
      regardless, invisible while every period ended today and plainly wrong once you could step
      back and read September's rows under a July dashboard
- [x] The day view stays independent, as documented — its own picker, its own question
- [x] Found while verifying: a check counted every `<button>` in the analysis card and expected
      one, which was about there being a single *primary* action. The period arrows are neutral
      controls that compete with nothing, so it now counts accent-coloured buttons and does not
      drift when another quiet control is added
- [x] Verified: 138 backend tests, 40 new period checks, the full cycle check, all seven MCP
      tools, and a complete August comparing against a complete July (−7.8%) end to end

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
