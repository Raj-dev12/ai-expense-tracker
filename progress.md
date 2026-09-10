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

## Calendar view

- [x] `GET /api/analytics/daily` — one total per day that has spending, summed by PostgreSQL.
      The query sits in `lib/figures.ts` beside the pie's, because the app must have exactly
      one definition of "what you spent"
- [x] The alternative was fetching a month of expenses and adding them up in the browser. It
      would have worked and cost almost nothing, and it was still wrong twice over: a second
      definition free to disagree with the first, and float arithmetic on figures the decimal
      column exists to keep exact
- [x] Clicking a date needs no new endpoint. A day is a range whose ends match, so the table
      reads `GET /api/expenses?from=D&to=D`, exactly as the day view always did
- [x] Month grid: seven columns starting Monday, matching the trend chart and PostgreSQL's
      `date_trunc('week', ...)`. Always six rows, so the card does not change height as the
      arrows are pressed
- [x] A day with nothing in it shows its number and nothing else — no `€0.00`, which would
      look like data and bury the days that have something in them. Still clickable, because
      checking that a quiet day really was quiet is a normal thing to do
- [x] Days from the months either side are drawn faintly and are inert. Blank padding would
      lose the grid's shape at the corners; clickable padding would let the grid take you into
      a month its own heading is not totalling
- [x] The day view's date picker is gone. The calendar is the only way to choose a day now
- [x] The calendar's month is its own state, independent of the period stepper, and stepping it
      leaves the chosen day where it is. It names its month in its heading, because it can be
      showing a different one from the rest of the page
- [x] Found while verifying: the API refuses a future date in a filter, so asking for "1 to 30
      September" on the 9th was rejected outright. The window is clamped to today — the rule
      the rest of the app already follows, and nothing is lost because there is no spending in
      the future
- [x] Found while verifying: two of the new checks were passing for the wrong reason. One
      matched the word "disabled" and found it in the button's own class list, so it passed on
      enabled and disabled buttons alike; the other compared an expression with itself
- [x] `overflow-x-auto` and a minimum width on the grid. Seven columns on a phone leaves a cell
      about twenty-five pixels for text and an amount needs forty — the pie legend's failure
      exactly, and nothing that renders to a string can see it
- [x] Verified: 138 backend tests, 225 render checks, 16 new end-to-end calendar checks
      (`npm run calendar`) driving the real backend, the full cycle check, and the grid's
      totals matched the day table's on every day tried

## Layout rework

- [x] Two columns from 1280px, split by how much width each panel needs rather than by how
      important it is. Wide column: analysis, pie, calendar, day. Narrow column: trend,
      expenses, categories
- [x] The page widened from 896px to 1280px in the same change, because it had to be. Two
      columns inside the old width would have given each about 416px — the exact width that
      squeezed the pie legend to one letter per category
- [x] The split starts at `xl` and not `lg`. At 1024px the wide column is 587px inside its
      padding and the calendar grid needs 640px, so the grid would have started scrolling
      sideways at exactly the window width where it gained a second column — Session 11 again,
      in a feature two hours old. Caught in the arithmetic, before it was written
- [x] Spacing cut by about a third: sections 40px → 24px, card padding 24px → 20px, page
      padding 56px → 32px, corners 16px → 12px, calendar cells 64px → 56px. Roughly halves the
      page's height
- [x] Card chrome moved into one shared constant. It had been the same class string copied into
      seven components
- [x] A real reversal of the "light, clean, generous spacing" decision, recorded as one in the
      decisions table rather than applied quietly
- [x] Verified: the pie card goes from 368px inside its padding to 765px, so the legend now sits
      *beside* the chart rather than under it. It gets wider, not narrower — which is the whole
      point of widening the page at the same time as splitting it

## Collapsible panels

- [x] Four panels fold: analysis, day, expenses, categories. Only categories starts folded
- [x] The rule: a panel starts closed only if it is a tool you go looking for, never if it is
      information you would read. A first-time visitor lands on one closed strip, not a page of
      shut boxes
- [x] The charts and the calendar do not fold at all. A chart's whole value is being read
      without being asked for
- [x] The analysis card's header was split from its body, so the period dropdown stays visible
      when the card is folded. It governs every number on the page; a global control that hides
      itself is a bad control
- [x] A folded panel keeps its heading and a summary of what is inside — "Expenses · 92
      expenses". A closed box is a labelled strip, never a blank one
- [x] Clicking a date in the calendar force-opens the day panel. The calendar is the only way to
      reach a day, so a click that appears to do nothing is the feature appearing to do nothing
- [x] The folded state persists in `localStorage`, per browser, never reaching the server. Read
      back through Zod, because it is a boundary like any other — anything that does not parse
      falls back to the defaults rather than throwing
- [x] Unknown panel ids are filtered out rather than rejecting the whole list, so renaming a
      panel later forgets one line of somebody's layout instead of resetting it
- [x] Found while verifying: three new checks passed for the wrong reason — one searched the
      whole page for the word "hidden" and found it in `aria-hidden`, one counted every button
      with `aria-expanded` and found the pie legend's rows, and one asked whether *some* panel
      was open where it meant *this* one. Panels now carry a `data-panel` id so a check can name
      what it is asking about
- [x] The jsdom harness the end-to-end checks share was extracted rather than copied a third
      time (`check-harness.tsx`). `cycle-check` keeps its own copy, which wraps fetch for its
      own bookkeeping
- [x] Verified: 138 backend tests, 250 render checks, 31 new panel checks (`npm run panels`,
      including a full unmount and remount to prove persistence survives a reload), 16 calendar
      checks, the cycle check, and a production build

## Dates the parser can read

- [x] Month names, English and Finnish, full and abbreviated, in either order, with or without
      a year: "sept 4", "4 sept", "September 4th", "4 September 2026", "4. syyskuuta",
      "syyskuun 4.". English ordinals (1st, 2nd, 3rd, 4th) and the Finnish trailing dot
- [x] Finnish months are generated from one stem each plus the endings a date uses — *syys*,
      *syyskuu*, *syyskuuta*, *syyskuussa*, *syyskuun* — rather than sixty hand-written entries
- [x] Spellings without the umlaut (*kesakuuta*, *heinakuuta*) accepted, because a phone
      keyboard set to English does not give you ä
- [x] The alternation is sorted longest name first. `mar` is March and `marras` is November,
      and the short one listed first would have read November as March
- [x] A day and month with no year means the most recent occurrence on or before today. "sept 4"
      is last September in August, and this September in October. Walking back a year at a time
      makes "29 february" land on the most recent leap year without any special case
- [x] A year that was actually written is taken at its word. "4 September 2026" typed in August
      is reported as being in the future rather than quietly moved to 2025

## An unreadable date is visible, not silent

- [x] The reported bug: "sept 4" was not recognised, so the parser used today. Nothing looked
      wrong on the confirm step, which is exactly why it would be missed
- [x] `findDate` now has three outcomes rather than two — found, unreadable, none. The old
      boolean meant both "no date mentioned" and "a date I could not read", and collapsing
      those two *is* the bug
- [x] An unreadable date returns `expenseDate: null` and a `dateNote` quoting the text that
      failed: "“31 february” is not a real date", "“4 september 2027” is in the future",
      "“september” names a month but not a day"
- [x] The confirm step leaves the date box empty, rings it red, marks it `aria-invalid`, puts
      the cursor in it, shows the note as an error rather than a hint, and refuses to save —
      the same treatment a missing amount has always had, for the same reason
- [x] A sentence with no date in it still gets today, quietly. That case is ordinary and
      demanding a date every time would be unusable
- [x] A date that could not be read *lowers* confidence rather than leaving it unchanged:
      something was said and not understood, which is worse than nothing being said
- [x] "may" is excluded from bare month detection — it is a common English verb — but still
      works with a day beside it
- [x] "45,99,26" is still read as a number, not as a broken date. Only a date-shaped triple
      that fails on the calendar is worth reporting
- [x] The model prompt and its response schema updated to match, so a real provider has the
      same three outcomes available. Unverified against a live provider, like the rest of those
      adapters
- [x] Verified: 183 backend tests (45 new, covering 30 written forms, the year rule, the leap
      year, every unreadable case and the confidence change), 263 render checks including the
      confirm step's flagged empty date, and the reported sentence end to end through the real
      API

## The merchant is what survives

- [x] "32 euro netflix sept 5" found no merchant. The step only knew four shapes a name could
      take, and a name between the amount and the date with nothing marking it fits none of them
- [x] Same shape as the query box bug: a whitelist of phrasings is only as complete as whoever
      wrote it, and it fails silently. Inverted rather than extended — the amount, currency and
      date are removed, the words that say what was bought are known, and what survives is the
      name
- [x] The category table split into `items` (common nouns — what was bought) and `brands`
      (proper names — what was bought *and* where). One list could only refuse both, which is
      exactly why a lowercase "netflix" produced nothing
- [x] The preposition now splits rather than gates: before it is what was bought, after it is
      where. "coffee and tea at k market" needs no guessing; its absence is no longer fatal
- [x] With no preposition, the leading two leftover words are the name, stopping at any item
      word. A brand ends the name immediately — "89 eur ikea shelves" is Ikea
- [x] A single leftover word is a name if it is a brand or capitalised. The capital-letter rule
      no longer skips the first word: asking whether a word names a thing is a better question
      than asking where it sits, and it catches "20 euro Kotipizza" which the positional rule
      missed
- [x] Left ambiguous on purpose: a lone unknown lowercase word. "5 constructor" and
      "4 eur pastry" get no merchant, because guessing would produce one that looks as
      deliberate as a correct one
- [x] `description` still holds the whole sentence as typed. The split decides what is promoted
      to a name; nothing is thrown away
- [x] Checked for regressions: every sentence in the existing suite still parses the same way,
      including "coffee at euro shop 4,50", "spent 12 eur at 7 eleven", "paid 30 at monday
      market on 30.08.26" and the three that must return no merchant at all
- [x] Verified: 198 backend tests (15 new across both shapes), 263 render checks, and the
      reported sentence end to end through the real API

## Receipt scanning

- [x] Reversed a recorded decision. Receipt photos were out of scope in `CLAUDE.md`,
      `build-plan.md` and the README, rejected for needing uploads and image storage. Browser
      OCR leaves neither true, so the premises expired rather than the decision being overruled
- [x] `ReceiptExtractor` interface with one method, so a vision model can be a second
      implementation later without anything downstream changing
- [x] `TesseractReceiptExtractor`: WebAssembly OCR in the browser, dynamically imported so
      several megabytes stay out of the first paint. The image never leaves the device
- [x] A dedicated normalizer on the server — never the sentence parser. It borrows `readNumber`,
      `isRealDate`, `mostRecentOccurrence` and the English/Finnish month table rather than
      growing a second definition of any of them
- [x] `POST /api/receipts/read` takes lines of text, returns a receipt and a suggestion, saves
      nothing. No multipart, no upload, no storage — so it works unchanged on the serverless
      deployment that has no filesystem
- [x] Damaged keywords are undone rather than enumerated: fold `0`→`o`, `1`→`l`, `5`→`s`, drop
      accents, allow slack scaled to word length. Covers TOTAL, T0TAL, TOTAI, Totai, YHTEENSÄ,
      YHTEENSA, SUMMA and spellings nobody has seen yet
- [x] European amounts and dates, space-grouped thousands included, and every field returns null
      rather than a guess

## The total is checked, not trusted

- [x] Three cross-checks, none of which depends on how confident the OCR felt: the lines add up,
      the VAT is a known Finnish rate of the total, the card line repeats it
- [x] Four verdicts — corroborated, unverified, contradicted, absent — each with its own
      treatment on screen
- [x] A contradicted total arrives as an **empty amount box**, not a red-tinted filled-in one. A
      filled-in field gets approved at a glance whatever colour it is
- [x] Both readings offered as one-click choices, neither preselected. Dividing by a hundred and
      re-running the checks usually identifies the right answer outright
- [x] "Unverified" is visually distinct from "checked" — amber, the project's only third colour,
      because "we read a number" is not "we checked a number"
- [x] The photo sits beside the fields with the total, date and shop boxed on it, using the word
      positions OCR returned. Boxes are positioned elements rather than a canvas, so the checks
      can see them
- [x] Every failure has its own message and a way forward: wrong file type, too large, engine
      would not start, no text found, no total detected, anything else
- [x] Found while verifying: an address line was being counted as an item, contradicting a
      correct total. Fixed with a rule rather than an exclusion list — an item's amount must
      carry cents
- [x] Found by writing a test: "TOTAL" on one line and "24,90 €" on the next came back as no
      total at all. A narrow receipt or an angled photo wraps the value, and the reader only
      looked at the keyword line. It now reads the line below when that line is an amount and
      nothing else — never when it is a purchase, or a bare "YHTEENSA" above "Maito 1,29" would
      hand back the price of the milk
- [x] Found while verifying: two of the new render checks proved nothing. One matched
      `placeholder="0.00"` and so passed on the input merely existing. Both now read the amount
      box's own tag, the way the date checks already did
- [x] Assets self-hosted: 14 MB measured, not estimated — core 3.9 MB twice (SIMD and fallback),
      English 2.0 MB, Finnish 3.8 MB, worker 0.1 MB
- [x] Verified: 287 backend tests (89 new across the normalizer and the checks), 290 render
      checks, every verdict exercised end to end through the real API, the Tesseract data shape
      confirmed by running the engine against a real image, and all five self-hosted assets
      served at the paths the extractor asks for
- [ ] **Not verified: the browser path itself.** jsdom has no Worker, no canvas and no File, and
      the check harness rewrites every URL to the backend, so the engine load, the camera capture
      and the overlay are eye-only. Needs a real phone and a real receipt

## Reported from a real browser, and fixed

- [x] OCR never started. Tesseract asked for `tesseract-core-relaxedsimd-lstm.wasm.js`, which was
      not among the five core variants vendored — it picks between relaxed SIMD, SIMD and plain at
      runtime on what the browser supports, and the Node run used to "verify" this supported
      something different
- [x] The verification was circular and said so confidently. It requested the five files that had
      been copied in and got five 200s, which tested that the files copied were the files copied.
      The set under test came from the same place as the answer
- [x] All six variants now vendored, ~31 MB. The required list is read out of tesseract.js's own
      worker source by a check, so it cannot drift from what the library actually asks for
- [x] That check was confirmed to fail by deleting the file the browser had wanted — the step the
      original verification never had
- [x] Errors mentioning `importScripts`, a failed wasm fetch or missing traineddata are now
      classified as the engine failing rather than the photo, wherever they are thrown
- [x] The engine load has a timeout. The failure arrived uncaught inside the worker, so the
      promise never settled and the screen waited for ever — worse than a failure, because there
      is nothing to report
- [x] The three outcomes now say different things: the reader would not load (the photo is
      irrelevant), the reader found no text (the photo is the problem), the server could not be
      asked (neither is). A fourth — text read but no total — is still not an error and goes to
      the confirm step
- [x] Checks derive the failure kinds from the type and assert every message differs. Confirmed
      to fail by making two of them share a sentence
- [x] Verified: 298 backend tests, 318 render checks, and all nine assets served over HTTP at
      paths listed by tesseract.js rather than by me
- [ ] **Still unverified in a browser.** The same gap as before, and the reason this shipped
      broken. Needs a real phone

## Reported from a phone, and fixed

- [x] Asked directly and answered honestly: there was **no preprocessing at all**. The file went
      straight into the recogniser. Never a decision — the shortest path that worked on the one
      image it was tried on
- [x] Orientation: a phone writes pixels in the sensor's orientation and tags which way up they
      belong; a canvas need not honour the tag, so an upright-looking photo can reach the reader
      rotated a quarter turn, and sideways text reads as nothing. `createImageBitmap` with
      `imageOrientation: "from-image"` applies it
- [x] Size: the long edge is scaled to 2000px, never up. A phone gives ~4000px, which is slow,
      memory-hungry on a phone, and carries no extra letters
- [x] Contrast: converted to grey and the range stretched, ignoring the extreme 2% at each end so
      a glare spot cannot define white on its own. Deliberately not binarised — Tesseract does
      that itself and does it better from grey
- [x] The prepared canvas is what gets read *and* what the confirm step shows. The word boxes are
      in its coordinates, so showing the original would let them drift by ninety degrees after an
      orientation fix
- [x] A blank total now says which kind of blank: "No total found" against "Total read as
      2490.00, and that looks wrong". Repeated beside the box as well as in the banner, because
      the box is where the eye is when it is empty
- [x] Shop names have OCR debris trimmed off the ends — borders, logo fragments — while marks
      inside a name are kept. "KMARKET" would look correct and be wrong; a stray character is
      visible and takes one keystroke
- [x] Verified: 307 backend tests, 337 render checks
- [ ] **Still unverified in a browser**, including all of the above. The preprocessing is
      browser-only code — canvas, `createImageBitmap`, EXIF — and none of it can run in the
      check harness. Needs the phone again

## Seeing what the reader saw

- [x] Asked for before changing the parser, and right to ask: nobody could tell whether a
      missing total was absent from the OCR text or present in it and unmatched. A photo problem
      and a parser problem, indistinguishable, getting opposite fixes
- [x] The raw text is now on screen, folded away, on both the confirm step and the failure
      screen — with the prepared size, the word count and Tesseract confidence above it
- [x] On screen rather than only in a console, because the failure that needed explaining was on
      a phone and a phone has no console to open. It logs as well, for a desktop
- [x] The failure screen shows the **prepared image**, which is the single most useful thing
      there: sideways means orientation is the bug, a grey smear means the photo is
- [x] A failure now keeps its object URL alive so that image can be shown, and the screen showing
      it releases it
- [x] Found while writing the checks: a heredoc ate the escape in one of them, so it compared
      against a real line break instead of the two characters in the source. Matched on the call
      rather than its argument
- [x] Verified: 307 backend tests, 354 render checks

## Reassessed, and written down honestly

- [x] Two real receipts: 51% and 45% recognition confidence, output mostly noise. A total line
      surviving as `YHTEENSI iG i tk a` is not something a parser can be improved into reading
- [x] The prediction was right: Tesseract cannot read a crumpled thermal receipt. Not a tuning
      problem — creases are a local distortion and browser preprocessing corrects global ones
- [x] README now says plainly, near the top of the receipt section and again under "What is not
      built", what the feature does and does not do, with the measured numbers and the reason
- [x] The vision extractor named as the path that would fix it, along with why it is not built:
      it needs an API key and the project runs without one. The interface it would implement is
      already there
- [x] Recorded that two rounds went into preprocessing before the question "can this engine do
      this job at all" was asked. Each round was a real improvement; none of them moved the
      outcome, which is what that failure mode looks like from inside
- [x] Merged to master, so the calendar, the two-column layout, the collapsible panels, the date
      and merchant parsing fixes and receipt scanning all go live together

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
