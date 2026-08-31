# Learnings

A plain-language explanation of every technical term and concept we use while building
the AI Expense Tracker. This file grows as we build. Nothing here is a to-do list —
that lives in `progress.md`. This is purely "what does that word mean and why do we care".

---

## Table of contents

1. [What we are actually building](#1-what-we-are-actually-building)
2. [The five big pieces](#2-the-five-big-pieces)
3. [Terms: the web basics](#3-terms-the-web-basics)
4. [Terms: the frontend](#4-terms-the-frontend)
5. [Terms: the backend](#5-terms-the-backend)
6. [Terms: the database](#6-terms-the-database)
7. [Terms: the AI part](#7-terms-the-ai-part)
8. [Terms: MCP](#8-terms-mcp)
9. [Terms: hosting and deployment](#9-terms-hosting-and-deployment)
10. [Terms: tools we type into](#10-terms-tools-we-type-into)
11. [Decisions we made and why](#11-decisions-we-made-and-why)
12. [Security notes](#12-security-notes)
13. [Running log](#13-running-log)

---

## 1. What we are actually building

An expense tracker where instead of filling in a form with boxes for amount, shop,
category and date, you just type a sentence:

> "Spent 24.50 at Lidl on groceries"

...and the app works out for itself that the amount was 24.50 euros, the shop was Lidl,
the category was Groceries, and the date was today. It saves that, then shows you charts
of where your money went.

On top of that, an AI assistant can be plugged into the app and asked questions like
"how much did I spend on restaurants this month?" and it can look the answer up for itself.

---

## 2. The five big pieces

Think of the whole project as a restaurant.

| Piece | Restaurant analogy | What it really is |
|---|---|---|
| **Frontend** | The dining room | The part you see and click. Runs in your web browser. |
| **Backend** | The kitchen | The part that does the real work. You never see it. Runs on a server. |
| **Database** | The pantry | Where all the information is stored permanently. |
| **Public API** | Phoning a supplier | Our app asking *someone else's* service for information (exchange rates). |
| **MCP server** | A hatch for a robot waiter | A special doorway that lets an AI assistant use our app. |
| **VPS** | The building itself | A rented computer on the internet that keeps everything running 24/7. |

The important idea: **the frontend never touches the database directly.** The dining room
never walks into the pantry. It always asks the kitchen. This is how essentially all web
apps are built, and it exists so that one badly-behaved customer can't rearrange your pantry.

---

## 3. Terms: the web basics

**Client and server**
The "client" is whatever is asking for something — usually your web browser. The "server"
is the computer that answers. Your laptop asking for a webpage is the client; the machine
sending it back is the server.

**Frontend / backend**
Frontend = the code that runs *in your browser*, on your own machine. Backend = the code
that runs *on the server*, somewhere else. The split matters because anything in the
frontend can be read and tampered with by the user, so secrets and important rules must
live in the backend.

**API (Application Programming Interface)**
A menu of things one piece of software will do for another piece of software. It is just
a list of requests you're allowed to make, and what you get back. Our backend will have an
API so our frontend can say "give me all expenses" without knowing anything about how they're stored.

**REST**
The most common *style* of API on the web. It means we organise our menu around "things"
(expenses, users) and use standard verbs on them. Not a technology, just a convention —
like how most restaurant menus put starters before mains.

**HTTP methods (GET, POST, DELETE)**
The verbs. `GET` = "give me this". `POST` = "here's something new, save it". `DELETE` =
"get rid of this". There's also `PUT`/`PATCH` for "change this".

**Endpoint**
One specific item on the API menu. `GET /api/expenses` is an endpoint. `POST /api/expenses`
is a different endpoint even though the address looks the same, because the verb differs.

**Request and response**
A request is the question the client sends. The response is what comes back. Every
interaction is one request and one response.

**JSON (JavaScript Object Notation)**
The format that computers use to pass structured information around. It looks like this:

```json
{
  "amount": 24.50,
  "merchant": "Lidl",
  "category": "Groceries"
}
```

It's just labelled values. Almost everything in this project is JSON moving from one place
to another. Note the pattern: `"label": value`, separated by commas, wrapped in curly braces.

**HTTPS and TLS**
The padlock in your browser's address bar. It means the conversation between browser and
server is scrambled so nobody in between can read it. TLS is the scrambling technology;
HTTPS is HTTP with TLS switched on. We'll get this for free from a tool called Caddy.

---

## 4. Terms: the frontend

**HTML, CSS, JavaScript**
The three languages of the web. HTML is the structure (this is a heading, this is a button).
CSS is the appearance (buttons are blue and rounded). JavaScript is the behaviour (when the
button is clicked, do this).

**React**
A library for building interfaces out of reusable pieces. Instead of writing one enormous
page, you build small blocks — a `Button`, an `ExpenseRow`, a `CategoryChart` — and snap
them together. Its real selling point is that when your data changes, React updates the
screen for you rather than you having to manually rewrite bits of the page.

**Component**
One of those reusable blocks. A component is a chunk of interface plus the logic it needs.
`ExpenseRow` would be a component: it knows how to display one expense.

**Vite**
A build tool. Browsers can't directly run all the modern code we write, so Vite translates
and bundles it into something browsers understand. It also gives us a live preview that
updates the instant we save a file. Pronounced "veet".

**Tailwind (Tailwind CSS)**
A way of styling things by adding short labels directly to your HTML instead of writing
separate style files. `class="text-lg font-bold text-red-500"` means large, bold, red text.
Unusual-looking at first, very fast once you're used to it.

**Recharts**
A ready-made chart library for React. Saves us from drawing bar charts and pie charts by hand.

**SPA (Single-Page Application)**
A website that loads once and then updates itself in place instead of fetching a whole new
page every time you click. React apps are SPAs by default. Ours is a single page in the
stronger sense too — there's only one screen, so we need no navigation at all.

**Routing**
The machinery that decides which screen to show for which address (`/expenses` shows the
list). We're skipping it entirely by having one screen, which removes a library and a
category of bugs.

**State**
The data an app is currently holding in memory — the list of expenses on screen, whether a
form is open, what the AI just suggested. When state changes, React redraws the affected
parts. Most frontend bugs are state bugs: two places disagreeing about what's true.

**Human in the loop**
A design where the AI proposes and a person approves before anything permanent happens.
Our confirm step is exactly this. It's the standard answer to "what if the AI gets it wrong".

**Optimistic update**
The opposite approach: assume the action worked, show it immediately, and quietly undo if
the server disagrees. Feels faster, but it's the wrong choice where correctness matters —
which is why we're not using it for expense entry.

**TypeScript**
JavaScript with a safety net. Plain JavaScript will happily let you add the word "banana"
to the number 5 and only fall over later. TypeScript makes you label what kind of thing
each value is, and warns you before you run the code. It catches a large share of bugs for
very little effort, which is why we're using it everywhere.

**JSX**
The HTML-looking syntax inside our React files. It is not HTML — it compiles to ordinary
function calls — which is why attributes have JavaScript names: `className` rather than
`class`, `onChange` rather than `onchange`.

**Props**
The values passed into a component, written like HTML attributes. `<SuggestionReview
suggestion={...} saving={false} />` hands that component everything it needs. A component
that reads only its props is easy to reason about, because nothing outside it can change what
it shows.

**Hook (useState, useEffect)**
A function beginning with `use` that gives a component a capability it would not otherwise
have. `useState` remembers a value between redraws — what has been typed, whether a save is
in progress. `useEffect` runs something after the component appears, which is how the recent
list loads itself.

**Controlled input**
A text box whose contents live in React state rather than in the browser's own memory: the
value comes from state, and typing updates that state. It is a little more code than letting
the browser handle it, and it is what makes "correct the parser, then save what is on screen"
straightforward — the values being saved are the same ones being displayed.

**Dev server proxy**
While developing, the page is served by Vite on port 5173 and the API lives on port 3000. Two
different ports count as two different sites to a browser, which would normally block the
requests. Rather than loosening that rule, Vite forwards anything starting `/api` to the
backend, so the browser only ever sees one address. Caddy does the same job in production, so
development and production behave alike.

**Key (and why it resets a component)**
React decides whether to reuse a component on screen or build a fresh one by looking at its
position and its `key`. Same key, same component — including all the state it is holding.
This matters whenever a component copies a prop into `useState`, because a `useState` initial
value is only read the first time that component appears. Give it a key that changes and React
treats it as a new component, which resets those fields. This is the documented way to reset a
component's state, and it is the fix for the bug described in session 6.

**Categorical palette**
A fixed list of colours used to tell things apart — one per category — as opposed to a scale
used to show how much of something there is. The *order* matters and is not cosmetic: it is
chosen so that colours sitting next to each other stay distinguishable to someone with colour
blindness. Ours is a validated set whose first six slots are assigned in order and never
cycled. Adding a seventh by inventing a colour would break the property the order exists to
guarantee, which is why extra categories fold into "Other" instead.

**Contrast, and why the legend writes everything out**
Three of our six chart colours are too light to clear the usual contrast threshold against a
white card. That is allowed for a *mark* — a filled slice is large and its shape carries it —
but only on the condition that the meaning is also available as text. So the legend always
shows the category name and its amount. Colour never carries information on its own here, and
every value on the page can be read without hovering over anything.

**Stat tile**
A single number shown as a number, with a label. Four of them sit above the charts. The
temptation is to draw everything, but one figure is best drawn as itself — a chart of one
value is a decoration wrapped around a number.

**Part-to-whole**
The question "how does this total split up", which is what a pie chart answers. It works at a
glance for about six segments; past that, adjacent slices blur and the answer is better given
as a table. Nine categories is past that, which is why ours folds.

**Container query (and why a breakpoint is not one)**
An ordinary responsive breakpoint like `sm:` asks how wide the *window* is. A container query
asks how wide *this element's container* is. They are not interchangeable, and confusing them
produces a bug that gets worse on bigger screens: our pie legend asked `sm:` to decide whether
to sit beside the pie, but on a wide screen the two charts move into a two-column grid, so the
card gets *narrower* exactly when the window gets wider. The card was 416px, the pie took 208
of them, and the names were crushed to nothing.

The rule: if the question is "does this fit here", only the container can answer it. Reach for
a breakpoint only when the question really is about the window.

**Truncation hides bugs**
`truncate` clips text that does not fit and adds an ellipsis. It looks tidy and it is
dangerous, because it turns "this layout is broken" into "this label is short" — nothing
errors, nothing warns, and the page looks deliberate. The pie legend showed "B" for "Bills"
for a whole session. Clipping is right for genuinely unbounded text, like a shop name typed by
a person; it is wrong for a fixed vocabulary of nine known words, where not fitting means the
layout is wrong and should be fixed rather than concealed.

---

## 5. Terms: the backend

**Node.js**
Lets us run JavaScript on a server instead of only in a browser. It means we can use one
language for the whole project, front and back, which is much less to learn.

**Fastify**
A framework for building the backend. It handles the tedious plumbing — receiving requests,
matching them to the right bit of our code, sending responses — so we only write the
interesting parts. Its main rival is Express; Fastify is faster and has better TypeScript support.

**Framework vs library**
A library is a toolbox you reach into when you want something (Recharts). A framework is a
structure you build inside, and it calls your code rather than the other way round (Fastify).

**Route**
The bit of backend code that handles one endpoint. "When a POST arrives at /api/expenses,
run this function."

**Validation**
Checking that incoming data is actually sensible before trusting it. Is the amount a number?
Is it positive? Is the date real? Skipping this is one of the most common sources of both
bugs and security holes.

**Zod**
A validation library. You describe the shape you expect — "amount must be a positive number,
merchant must be text" — and Zod checks incoming data against it and rejects anything that
doesn't fit. This is our safety barrier between the AI and the database, and it's arguably
the most important line of defence in the whole project.

**Environment variable**
A setting stored outside your code, usually in a hidden file called `.env`. Passwords and
API keys go here so they never end up published on GitHub. Rule to internalise now: if it's
a secret, it goes in `.env`, and `.env` never gets uploaded anywhere.

**API key**
A long secret password that identifies you to somebody else's service. If someone gets your
AI provider's API key, they can spend your money. Treat it like a bank card number.

**npm and package.json**
npm is the tool that downloads and installs the libraries a project depends on. `package.json`
lists them, along with the short command names in the `scripts` section — that is why
`npm run db:seed` works rather than having to remember the full command behind it.

**Monorepo**
One repository holding several separate applications — here the backend, the frontend and
the MCP server. Each has its own `package.json` and could run alone; keeping them together
means a visitor sees the whole system in one place.

**Connection pool**
A small set of database connections kept open and handed out to requests as they need one.
Opening a fresh connection for every request would take longer than the queries themselves.

**HTTP status code**
The three-digit number attached to every response. 200 means fine, 201 means something was
created, 400 means the request was wrong, 404 means not found, 500 means the server broke.
The distinction matters: 400 is the caller's problem, 500 is ours.

**Query string**
The part of a URL after the `?`, as in `/api/expenses?category=Groceries&limit=10`. Every
value in it arrives as text, even the numbers, which is why they have to be converted before
being checked.

**Pagination (limit and offset)**
Returning results in pages rather than all at once. `limit` is how many rows to send back,
`offset` is how many to skip. Without it, a list endpoint gets slower every time a row is
added.

**Graceful shutdown**
Closing database connections properly when the server is told to stop, instead of vanishing
mid-request. Without it, a restart can leave connections stranded on the database.

**Regular expression (regex)**
A pattern for finding shapes in text — "a run of digits, optionally followed by a comma and
two more digits". Compact and genuinely useful, and unreadable enough that every one in this
project has a comment above it saying what it is looking for. Our mock parser is built almost
entirely out of them.

**Inherited properties (and `Object.hasOwn`)**
Every plain JavaScript object silently inherits properties it was never given — `constructor`,
`toString` and a few others. So looking up `table[word]` can return something real even when
the word was never in your table, which is how "5 constructor" briefly parsed as a currency.
`Object.hasOwn(table, word)` asks whether the table itself has that key, and is the correct
way to look something up using text a stranger typed.

---

## 6. Terms: the database

**Database**
A program whose entire job is storing information reliably and finding it again quickly.
Unlike a spreadsheet, it can handle many users at once and enforces rules about what's allowed.

**PostgreSQL ("Postgres")**
The specific database we're using. Free, extremely well-regarded, the sensible default
choice for this kind of project.

**SQL**
The language you use to talk to databases like Postgres. `SELECT * FROM expenses WHERE
category = 'Food'` means "show me every expense in the Food category."

**Table, row, column**
A table is like one sheet in a spreadsheet — our `expenses` table. A column is a field that
every entry has (amount, merchant, date). A row is one actual entry (24.50, Lidl, 30 Aug).

**Schema**
The blueprint of your database: which tables exist, which columns they have, what type each
column holds. Designing this well early saves a lot of pain.

**Primary key**
A column holding a unique identifier for each row, usually called `id`. It's how you point
at one specific expense with certainty, even if two expenses look identical.

**Foreign key**
A column that points at a row in *another* table. Our `expenses` table has a `user_id`
that points at a row in `users`. This is how the database knows which expenses belong to whom.

**Enum**
A fixed list of allowed values. Our category is an enum: it can be Groceries or Transport
or one of seven others, and nothing else. Enforcing this in Zod means a typo like
"Grocerys" is rejected at the door rather than quietly creating a tenth category.

**Floating point**
How computers normally store decimal numbers — approximately. `0.1 + 0.2` genuinely does
not equal `0.3` in most languages. Fine for physics, unacceptable for money, which is why
we use a `numeric` column that stores exact decimals instead.

**Time zone bugs**
Servers usually run on UTC while people live somewhere else. If a container thinks it's
already tomorrow, "yesterday" resolves to the wrong day. The fix is never to rely on
whatever the machine defaults to — state the time zone explicitly everywhere.

**ORM (Object-Relational Mapper)**
A translator between your code and the database, so you can write normal-looking code
instead of raw SQL. It also prevents a nasty class of attack called SQL injection.

**Drizzle**
The specific ORM we're using. Chosen because it stays close to real SQL, so you learn
something transferable rather than a walled garden.

**Migration**
A recorded change to the database structure — "add a `currency` column to expenses". They're
kept as numbered files so the same changes can be replayed on any copy of the database,
including the one on the server. Without migrations, your local database and your live
database silently drift apart.

**CRUD**
Create, Read, Update, Delete — the four basic things you do to stored data. When someone
says "just a CRUD app" they mean an app that only does these four things without anything clever.

**UUID**
A long random identifier like `9fe7d5c1-7025-46ad-90ec-739653167e6e`, used here as the id of
every user and expense. The alternative is counting 1, 2, 3, which quietly tells anyone
looking how many rows exist and makes it trivial to guess another row's address.

**Index**
A lookup structure the database maintains so it can find matching rows without reading the
whole table. Ours covers user and date together, because nearly every query asks for one
person's expenses within a date range. Indexes cost a little on every write and save a great
deal on every read.

**Decimal (numeric) column**
A column type that stores numbers exactly rather than approximately. This is the fix for the
floating point problem: `numeric(12,2)` means up to 12 digits with exactly 2 after the point,
so money adds up correctly. Drizzle hands these values back as strings on purpose, because
turning them into ordinary numbers would throw away the exactness.

**Truncate**
A SQL command that empties a table completely. The seed script uses it to reset before
writing, which is precisely why it refuses to run without a flag being set deliberately.

**Deterministic seed data**
Our fake expenses come from a random number generator that always starts from the same
number, so it produces the same 97 expenses every single time. Genuinely random data would
mean the charts looked different in every screenshot and no bug involving particular data
could ever be reproduced.

**Aggregate query (GROUP BY)**
A query that collapses many rows into one number each. "Add up the euros for every category"
is one row per category rather than one per expense. Doing this in the database rather than
fetching everything and adding it up in JavaScript matters as soon as there is real data:
the database reads the rows it already has on disk, while the alternative sends every expense
across the network to be counted.

**LIKE and ILIKE, and their wildcards**
`LIKE` asks whether text matches a pattern; `ILIKE` is the same thing ignoring capitals, which
is what free-text search wants. Inside the pattern two characters are not literal: `%` means
"any run of characters" and `_` means "exactly one of any character". So a search for `H_M`
finds `H&M`, but it also finds `HAM` and `HIM`. When somebody searches for a name that
contains one of those two characters, the pattern has to say "I mean this one literally", which
is done by putting a backslash in front of it.

This is a different problem from SQL injection. The value is still sent to the database as a
parameter and can never become an instruction — that part was always safe. It is the *meaning
within the pattern* that needed fixing, so that a search for `50%` looks for a percent sign
rather than for everything.

**Bucketing**
Putting rows into fixed time slots and summing each slot — here, one slot per week. The slots
have to exist even when they are empty, which is why weeks with no spending are sent as zero
rather than left out. A chart given a gap draws a straight line across it, which reads as
steady spending during a week when there was none.

---

## 7. Terms: the AI part

**LLM (Large Language Model)**
The kind of AI behind ChatGPT and Claude. Trained on enormous amounts of text, it predicts
what text should come next. That sounds limited but turns out to be enough to summarise,
translate, extract facts, and follow instructions.

**Prompt**
The instructions you send the model. Most of the skill in AI features is writing good prompts.

**Token**
Roughly, a chunk of a word. Models read and write in tokens, and you're billed per token.
"Expense" might be one token; "PostgreSQL" might be three. A rough rule: 1 token ≈ 4 characters
of English.

**Structured output / function calling**
Instead of letting the model reply in loose prose, you force it to answer in a fixed JSON
shape you've specified. This is what turns "spent 24.50 at Lidl on groceries" into a tidy
object our code can actually use. Absolutely central to this project.

**Hallucination**
When a model confidently makes something up. This is precisely why we validate with Zod
and never let the model write to the database directly — we assume it might be wrong and
check its work.

**Mock (or stub, or fake)**
A stand-in version of something real, used so you can build and test without the real thing.
Our mock AI won't be intelligent at all — it'll look for a number and a shop name using simple
pattern rules. Good enough to prove the rest of the app works. Professional codebases are
full of mocks, mostly so that automated tests don't have to call the internet.

**Interface (in the code-design sense)**
An agreed list of what something must be able to do, without saying how it does it. We'll
define an interface like "anything claiming to be an expense parser must accept a sentence
and return structured expense data." Claude, OpenAI and our fake version each satisfy that
contract differently. Swapping between them then becomes a one-line change.

**Adapter pattern**
The name for exactly that arrangement: a small piece of code per provider, each translating
between our standard interface and that provider's particular way of doing things. It's why
switching AI providers won't ripple through the rest of the app.

**Graceful degradation**
Designing so that when a part fails, the app gets less capable rather than falling over
entirely. If the AI is unreachable, we fall back to the mock and the app keeps working.

**Vision model / multimodal**
An AI that can accept images as well as text. Needed for the receipt-photo feature. Not all
models can do this, and it costs more per use than plain text, because an image is worth a
lot of tokens.

**OCR (Optical Character Recognition)**
Reading text out of a picture. Traditional OCR just transcribes characters. A vision model
does better here because it can also understand *meaning* — it can tell that one number on
a receipt is the total and another is the VAT, which plain transcription cannot.

**File upload / multipart**
Sending a file rather than plain text to the backend requires a different kind of request,
called multipart. It's also a security-sensitive area: you must limit how large uploads can
be and check the file really is an image, or you hand strangers a way to fill your disk.

**Seeding**
Loading a database with starter data automatically, usually via a script you can re-run.
Ours inserts about ninety invented expenses so the charts have something to show the
moment anyone opens the app.

**The core safety pattern of this project**

```
what the user typed
        ↓
        AI  (turns words into structured data — might get it wrong)
        ↓
   Zod validation  (rejects anything malformed or nonsensical)
        ↓
      backend  (applies our own rules)
        ↓
    PostgreSQL  (only now do we store it)
```

The AI is a helpful assistant that suggests, never an authority that commands. If you
remember one architectural idea from this build, make it this one.

**Confidence score**
A number from 0 to 1 saying how much of a sentence the parser actually recognised, rather
than assumed. Ours is a simple tally: points for finding an amount, a currency symbol, a
category keyword, a shop name and a date phrase. It is deliberately capped below 1, because a
parser that can claim certainty invites people to stop reading the confirmation step.

**SDK (Software Development Kit)**
A library published by a service so you do not have to build its HTTP requests by hand. We
use Anthropic's and OpenAI's rather than writing the calls ourselves, mainly for their
structured-output helpers.

**Structured output**
Handing the model a JSON schema it is required to fill in, instead of asking politely for
JSON and hoping. Both SDKs generate that schema from the same Zod schema we validate with.
It removes the classic failure — prose, or JSON wrapped in a code fence — but not the
interesting ones: a model can still return a real-looking date in the future, so the reply is
validated again on arrival.

**Fallback**
A worse answer that still works, used when the better one is unavailable. Ours catches
everything on the far side of the network — provider down, rate limited, key expired, request
too slow, reply failed validation — and answers with the mock instead. The person notices a
less accurate guess, not an error.

**Timeout**
A limit on how long to wait before giving up. Without one, a provider having a bad day becomes
a page that hangs. Ours is 15 seconds, after which the mock answers.

**Redaction**
Removing secrets from text before it is stored or displayed. Provider errors sometimes quote
your key back at you, so the key is stripped from the message before it reaches a log — logs
end up in screenshots and bug reports far more often than anyone plans for.

**Decimal separator versus thousands separator**
English writes one thousand two hundred and thirty-four euros fifty-six as `1,234.56`. Most of
Europe writes the same amount `1.234,56`. Both characters do both jobs, so a parser has to work
out which is which. The rule is about *grouping*, not about decimal places — a thousands
separator always has exactly three digits after it, because separating thousands is the only
thing it does:

1. **Both `.` and `,` appear** — whichever comes last is the decimal separator. `1.234,56` and
   `1,234.56` are both 1234.56.
2. **One kind, appearing more than once** — it is grouping. `1.234.567` is 1234567.
3. **One kind, appearing once** — grouping only if exactly three digits follow it and one to
   three digits come before. So `1,200` and `100,000` are whole numbers, while `14,6`, `23,40`
   and `1234,5` are decimals.

`1,200` is genuinely ambiguous: it could be one euro twenty. Three-digit grouping is the
overwhelmingly common meaning, so that is what the rule chooses — and the confirm step is
there for what a rule cannot settle.

Our first attempt asked a much narrower question: "are there exactly two digits after the
comma?" That is a rule about money rather than about grouping, and it read `14,6` as 146.

**Recognising a name without relying on capitals**
People type "at k market" as readily as "at K-Market", so requiring a capital letter to spot a
shop name recognises one and misses the other. The reliable signal is the preposition: "at",
"from", "in" and "on" are followed by the thing being paid. So the words after one are
collected until something that plainly is not part of a name — a number, a date word, a
currency, punctuation, or another preposition. A leading "the" is skipped rather than treated
as the end, so "at the corner shop" still finds one.

Capitalisation is then used only for display, and only ever to add a capital, never to remove
one: "k market" becomes "K Market" while "IKEA" is left alone. Where there is no preposition to
anchor on, a capital letter is the only hint left and is used as a last resort — which is a
hint, not a requirement.

**The extraction ordering rule**
The mock parser pulls four things out of one sentence: a date, an amount, a merchant and a
category. The rule that keeps them from fighting is:

> Each step finds the one thing it understands, reports the exact words it used, and those
> words are removed before the next step runs. Steps run most-constrained first.

The order is date, then amount and any currency beside it, then merchant, then a currency
named on its own. The category is read from the whole sentence rather than the leftovers,
because a category is a property of the sentence rather than a span of it — "coffee at k
market" is a Restaurants expense whether or not "coffee" ends up in the shop name.

*Why most-constrained first.* A looser rule will happily swallow text belonging to a stricter
one, but never the reverse. `31,08,26` is a perfectly well-formed grouped number — 310826 — and
also a perfectly well-formed date. Both rules are individually correct; only their order
decides which wins. A date needs three numbers in a fixed shape with day and month in range,
so it is the more constrained pattern and goes first. Once it is taken away, the amount rule
cannot see those digits, and the question stops being a question.

*Why removal matters more than the order.* Ordering alone is not enough. Before this rule
existed, every step defended itself against the others: the merchant step refused any word
containing a digit, any word that was a currency, and any word that was a weekday. Each guard
was added to fix a real bug, and together they meant "at 7 eleven", "at euro shop" and "monday
market" all found no shop at all — because the guards fired on text that another step had
already claimed and was no longer using. Removing each match lets every step stop caring what
the other steps do. The merchant step now has no idea what a currency is.

*What is checked at the end instead.* Two things are still not names, and both are decided on
the finished result rather than word by word, which is what lets "euro shop" through while
still refusing "dollars": a single word that is exactly a currency, and anything with no
letters in it.

*The remaining ambiguity.* "coffee at lidl monday" reads Monday as part of the shop name,
because no date was matched and so nothing consumed it. That is the honest cost of removing
the weekday guard, it is far rarer than the bugs it fixed, and the confirm step is where it
gets corrected.

**Written dates, Finnish style**
Finland writes dates day first: 31.8.2026. The parser accepts that shape with a dot, comma,
slash or hyphen, and with a two- or four-digit year — `31.08.2026`, `31.8.26`, `31,08,26`,
`31/08/26`, `31-08-26` — plus ISO `2026-07-14`, whose four-digit leading group cannot be a
day and so is never ambiguous. The separator must be the same in both positions, so
"31.08,26" is not a date. Two-digit years are read as 2000-something, the only reading that
makes sense here.

Position does not matter. A date at the start of a sentence and a date at the end are handled
identically, because the date is removed wherever it sits and the remaining words are read
afterwards — which is the ordering rule doing its job rather than a special case.

A date that has not happened yet is refused rather than returned. The mock is allowed to guess
wrong; it is not allowed to produce a value that its own validation will reject, because that
turns a bad guess into a failed request.

---

## 8. Terms: MCP

**MCP (Model Context Protocol)**
An agreed standard for letting AI assistants use external tools and data. Before it existed,
every AI app connected to every service in its own bespoke way. MCP is a common plug shape,
like USB — build one MCP server and any MCP-compatible AI can use it.

**MCP server**
The program *we* write that offers up abilities. Ours will offer things like "add an
expense" and "get spending by category". Confusingly it's called a server even though it's
small and often runs on your own machine.

**MCP client**
The AI application that connects to our server and uses those abilities.

**Tool**
One ability the MCP server offers. `add_expense` is a tool. Each tool has a name, a
description, and a specification of what information it needs. The AI reads those
descriptions to decide which tool to use — so the descriptions are effectively prompts,
and writing them clearly matters.

**Why this is the interesting part of the demo**
It's the difference between an app you use and an app an AI can operate on your behalf.
You'll be able to type "how much did I spend on restaurants this month?" into an AI
assistant and watch it decide to call your tool, run your query, and answer from your real data.

**Historical exchange rate**
What a currency was worth on a particular day, rather than what it is worth now. An expense
from three weeks ago converted at today's rate is quietly wrong; converted at the rate from the
day it happened, it is right. Frankfurter serves European Central Bank rates back to 1999 for
free, so being correct here costs nothing. The bank publishes on business days only, so a
Saturday returns Friday's rate — and the reply says which day it actually used, which is the
day worth recording.

**Cache**
Keeping an answer so the same question does not have to be asked twice. Rates are cached by
day and currency: a historical rate never changes, and adding several expenses from the same
week would otherwise mean several identical requests. The cache lives in memory, so restarting
the server simply asks again.

**stdio (standard input and output)**
The two text streams every program is born with. An MCP client starts the server as a child
process and talks to it through these, which is why an MCP server over stdio must run on the
same machine as the assistant — and why ours has no Dockerfile and appears nowhere in
docker-compose. It runs locally and calls the deployed API over HTTPS instead.

One consequence worth remembering while editing it: **stdout belongs to the protocol.** A
stray `console.log` would be read as a malformed message and break the connection. Anything
worth saying goes to stderr.

---

## 9. Terms: hosting and deployment

**Server**
A computer that stays on and answers requests. Physically no different from a laptop, just
kept in a data centre and never switched off.

**VPS (Virtual Private Server)**
A slice of a big physical server, rented to you, that behaves like your own computer. You
get full control and pay a few euros a month. Providers: Hetzner, DigitalOcean, Linode.

**Ubuntu**
The operating system on that computer — the equivalent of Windows or macOS, but built for
servers and controlled by typing commands rather than clicking.

**SSH (Secure Shell)**
How you connect to and control a remote computer from your own machine, by typing commands
into a terminal window that are actually executed over there.

**Deployment**
The act of getting your code from your laptop onto the server and running. "Deploying" =
"putting it live".

**Docker**
Packages your application together with everything it needs to run — the right version of
Node, the right settings, the lot — into a sealed box called an image. That box then runs
identically on your laptop and on the server. It's the cure for "but it works on my machine".

**Container**
A running copy of a Docker image. Our project will have several containers — one for the
frontend, one for the backend, one for the database — all running side by side, isolated
from each other.

**Docker Compose**
A single file describing all your containers and how they connect, so you can start the
entire system with one command instead of launching each piece by hand.

**Caddy**
A web server that sits in front of everything, receives all incoming traffic, and directs
it to the right container. Its killer feature is that it obtains and renews HTTPS
certificates automatically, which historically was a genuinely annoying chore.

**Reverse proxy**
The technical name for what Caddy is doing: standing in front of your actual applications,
taking requests on their behalf and passing them along. Gives you one front door instead of many.

**Domain and DNS**
The domain is the human-friendly address (`myexpenses.dev`). DNS is the phone book that
translates it into the server's actual numeric address. Changes to DNS can take anywhere
from minutes to hours to spread across the internet, which is why we start this step early.

**Wildcard DNS services (sslip.io, nip.io)**
Free services that answer for any address containing an IP address in it. Ask for
`anything.95-216-44-12.sslip.io` and it replies with `95.216.44.12`. No registration, no
waiting, and because it's a genuine domain name, Let's Encrypt will issue a certificate for
it. Perfect for demos, too ugly for anything permanent.

**Base currency**
The single currency all your totals are reported in. We store each expense twice: the
original amount and currency as typed, plus the amount converted to euros. Storing the
original matters because exchange rates move — if you only kept the converted figure, your
past records would be a snapshot of a rate you can no longer explain.

**Port**
A numbered door on a computer. One machine runs many programs, and ports keep their traffic
separate. Websites use 80 (plain) and 443 (secure) by convention.

**What hosting actually costs (as of 2026)**
A basic VPS runs roughly €5–8 a month; a domain roughly €10–15 a year. Prices across the
whole VPS industry jumped during 2026 because memory chip costs rose sharply, so older
tutorials quote figures that no longer exist. You can delete a VPS the day after a demo and
billing stops — most providers charge by the hour with a monthly cap.

**Let's Encrypt**
A free service that issues the certificates needed for HTTPS. Caddy talks to it for us
automatically. Before it existed, certificates cost money and had to be renewed by hand.

**Named volume**
A storage area Docker manages and keeps separate from the container itself. Containers are
disposable — deleting one is normal — so anything that must survive that, like the database
files, lives in a named volume instead.

**Health check**
A trivial endpoint that answers "is this thing actually working". Ours runs a one-line query
against the database, because a server that replies while its database is unreachable is
still broken. Docker uses the same idea to decide when the database has finished starting.

**Image versus container**
The image is the sealed box you build; the container is a running copy of it. One image can
start any number of containers, and deleting a container throws away everything inside it
that was not in a volume. That is the point: containers are meant to be disposable.

**Dockerfile**
The recipe for building one image — which base to start from, what to copy in, what command
to run. Ours are short on purpose: two of them for three applications, because the MCP
server needs none.

**Multi-stage build**
A Dockerfile with more than one FROM line. The first stage installs the compiler and every
development tool and turns TypeScript into JavaScript; the last stage copies out only the
result. The compiler never ends up in the finished image, which keeps it small and gives an
attacker less to work with.

**Layer cache**
Docker remembers the result of each step and reuses it when nothing that step depends on has
changed. It is why both Dockerfiles copy `package.json` and the lock file on their own,
before the source code: editing a route then reuses the cached install instead of
downloading every dependency again.

**`npm ci` versus `npm install`**
`npm ci` installs exactly the versions written in `package-lock.json` and fails if the lock
file disagrees with `package.json`. `npm install` is free to resolve newer ones. A build
should give the same answer today and in six months, so images are built with `ci`.

**Build context and `.dockerignore`**
The build context is the folder handed to Docker when an image is built. `.dockerignore`
lists what to leave out of it. Ours excludes `node_modules`, because copying packages
installed on Windows into a Linux image is a well-known way to end up with one compiled for
the wrong operating system.

**Service name as a hostname**
Compose puts every container on one private network and makes each reachable by its service
name. Inside that network `backend` resolves to the backend container, so no IP address is
ever written down and nothing breaks when Docker hands out different ones tomorrow.

**`localhost` inside a container**
`localhost` always means "this machine", and inside a container that machine is the
container. This is the most common Docker confusion there is: the `DATABASE_URL` in `.env`
says `localhost`, which is right when the backend runs directly on your laptop and wrong
inside a container, where the database is at `db` instead. Compose sets the correct one.

**Publishing a port**
`ports: "80:80"` opens a door from the outside world into a container. Anything not
published is reachable only by the other containers. The backend deliberately publishes
nothing: everything reaches it through Caddy, so there is one front door rather than three.

**Binding to 127.0.0.1**
`"127.0.0.1:5432:5432"` publishes a port to this machine only. Written as plain
`"5432:5432"` it would be open to the entire internet the moment the file reached a server —
Docker writes its own firewall rules and will happily overrule the one you configured.

**SPA fallback (`try_files`)**
A single-page app is one HTML file that JavaScript then redraws. A browser reloaded on a
sub-path still asks the server for that path, and there is no such file. `try_files {path}
/index.html` serves a real file when the path names one and otherwise hands back the single
page, so the app boots instead of Caddy returning a 404.

**Running as a non-root user**
Containers run as the all-powerful root user unless told otherwise. `USER node` switches to
an ordinary account, so a flaw in a dependency has far less to work with. One line, and
nothing about the app has to change.

---

## 10. Terms: tools we type into

**Terminal / command line**
A text window where you type commands instead of clicking. Intimidating for about a week,
then indispensable.

**Git**
Tracks every change to your code and lets you rewind to any earlier point. A time machine
with a written record of why each change was made.

**Commit**
One saved snapshot in Git, with a short message describing what changed.

**Repository ("repo")**
A project tracked by Git — your code plus its entire history.

**GitHub**
A website that hosts Git repositories online. This is where your finished demo will live
and what you'll show people.

**README**
The front page of a repository, written in Markdown. For a demo project this is the single
most important file, because it's what a visitor reads first and often all they read.

**CLAUDE.md**
A file Claude Code reads automatically at the start of every session. It holds your project's
rules, conventions and commands so you don't have to re-explain them each time. Keep it
short — long files get skimmed. Rules and commands belong here; the full specification
belongs in a separate document that CLAUDE.md points at.

**Documentation drift**
When two documents describe the same thing and only one gets updated. The usual result is
that nobody trusts either. The fix is to keep exactly one source of truth per topic and link
to it rather than restating it. This is why we have one plan file and not both a "spec" and
a "plan".

**Scope creep**
Features quietly accumulating beyond what was agreed, usually one reasonable-sounding
addition at a time. The standard defence is to write down what is deliberately *not* being
built, which is why `CLAUDE.md` has an out-of-scope list.

**Markdown (.md)**
A simple way of formatting text with plain characters — `#` for a heading, `**bold**` for
bold. This file is Markdown.

**Claude Code**
An AI assistant that runs in your terminal, reads your project files, and writes and edits
code directly. It's what we'll be using to build this.

**MVP (Minimum Viable Product)**
The smallest version that genuinely works end to end. The discipline is finishing something
small and complete rather than starting something large and abandoning it half-built.

---

## 11. Decisions we made and why

Filled in as we go. Recording the *why* matters more than the *what* — it's what you'll
want when someone asks you about the project in six months.

| Decision | Choice | Why |
|---|---|---|
| Login | None — one built-in demo user | Auth is time-consuming and adds nothing to what this project is showing off. We still keep a `users` table with one row in it, so real logins can be added later without redesigning the database. |
| Visual style | Light, clean, generous spacing | Financial software reads as trustworthy when it's restrained. Also easier to get right quickly than a dark theme, where getting contrast wrong is more obvious. |
| AI provider | Swappable, with an offline fake mode | Lets us build and test without spending money or waiting on a network. Anyone can clone the repo and run it with no API key. Removes the risk of a live demo failing because a third party is having a bad day. |
| Starting data | ~90 invented expenses across 3 months | An empty app looks broken and gives the charts nothing to draw. Three months is the minimum that makes month-over-month comparison meaningful. |
| Web address | Free automatic address (sslip.io) for now | Costs nothing, still gets a real HTTPS padlock, and avoids waiting hours for DNS to spread. Swapping to a purchased domain later is a one-line change in the Caddy config. |
| Extra feature | AI monthly spending summary, not receipt photos | Reuses AI plumbing we're already building, needs no file uploads or image storage, and still works in fake mode. Roughly 20 minutes of work versus 90. |
| Home currency | Euro | Every expense is stored both as entered and as converted to EUR, so totals always add up in one currency regardless of what was typed. |
| AI confirmation | Show the interpretation, let the user correct it before saving | The AI will sometimes be wrong. A confirm step turns that weakness into a visible feature and stops bad data reaching the database. It also makes a better demo — the audience watches a sentence become structured data. |
| Charts | Pie for category share, line for the monthly trend | Recharts provides both cheaply. The trend line is what makes three months of seed data worthwhile. |
| Pages | One single scrolling page | Removes routing entirely — no extra library, no navigation state, fewer moving parts. Three sections stacked: add, summary, history. |
| Category storage | Text guarded by a Zod enum, not a foreign key | The enum already rejects invalid values before they reach the database. A foreign key would be a second lock on the same door. The `categories` table remains as the source of the dropdown list. |
| Parser interface | Two methods: `parseExpense` and `summarizeMonth` | The original plan specified one, which left the monthly summary feature with no mock implementation — breaking the "runs without an API key" rule. |
| Trend chart | Weekly buckets, ~90 seed expenses | Three monthly totals is three points, which is not a line. Thirty expenses a month is also a more realistic spending pattern than ten. |
| Comparisons | Month-to-date vs the same number of days last month | Comparing a partial month against a complete one makes spending appear to collapse on the first of every month. |
| Exchange rates | Frankfurter API, rate on the expense date | Free, no key, ECB data, history back to 1999. Using the historical rate is more correct than today's rate and costs nothing extra. The ECB publishes on business days only, so weekend dates fall back to the previous business day. |
| MCP transport | stdio, running locally, calling the deployed HTTPS API | A stdio server is launched by the AI client on the user's own machine, so it cannot be a container on a remote VPS. It doesn't need to be — it reaches the live backend over the public API. Removes a Dockerfile and a category of deployment risk. |
| Write protection | Rate limits, a row cap, and a nightly re-seed | A shared secret in the frontend is visible to anyone who reads the page source, so it protects nothing. Making the demo data self-healing is honest and actually works. |
| Money precision | `numeric(12,2)` | Decimal, never floating point. |
| Time zone | Europe/Helsinki, set explicitly everywhere | Containers default to UTC. Relying on that silently shifts "yesterday" by a day depending on the hour. |
| Demo user lookup | One `getDemoUserId()` in a single module, looked up fresh on every request rather than cached; `user_id` is never read from the request | Keeps the one hardcoded assumption in one place, so adding real logins later changes that function and nothing else. Taking it from the request would be an open door with no login standing behind it. The lookup is deliberately not cached: the nightly re-seed replaces the demo user with a new id, and a cached one would leave the running server pointing at somebody who no longer exists — every query returning nothing, so the app looks empty rather than broken. |
| Seed safety | The seed script refuses to run unless `ALLOW_SEED=true` is set | It empties the tables first. The nightly re-seed in production needs that to work on purpose, so the guard has to be a flag someone sets deliberately rather than a guess based on the environment name. |
| Deletion | Real deletes, no `deleted_at` flag | Soft deletion would put a "and not deleted" condition into every single query for a feature nothing in the plan uses. `source` already records where a row came from, which is the provenance the demo actually needs. |
| Confidence score | Shown as small muted text next to the interpretation; nothing behaves differently because of it | Gating on a threshold would invent interaction the plan never asked for. The confirm step already handles low confidence — the person reading it is the threshold. |
| AI SDKs | The official `@anthropic-ai/sdk` and `openai` packages, rather than calling the HTTP APIs with `fetch` | Both give a typed structured-output helper that turns our Zod schema into the JSON schema the model must obey — hand-rolling that for two providers is the part most likely to go quietly wrong. The alternative, plain `fetch`, would have added no dependencies but meant maintaining two request shapes and two error formats by hand. |
| Claude model | `claude-opus-5`, overridable with `ANTHROPIC_MODEL` | The current default model. Reading one sentence is a small job, so the request also sets effort to low, which keeps it quick and cheap without changing the model. Anyone who wants to trade quality for cost changes one environment variable rather than any code. |
| Provider failure | Any error, timeout or invalid reply falls back to the mock | A demo that degrades is better than a demo that breaks. The person still sees a suggestion, still corrects it, and still confirms it — the safety pattern is untouched, only the quality of the guess changes. |
| Reported provider | The response names the parser that actually answered, not the one configured | On a fallback these differ. Reporting the configured provider would mean the API claimed Claude wrote a suggestion the mock produced, which is a small lie told on exactly the occasions when the truth matters most. |
| Cross-origin requests | Vite's dev proxy forwards `/api` to the backend, rather than adding CORS headers | The browser only ever talks to one address, so the browser's same-origin rule is never relaxed and no dependency is needed. It also matches production, where Caddy forwards `/api` the same way — development and production behaving alike is worth more than the ten minutes it saved. |
| Frontend validation | The backend's responses are checked with Zod in the browser too | A response from another program is an input from somewhere we do not control, the same as a request body is on the server. Without it, a backend change shows up as a blank page instead of a message. It also lets the page assert the parse endpoint's `saved: false` promise on every single call. |
| Amounts in the browser | Kept as the strings the API sends, converted to numbers only for display | The decimal column exists so money stays exact; parsing every amount into a JavaScript number on arrival would undo that at the last step. |
| Analytics windows | Summary is month-to-date and takes no parameters; the pie defaults to the same month; the trend defaults to the last fourteen weeks | The cards and the pie describe the same period, so the two cannot disagree with each other on screen. The trend is explicitly about change over time, so it needs a longer window. Both the pie and the trend still accept an explicit `from` and `to`. |
| Empty weeks in the trend | Sent as zero points rather than left out | A missing week is not a gap in a line chart — it is a straight line drawn across it, which reads as steady spending during a week when there was none. Sending the zero is the only way the chart can tell the truth. |
| Analytics totals | Strings, like every other amount | The database adds `numeric` columns exactly. Converting to a JavaScript number in the response would throw that away at the last step, after using a decimal column specifically to avoid it. The browser converts when it draws. |
| Unknown query parameters | Rejected with a 400 rather than ignored | `?form=2026-08-01` is a typo, and silently ignoring it produces a chart that looks fine and answers a different question. This is the failure mode where someone stares at a filter wondering why it did nothing. |
| Chart colours | A validated categorical palette, first six slots in fixed order, never cycled | The order is the colourblind-safety mechanism rather than a matter of taste — it was checked with a validator against the actual white card the charts sit on, not chosen by eye. Three of the six fall below the contrast threshold on white, which is allowed for a filled slice only because the legend also writes out the name and the amount. |
| Pie segments | At most six; everything smaller folds into one "Other" slice | A pie is only readable at a glance to about six segments. Nine categories would be a table pretending to be a chart. If a real "Other" is already among the largest, the remainder merges into it rather than drawing two slices with the same name. |
| Empty weeks on the line | Drawn as zero points | The same reason the endpoint sends them: a missing week is not a gap, it is a straight line drawn across one, which reads as steady spending during a week when there was none. |
| The month-on-month figure | Shown with an arrow and a sentence, in ordinary ink — never green or red | Spending more than last month is not automatically bad; it might be a holiday, or rent landing in a different week. Colouring it red would be the interface drawing a conclusion the data does not support. It says what happened and leaves the judgement to the person reading. |
| Legend layout | A container query, not a viewport breakpoint, and nothing truncates | The card is narrower on a *wide* screen, because the two charts move into a two-column grid there — so a viewport breakpoint answers the wrong question, and answers it confidently. Names are a fixed vocabulary of nine short words: if one does not fit, the layout is wrong and gets more room, rather than being clipped into looking deliberate. |
| Rate on the day, cached | Converted using the rate from the day the money was spent, cached per day and currency, falling back to the fixed table | An expense from three weeks ago converted at today's rate is quietly wrong, and a service with free history makes being right free too. The conversion reports whether the figure came from the service or the fallback, so nothing has to pretend an approximation is a real rate. |
| The seed script stays offline | Seeded rows convert with the fixed table, never the live service | Seeded data has to be reproducible. A seed that fetched live rates would write different euro amounts into the database every day, undoing the point of seeding from a fixed random seed. |
| Text search lives in the backend | `GET /api/expenses?search=` rather than filtering inside the MCP server | Searching then means the same thing whoever asks — the browser, an assistant, or curl. Filtering in the MCP server would have been a second definition of what "matches" means, in a place nothing else can reach. |
| The frontend image is Caddy | One container holds the built files and the web server, and that same container is the front door: it serves the page and proxies `/api` to the backend | The alternative was a small static-file container with a second Caddy in front of it — two web servers, two configs, one extra hop, to separate two things that are only ever deployed together. The build plan already described one Caddyfile that serves the frontend and proxies the API, and this is that file, doing exactly that. |
| Migrations run at container start | The backend's start command is `migrate && index.js` | Migrations are written to be safe to re-run, so applying them to an up-to-date database does nothing. Making it automatic means a fresh server needs no manual setup step — which is the step most likely to be forgotten at the moment it matters, over SSH, with an audience. |
| `DATABASE_URL` is built in compose, not read from `.env` | Assembled from the `POSTGRES_*` values with the host `db` | The URL in `.env` says `localhost`, which is correct for running the backend directly and wrong inside a container, where `localhost` is the container itself. One file cannot hold both answers, so the container's answer is written where the container is described. |
| The Caddyfile is mounted, not copied into the image | `./Caddyfile:/etc/caddy/Caddyfile:ro` | Changing a route becomes a restart rather than a rebuild of the whole frontend. Read-only, so nothing in the container can rewrite its own routing. |
| Local runs use plain HTTP | `DOMAIN` defaults to `http://localhost`; on the server it is the bare sslip.io hostname | Given a bare hostname Caddy fetches a real certificate automatically; given one starting `http://` it knows not to try. Nobody can issue a certificate for `localhost`, so the local run would otherwise fail on something that could never have worked. One variable switches between the two. |
| The backend publishes no port | Only the web container is reachable from outside Docker | Everything arrives through Caddy at `/api`, so there is one front door instead of three, and the API cannot be reached in a way that skips it. It also means the MCP server's `BACKEND_URL` becomes `http://localhost` under compose rather than `http://localhost:3000`. |
| Postgres is published to `127.0.0.1` only | `"127.0.0.1:5432:5432"` | Keeps `npm run dev` outside Docker able to connect while never exposing the database publicly. Docker writes its own firewall rules, so a plain `"5432:5432"` on a server is open to the internet regardless of what the firewall was told. |
| No `container_name` in compose | Containers are named by compose: `expense-tracker-backend-1` | A fixed name means only one copy of the stack can ever run, which is exactly what broke the first attempt to test a cold start alongside the real one. `docker compose logs backend` and `docker compose exec backend` work by service name either way, so the fixed names bought nothing. |

---

## 12. Security notes

Practical rules, and the reasoning behind them. Most security failures in small projects
aren't clever attacks — they're a secret committed to Git, or an input nobody checked.

---

### What counts as a secret

**Never share, paste, commit or screenshot:**

- API keys and tokens of any kind
- Passwords
- Connection strings that contain a password (`postgres://user:PASSWORD@host/db`)
- Private keys — SSH keys, TLS keys, anything ending `.pem` or `.key`
- The contents of a `.env` file
- Session cookies

**Fine to share:**

- Private network addresses (`127.0.0.1`, `192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`)
- Your machine's hostname
- File paths on your own computer
- Invented or seeded demo data
- Error messages and stack traces — *after* checking they don't quote a connection string,
  which they sometimes do

**Judgement needed:**

- Your VPS's public IP, especially alongside a description of what's running on it
- Server logs, which often contain more than you expect
- Screenshots — check the whole window, not just the part you meant to show

The test: would I mind if this ended up in a log file somebody reads later?

---

### Private versus public addresses

An address tells you how exposed something is.

| Range | Meaning |
|---|---|
| `127.0.0.1` | This machine only. Nothing outside can reach it. |
| `192.168.x.x`, `10.x.x.x`, `172.16–31.x.x` | Your local network. Not reachable from the internet. |
| `169.254.x.x` | A placeholder the OS invents when normal setup failed. Harmless. |
| Anything else | Potentially the public internet. Treat with care. |

This is why the four addresses the backend printed at startup were safe to share, and why a
VPS address is a different conversation.

---

### The .env rule

Secrets live in `.env`. `.env` is listed in `.gitignore`. `.gitignore` exists before the
first commit. In that order, always.

A committed `.env.example` shows *which* settings exist, with the values blanked, so someone
cloning the project knows what to fill in. The real `.env` never leaves your machine.

**What actually protects `.env`:** not access control. Claude Code created ours with a plain
`cp .env.example .env`, and it can read the file back just as easily — so can anything else
running in your terminal. The protection is `.gitignore`, and it works because it is
mechanical rather than a matter of judgement: Git will not stage the file, so it cannot reach
a commit by accident, however many times you type `git add .`.

The practical consequence is that everything in `.env` should be treated as visible to the
tools you run and to anyone who can see your screen. Keeping it out of Git is the easy half.
The other half is keeping it out of terminal output, screenshots and error messages, which is
why `CLAUDE.md` says never to print a key in a log — a file being ignored by Git does nothing
to stop its contents appearing in a console.

---

### Git remembers everything

Committing a secret and then deleting it in a later commit does **not** remove it. The
original commit still contains it and can be read by anyone with the repository. Force-pushing
a rewritten history doesn't reliably help either, because forks and caches persist.

**If you commit a secret, the only real fix is to revoke it and issue a new one.** Same
applies to pasting one anywhere public — deleting the message doesn't unshare it.

Cleaning the history is optional tidying. Revoking is the actual fix, and it should happen
first.

---

### The frontend cannot keep a secret

Anything the browser knows, a visitor can read. View-source, developer tools, network tab —
it's all there. An API key embedded in frontend code is visible to everyone who looks.

This is why we rejected a shared-secret header on write endpoints: the frontend would have
had to hold it, which means it wouldn't have been secret. Rate limits, a row cap and a
nightly re-seed protect the demo honestly instead.

Corollary: any check that matters must happen on the server. Frontend validation is a
convenience for the user, never a security measure — anyone can bypass it by calling your
API directly.

---

### Validate at every boundary

A boundary is anywhere data arrives from somewhere you don't control: HTTP request bodies,
URL parameters, AI responses, external API responses, MCP tool arguments, uploaded files.

Every one gets validated with Zod. The `minAmount=banana` test proved this working — the
value was rejected at the edge and never reached the database.

**Never trust an AI's output structurally.** A model can return malformed JSON, invent a
category that doesn't exist, or produce a negative amount. Validation is what makes the
"AI never writes to the database" rule enforceable rather than aspirational.

---

### SQL injection, and why the ORM helps

If user input is glued directly into a database query, a visitor can type input that changes
what the query *does* rather than what it looks for. That's SQL injection, and it's been in
the top few web vulnerabilities for two decades.

Drizzle sends values separately from the query structure, so input can never be read as
instructions. This protection is why "just build the query as a string" is always the wrong
answer, however convenient it looks.

---

### Firewall: private networks only

When Windows asked which networks Docker may accept connections from, the answer was Private,
not Public.

A development database has no meaningful protection. On an untrusted network — a café, an
airport — allowing public access means offering that database to everyone in the room. If
containers are ever unreachable on a public network, the fix is a VPN, not opening the
firewall.

---

### Anything on a public address will be found

Automated scanners sweep the entire internet continuously. A new server receives login
attempts within minutes of coming online. This isn't personal; it's background noise.

Consequences for hour 5:

- Only expose ports you actually need. The database should never be reachable from outside.
- Never reuse a development password in production.
- Prefer SSH keys over passwords, and keep the private key on your machine only.
- Assume every public endpoint will be called by strangers, including `DELETE`.

---

### Dependencies are code you didn't write

`npm install` pulls in hundreds of packages written by strangers, each running with your
full permissions. Most are fine. Some have been compromised.

Modest, practical habits: prefer well-known packages, look at when one was last updated,
be suspicious of names that are near-misses of popular packages, and don't add a dependency
for something a few lines of your own code would do.

This is why `CLAUDE.md` requires a justification before any dependency is added.

---

### Before making the repository public

- [ ] `.env` is in `.gitignore` and was there before the first commit
- [ ] `git log -p | findstr /i "api_key password secret token"` finds nothing real
- [ ] No real API keys in `.env.example`
- [ ] No production passwords anywhere in the repository
- [ ] Screenshots in the README show no keys, tokens or personal data
- [ ] Any key that was ever committed has been revoked, not just deleted

---

### Terms

**Secret** — any value that grants access. Keys, passwords, tokens, private keys.

**Revoke** — invalidate a credential so it stops working, then issue a replacement. The
correct response to any exposure.

**Boundary** — where data crosses from somewhere you don't control into somewhere you do.
The place validation belongs.

**Injection** — an attack where input is interpreted as instructions rather than data.
SQL injection is the classic; prompt injection is the same idea aimed at an LLM.

**Prompt injection** — text that manipulates an AI into ignoring its instructions. Relevant
here because our parser reads arbitrary user sentences. The defence is the same as
everywhere else: the AI only ever proposes, and validation plus human confirmation stands
between it and the database.

**Least privilege** — give every component the minimum access it needs. The MCP server calls
the HTTP API rather than the database, so it can only do what the API permits.

**Defence in depth** — assume any single protection may fail, and layer them. Our expense
path has four: schema validation, backend rules, human confirmation, and database
constraints.

---

## 13. Running log

A short note after each work session: what got built, what broke, what it taught us.

### Session 1 — planning

- Settled every open question: no login, light visual style, swappable AI with a fake mode,
  ~30 seed expenses over 3 months, free sslip.io address, EUR base currency, AI monthly
  summary instead of receipt photos, confirm-before-save, pie plus trend chart, one page.
- Wrote the build plan.
- Nothing built yet. Next session starts with the database and backend.

### Session 2 — hour 1, the foundation

Built the boring, load-bearing half of the backend, on the principle that the clever AI part
is much easier to debug once the plain path underneath it is known to work.

**What got built**

- PostgreSQL 17 in Docker, with a named volume so the data survives the container.
- The three tables, in Drizzle: `users`, `categories`, `expenses`. One migration, applied.
- A seed script producing one demo user and 97 expenses across the last 90 days, weighted so
  groceries and bills are the two biggest categories. Four of them are in other currencies,
  so the euro conversion and the "show the original currency" display both have something
  real to work with.
- `GET /api/health`, and full CRUD for expenses, every input validated with Zod.
- The static exchange rate table, built early because hour 4 needs it as its fallback anyway.

**What it taught us**

- Two bugs worth remembering, both found by testing rather than by reading the code:
  JavaScript quietly turns `2026-02-31` into the 3rd of March instead of rejecting it, so a
  day that never existed was reaching the database and coming back as a 500. Checking that a
  parsed date still has the same year, month and day is what actually catches it.
- Stacked validation rules produce stacked error messages. Three complaints about one bad
  date is worse than one, so the date checks now stop at the first failure.
- Seed data is read by people. Pairing each merchant with its own descriptions took two
  minutes and removed lines like "IKEA — running shoes".
- Caching the demo user id looked like an obvious saving and was the worst bug of the three:
  re-seeding while the server ran left it filtering on a deleted user, so the API cheerfully
  returned zero expenses with no error anywhere. Found only by re-running the seed and then
  checking the API rather than the database.

**Resolved since**

- Resolved: the "Starting data" row and `build-plan.md` both said ~30 seed expenses while the
  newer "Trend chart" decision said ~90. All of them now say ~90, matching the 97 that exist.
  Session 1's log below is left as written, because it records what was decided at the time.

**Next**

Hour 2: the `ExpenseParser` interface, the offline mock, the Claude and OpenAI adapters, and
`POST /api/ai/parse-expense` — which returns a suggestion and saves nothing.

### Session 3 — hour 2, the mock parser

Built the offline half of the AI layer and stopped there, so the parser could be tested before
any real provider existed to complicate the picture.

**What got built**

- The `ExpenseParser` interface, with both methods the decisions table calls for:
  `parseExpense` and `summarizeMonth`.
- The mock parser. No network, no key, no cost. It finds an amount and currency (including
  European commas, so "23,40" is twenty-three forty), matches a category by keyword, guesses a
  shop from capitalised words, and reads dates like "yesterday", "3 days ago", "last friday"
  and "2026-07-14".
- Provider selection from `AI_PROVIDER`, defaulting to mock. Asking for an adapter that does
  not exist yet warns and falls back rather than refusing to start.
- `POST /api/ai/parse-expense`, which returns a suggestion and saves nothing.

**What it taught us**

- The parser is deliberately imperfect and it shows: "spent 30 quid at Tesco" gets the amount,
  the currency and the shop right and the category wrong. That is the argument for the confirm
  step, made better by a live example than by any explanation.
- Looking a word up in a plain object is not safe when the word came from a stranger.
  "5 constructor" returned a JavaScript function where a currency code should have been,
  because every object inherits a `constructor` property. `Object.hasOwn` is the fix.
- The parser was picking "USD" out of "89.99 USD on Amazon" as the shop name. Merchant
  guessing now refuses anything that is a currency word.

**Verified**

- Five parse requests in a row left the expense count at 97. The endpoint genuinely saves
  nothing.
- A full round trip: parse a sentence, correct the category the mock got wrong, confirm, and
  the row lands with the GBP amount converted to euros.
- `AI_PROVIDER=nonsense` is refused at startup; `AI_PROVIDER=claude` warns and uses the mock.

**Next**

The Claude and OpenAI adapters, both using structured output, both falling back to the mock
when they error or time out.

### Session 4 — hour 2 finished, the real providers

Added the Claude and OpenAI adapters behind the interface built last session. The mock stays
the default and nothing about the confirm step changed.

**What got built**

- `claude.ts` and `openai.ts`, both using their SDK's structured-output helper so the model is
  given a JSON schema generated from the same Zod schema we validate against.
- One shared prompt and one shared validation function, so the two adapters differ only in
  which SDK they call.
- `withMockFallback`, which turns any provider failure into a mock answer.
- Keys, model names and the timeout all read from the environment. No key is ever hardcoded,
  and a blank key in `.env` counts as absent rather than being passed to an SDK.

**What it taught us**

- A provider quotes your API key back in its error message. OpenAI's 401 says
  `Incorrect API key provided: sk-inval*******************only` — masked in the middle, but the
  ends survive, and we were writing that straight into the log. Now stripped before logging.
  This was found by deliberately using an invalid key, which is worth doing on purpose.
- The response was reporting `provider: "claude"` while the mock had actually produced the
  answer. Technically it named the configured provider; in practice it was a lie told on every
  fallback. It now reports whichever parser really answered.
- A JSON schema can demand a string but not a sensible date. Structured output stops a model
  returning the wrong shape, not the wrong values, so our own validation still does the real
  work.

**Verified**

- Both adapters reach their provider, get a 401 from a deliberately invalid key, and fall back
  to the mock. The endpoint still returned a usable suggestion.
- With no keys set at all, everything still runs on the mock.
- Nothing was saved by any of it: the expense count stayed at 97 throughout.
- No key material appears in the server log.

**Not tested**

- A successful call to either provider. That needs a real key, which is yours to add — so the
  happy path is verified by construction and by the type checker, not by a live request.

**Next**

Hour 3: the frontend. One page, the add box, the interpretation shown as editable chips, and
the charts.

### Session 5 — hour 3 part one, the add box and the confirm step

Stopped deliberately before the charts, so the most important interaction could be looked at
on its own before anything else is built on top of it.

**What got built**

- A React and Vite project in TypeScript, with Tailwind 4 and one accent colour defined once
  as a theme token.
- The add box: type a sentence, press "Read this", and the parser's interpretation appears.
- The confirm step. Six editable chips — amount, currency, merchant, category, date, note —
  filled in with the parser's guesses, none of it saved until the button is pressed.
- A short "recently added" list, so that saving has a visible consequence. The full version,
  with the charts, comes next.

**Decisions worth remembering**

- A suggestion with no amount cannot be saved until a person types one. The parser returns
  null rather than inventing a number, and the page holds that line rather than defaulting to
  zero.
- The confidence figure is shown small and grey and changes nothing, exactly as decided. The
  person reading the screen is the threshold.

**Verified**

- Every component renders, checked by `npm run check` in the frontend — it renders the page
  and the confirm step in Node and asserts the chips, buttons and messages are present.
- The full sequence the page performs, run through the Vite proxy: load the list, parse a
  sentence, confirm the count did not change, save a corrected version, see the list grow from
  97 to 98, then remove the test row again.
- Parsing "spent 30 quid at Tesco the day before yesterday" suggested Other; the category was
  corrected to Groceries at the confirm step and 30 GBP was stored as 35.10 EUR.

**Not verified**

- How it actually looks. There were no browser tools available this session, so the layout,
  spacing and colours have not been seen by anyone yet. That is the first thing to check.

**Next**

The rest of hour 3: summary cards, the category pie, the three-month trend, and the full
recent list.

### Session 6 — a bug in the confirm step

Reported from the browser: after saving, the add box would not take another expense without a
page refresh, though the save itself worked.

**What was actually wrong**

`SuggestionReview` copies the parser's guesses into its own state so they can be edited:

```
const [amount, setAmount] = useState(suggestion.amount?.toString() ?? "");
```

The value passed to `useState` is only read the first time a component appears. React decides
whether a component is "the same one" by its position and its key, and since neither changed,
a second parse handed the component new props while React kept the instance that was already
on screen — so those initialisers never ran again and the chips kept the previous
interpretation. The add box updated correctly, the request was sent correctly, the reply came
back correctly, and the screen showed the old answer, which is exactly what "it ignored what I
typed" looks like.

The fix is one line: give the confirm step a `key` that changes on every parse, so React
builds a fresh component and reads the new values. See [[key-and-why-it-resets-a-component]].

**Worth remembering**

- The state reset after saving was never the problem, even though that is what the symptom
  pointed at. Reading the code found nothing because there was nothing there to find.
- Two attempts to reproduce it failed before one worked, and both failures were the test's
  fault rather than the app's: the first used a stubbed backend, which only ever proves the
  stub agrees with the frontend; the second checked the page before the real request had
  finished. A test that passes for the wrong reason is worse than no test.
- One assertion passed while the bug was present, because it searched the whole page for the
  merchant name and found it in the add box rather than in a chip. Assertions should look at
  the one thing they are about.

**Now checked automatically**

`npm run cycle` in the frontend drives the real thing against the real backend: type, parse,
correct, save, then a second expense with no refresh, then a third parsed without saving the
one before it. It cleans up the rows it creates.

### Session 7 — two bugs in the mock parser

Both found by typing one sentence in the browser: "coffee and tea at k market 14,6". It read
146 euros and found no shop.

**What was wrong, and the rules that replaced the guesses**

- The amount. The old code asked whether exactly two digits followed the comma, which is a
  rule about money rather than about how numbers are written, so `23,40` worked and `14,6`
  became 146. The replacement asks whether the separator is *grouping*, which is decided by
  three-digit runs. See [[decimal-separator-versus-thousands-separator]] for the three cases.
  `14,6`, `1,200`, `1.234,56` and `1,234.56` are now all read correctly.
- The merchant. The old code required a capital letter after "at", so "at K-Market" was found
  and "at k market" was not. The replacement anchors on the preposition and reads until a
  boundary, ignoring capitalisation entirely.
  See [[recognising-a-name-without-relying-on-capitals]].

**Two things found while writing the tests**

- Writing the rule out properly exposed a case neither bug report mentioned: "at the corner
  shop" returned nothing, because "the" ended the name before it began. Leading articles are
  now skipped rather than treated as a boundary.
- A written date is full of digits, so "netflix on 2026-07-14" was at risk of being read as
  2026 euros. Dates are now taken out of the sentence before the amount is looked for.

**Now checked automatically**

`npm test` in the backend, using Node's own test runner, so no test framework was added. 35
tests: the whole separator table case by case, the reported sentence end to end, and the
merchant rules including "same answer whatever the capitalisation".

### Session 8 — three parser bugs, and the ordering rule that fixes them

Reported from the browser, from two sentences: "s market chocolate 1600,789 on 31,08,26" and
"31,08,26 mustafa doner 20 euros".

**What was wrong**

- `31,08,26` was read as the number 310826. The separator rule and the date rule are each
  correct on their own; a comma-separated date is a well-formed grouped number. Nothing
  decided which rule got to claim those characters first.
- Neither sentence had a preposition, and the merchant step only looked after "at", "from",
  "in" or "on" — or, failing that, for a capital letter. Both sentences are lowercase.
- A future written date produced a 502. Nobody reported it; it was found while testing. The
  mock returned a date its own validation then rejected.

**One correction to the report.** In "31,08,26 mustafa doner 20 euros" the parser was not
recognising the date and using it as the amount at the same time. It never recognised the date
at all — `expenseDate` fell back to today, which happened to equal 31.08.26 on the day it was
tried, so it only looked as though it had.

**Why "s market" failed when "k market" worked** — nothing to do with single letters. "at k
market" has a preposition in front of it; "s market chocolate ..." does not. "at s market"
worked all along, and still does. The fix was a second way of finding a merchant, from the
words no other step claimed, rather than anything about the letter.

**What replaced it**

The [[the-extraction-ordering-rule]], written up above, with the individual rules moved into
`extract.ts` and the order itself left in `mock.ts` where it can be read as five numbered
steps. See also [[written-dates-finnish-style]].

**What it taught us**

- Reordering the steps was not enough on its own, and the tests caught that. Three of them
  still failed after the reorder, because the merchant step was still defending itself against
  digits, currencies and weekdays — guards that only existed because it used to read text the
  other steps had already claimed. The ordering rule is only worth having if the steps then
  stop second-guessing each other.
- Every one of those guards had been added to fix a real bug. That is how a parser accumulates
  rules that each made sense at the time and collectively make no sense at all.
- The fix removed code rather than adding it: the merchant step no longer knows what a
  currency is.

**Now checked automatically**

`npm test` in the backend, 67 tests. The separator table case by case, every accepted date
format, dates at the start, middle and end of a sentence, the three collision cases, both
reported sentences, and the future-date refusal.

### Session 9 — the analytics endpoints

Found while working out what came next: `build-plan.md` lists three analytics endpoints, but
hour 1's checklist only said "expenses CRUD", so they were never built and nothing noticed.
The charts could not have been drawn without them.

**What got built**

- `GET /api/analytics/summary` — month to date: total, count, daily average, and the same
  stretch of the previous month for comparison.
- `GET /api/analytics/categories` — one figure per category, for the pie.
- `GET /api/analytics/trend` — weekly totals, for the line.
- Date helpers for month and week boundaries in `lib/dates.ts`, where every date decision
  already lives.

**Decisions worth remembering**

- The previous-month comparison uses the same *number of days*, not the whole month.
  Comparing the first three days of August against all of July would show spending collapsing
  by ninety per cent every month — an artefact of the calendar rather than information. A
  shorter previous month is clamped, so 31 March compares against all of February.
- Weeks start on Monday, and `date_trunc('week', ...)` in PostgreSQL agrees, so the buckets
  built in JavaScript line up exactly with the ones the database groups by. Two different
  ideas of when a week starts would have been a quiet, hard-to-see error.
- `changePercent` is null rather than zero when there is nothing to compare against. "No
  change" and "nothing to compare" are different, and the page should be able to say which.

**Verified**

Rather than asserting fixed numbers — the seed moves with the date, so they change daily —
the figures were checked against each other:

- The summary total equals the raw expenses over the same window, to the cent.
- The category slices add up to the summary total, and their counts add up too.
- The trend points add up to the raw expenses over the trend window.
- Every bucket starts on a Monday, and the weeks run continuously with no gaps.
- The previous-month window is exactly as long as the elapsed part of this month.

Also checked: typos and unknown parameters are rejected, a future `to` is refused, and a
window with no expenses returns zeroes and an empty list rather than an error.

**Next**

The frontend half of hour 3: summary cards, the Recharts pie and trend line, and replacing
the stub recent list with the real one.

### Session 10 — the dashboard

The rest of hour 3: the summary cards, the two charts, and the real recent list in place of the
stub.

**What got built**

- Four stat tiles: spent this month, number of expenses, daily average, and the comparison
  with the same stretch of last month.
- A category pie, folding to at most six slices, with a legend that carries every name, amount
  and share as text.
- A weekly trend line across three months, one series, no legend — the heading names it — with
  the busiest week called out in the subheading rather than a number printed on every point.
- The recent list, now showing ten, with the original currency in small grey text when it was
  not euros, and "added by mcp" or "added by seed" on rows that did not come from the page.

**Decisions worth remembering**

- The chart palette was run through a validator against the white card it actually sits on,
  rather than picked by eye. See [[categorical-palette]] and
  [[contrast-and-why-the-legend-writes-everything-out]].
- The comparison figure is not coloured green or red. See the decisions table.
- The four dashboard requests go out together rather than one after another. They do not depend
  on each other, and waiting for each in turn would make saving an expense feel four times
  slower than it is.

**Caught while building**

- A delete button went into the recent list before it was noticed that nothing had asked for
  one. It was removed: adding an unrequested destructive action to a list is exactly the kind
  of thing that should not appear on its own.
- A stray invisible character ended up inside the trend chart file and would have failed the
  build with a confusing message. Worth knowing that "the code looks fine" and "the file
  contains only what you think it does" are different claims.

**Verified**

- 41 render checks, covering every card, the fold from nine categories to six, the legend
  writing values out, the empty-month message, and the list showing the original currency only
  when it was not euros.
- The full browser cycle still passes against the real backend.
- The page draws real figures: 1836.95 euros across 31 expenses, eight categories folded to
  six, fourteen weekly points.

**Not verified**

How it looks. There are still no browser tools available, so the layout, spacing and the
charts themselves have not been seen by anyone. That is the next thing to check.

### Session 11 — the pie legend showed one letter per category

Reported from the browser: every category name in the pie legend was cut to its first letter.
"Bills" rendered as "B". The legend is the whole reason the low-contrast palette was
acceptable, so the chart was conveying nothing readable.

**What was wrong**

The legend asked `sm:flex-row` — a *viewport* breakpoint — to decide whether it should sit
beside the pie. On a wide screen that fires. But on a wide screen the two charts also move into
a two-column grid, so the card is simultaneously *narrower*: 416px wide, 368px inside its
padding, 208px of that taken by the pie, leaving 136px for a row needing about 152px before the
name gets any width at all. The name was squeezed to zero and `truncate` clipped it to a
letter.

Two mistakes, and the second is what made it invisible:

- A viewport breakpoint was used to answer a question about a container. See
  [[container-query-and-why-a-breakpoint-is-not-one]].
- `truncate` turned a broken layout into something that looked deliberate. See
  [[truncation-hides-bugs]].

**Why 41 render checks passed while this was happening**

They were right, and they were looking at the wrong thing. `renderToStaticMarkup` produces an
HTML *string*: "Bills" was in it, exactly as asserted. CSS truncation happens during layout, in
a browser, at paint time — and nothing in the check script performs layout. There are no
widths, no boxes and no overflow in a string, so the question "is this visible" cannot be asked
there at all.

This is worth stating plainly rather than fixing: **the render checks verify content, never
appearance.** No number of extra assertions changes that. The script now says so at the top,
and carries two structural guards — the legend must not truncate, and the layout must use a
container query — which are a tripwire for this exact bug class, not proof that anything looks
right.

The general lesson: a green check suite is evidence about whatever the checks can see. Knowing
what they *cannot* see is part of reading the result.

**Still only checkable by eye**

Everything visual. The arithmetic says the legend now stacks below the pie whenever the card is
under 576px and sits beside it above that, which covers both the two-column grid and the
full-width case — but arithmetic is not a screenshot.

### Session 12 — hour 4, live rates and the MCP server

**Exchange rates**

Conversion now asks Frankfurter for the rate on the day the money was spent, caches it per day
and currency for 24 hours, and falls back to the fixed table when the service cannot be
reached. See [[historical-exchange-rate]].

Proved rather than assumed: 100 USD spent on 2026-07-14 stores as €87.68, where the fixed table
would have said €92.00; a Saturday (2026-07-11) correctly comes back with Friday's rate and
reports 2026-07-10 as the day it used; and with the service pointed at a dead address, both an
unreachable host and a 404 fall back to the table without failing the request.

The seed script deliberately does not use any of this — see the decisions table.

**The MCP server**

Six tools over stdio, in `mcp/`, calling the backend's HTTP API and never the database. No
Dockerfile, nothing in docker-compose: see [[stdio-standard-input-and-output]] for why that is
a property of the transport rather than a shortcut.

The tool descriptions are written as instructions to a reader who has to choose between them —
when to use `search_expenses` rather than `list_expenses`, that `add_expense` writes and should
not be used to answer a question, that ids come from a listing and must never be invented. The
destructive tool is annotated as destructive and the four reading tools as read-only, so a
client can treat them differently without reading the prose.

**Two bugs found by testing it properly**

- Every request set `Content-Type: application/json`, including DELETE, which has no body.
  Fastify rejects that outright, so deleting anything failed with a complaint about content
  types rather than doing the job.
- The check that was supposed to prove "deleting something that does not exist is refused"
  had been passing for the wrong reason — first because of the content-type bug, and then
  because the obvious all-ones UUID is not a valid UUID at all, so it was turned away by the
  format check and never reached the question being asked. It now uses a well-formed id that
  belongs to nothing, and gets the 404 it was always meant to test.

That is the second time this project has had a check pass for the wrong reason. Both times the
tell was the same: the assertion was satisfied by something other than the behaviour it named.

**Verified**

`npm run check` in `mcp/` drives the server the way a client does — launched as a child
process, spoken to over the real protocol, against the real backend. Twenty-two checks: all six
tools advertised and annotated, every read tool answering, a euro and a foreign expense saved
and found, invalid categories, negative amounts and future dates all refused by the backend
rather than by the tool, and both test rows deleted again afterwards.

**Next**

Connecting it to an actual AI client, which is yours to do. Then hour 5: Dockerfiles for the
frontend and backend, compose, Caddy, and the server.

---

### Session 13 — connected to an AI client, and a search that found nothing

**Connected end to end**

The MCP server is now talking to a real AI assistant rather than to a test harness. Asked "how
much did I spend this month", the assistant called `get_expense_summary` on its own and
answered from the real database: €1836.95 across 31 expenses, 7% less than the same stretch of
July. `get_spending_by_category`, `list_expenses` and `search_expenses` were all exercised the
same way. That was the last unticked item in hour 4.

**A bug in the new search filter**

The search added in hour 4 escapes the two LIKE wildcards so that a search for a percent sign
means a percent sign. The escaping was written like this:

```ts
query.search.replace(/[\%_]/g, (character) => `\${character}`)
```

Inside a template literal, a backslash before a dollar sign is an *escape*: it says "this is
an ordinary dollar character, not the start of a substitution". So `${character}` was never
substituted at all. Every `%` and every `_` in a search was replaced with the eleven literal
characters `${character}`, and the search then went looking for that — and found nothing, ever.

The fix is two backslashes, which produce one real backslash and then let the substitution
happen. It also now escapes the backslash itself, since a backslash is the character that does
the escaping:

```ts
query.search.replace(/[\\%_]/g, (character) => `\\${character}`)
```

**The trap that hid it**

Testing the fix appeared to prove it had not worked. Two things were wrong at once.

The first was the test. A search for `_` returned nothing both before and after the fix — with
the bug because it looked for the wrong string, and with the fix because no shop has an
underscore in its name. Same answer, opposite reasons. A test whose result cannot tell the two
cases apart proves nothing. The test that does work needs two rows, `ZZ_TEST` and `ZZxTEST`,
and asks for `ZZ_TEST`: escaped correctly it returns one row, unescaped it returns both, and
with the old bug it returns neither. Three distinguishable answers.

The second was that two backend servers were running: one started with `tsx watch`, one
without. The one without `watch` had the port, so it served the old code no matter how many
times the file was saved, and the watching one had quietly died of a port clash. **If a change
seems to have no effect, check what is actually listening on the port before doubting the
change.** `Get-NetTCPConnection -LocalPort 3000` names the process holding it.

That is the third time a check in this project has passed for the wrong reason, and this time
the wrong reason was two deep.

**Verified**

Against the reloaded server: `ZZ_TEST` returns only the literal row and not `ZZxTEST`, a search
for `%` returns nothing rather than everything, and ordinary words still work. Both test rows
were deleted afterwards and the table is back to its seeded 98.

**Next**

Hour 5: Dockerfiles for the frontend and backend, compose, Caddy, and the server.

### Session 14 — hour 5 part one, the whole thing in Docker

**What now exists**

Two Dockerfiles, a Caddyfile, and a compose file that starts three containers:

```
browser ──▶ web (Caddy)  ──/api/*──▶ backend (Fastify) ──▶ db (Postgres)
                         └─────────▶ the built React files in /srv
```

The MCP server is not among them, and that is deliberate rather than unfinished. It is
launched by an AI client on your own machine and talks over stdio, so there is nothing for
it to listen on and nowhere useful to put it. It reaches the system over the public API the
same way a browser does. The build plan's repository layout drew an `mcp/Dockerfile`; that
was written before the transport was decided, and it is now wrong on purpose.

**Both Dockerfiles are multi-stage**

The first stage installs everything, compilers included, and builds. The second copies out
only the result. The backend's finished image has no TypeScript in it and the frontend's has
no Node at all — once vite has run, the frontend is just files, and files need a web server
rather than a runtime.

**Three containers, one front door**

Only the web container publishes a port. The backend publishes none: everything reaches it
through Caddy at `/api`, so the API cannot be reached in a way that skips the front door.
Containers find each other by service name on a private network, which is why the Caddyfile
says `reverse_proxy backend:3000` and no IP address appears anywhere.

The database is published, but to `127.0.0.1` only. That keeps `npm run dev` outside Docker
able to connect while leaving it unreachable from anywhere else. Plain `"5432:5432"` would
have been open to the whole internet the moment this file reached a server — Docker writes
its own firewall rules and overrules the one you configured.

**The localhost trap**

`localhost` means "this machine", and inside a container that machine is the container. The
`DATABASE_URL` in `.env` points at `localhost`, which is right for running the backend
directly and wrong inside a container, where the database is at `db`. Compose therefore
builds the container's URL itself out of the `POSTGRES_*` values rather than reading it from
`.env`. One file cannot hold both answers.

The same trap moved the MCP server's `BACKEND_URL`: under compose the backend has no
published port, so it becomes `http://localhost` — port 80, through Caddy — instead of
`http://localhost:3000`. Noted in `.env.example` with all three answers side by side.

**Migrations run themselves**

The backend's start command is `migrate && index.js`. Migrations are safe to re-run, so on
an up-to-date database this does nothing, and on a brand new one it builds the schema. A
fresh server then needs no manual setup step — the step most likely to be forgotten over
SSH with an audience watching.

**One certificate decision, made by a default**

`DOMAIN` is blank locally, and compose turns that into `http://localhost`. Given a bare
hostname Caddy fetches a real HTTPS certificate by itself; given one starting `http://` it
knows not to try. Nobody can issue a certificate for `localhost`, so without that default
the local run would have failed on something that could never have worked in the first
place. On the server `DOMAIN` becomes the sslip.io hostname and HTTPS happens on its own.

**A fixed container name blocked the test that mattered**

The compose file inherited `container_name: expense-db` from hour 1. Testing a cold start
means running a second, throwaway copy of the whole stack, and a fixed name makes that
impossible — Docker refused with a name conflict. The names are gone: `docker compose logs
backend` and `docker compose exec backend` address containers by *service* name and never
needed them.

**Proved from empty, without touching the real data**

The interesting question is not whether it runs here, where the database already exists. It
is whether it runs on a machine that has nothing. So the stack was started a second time
under a different project name, with its own empty volume, on ports 8080 and 8443, reading
`.env.example` as though the repository had just been cloned:

- migrations applied to an empty database on their own
- the app answered with `total: 0` and a summary of `0.00` rather than an error
- `docker compose exec backend node dist/db/seed.js` wrote the demo user and 97 expenses
- analytics answered correctly afterwards

Then it was deleted, volume and all, and the real stack restarted with its 100 expenses
intact. **Testing a fresh install against your own working database proves nothing** — the
database is the part that was already there.

**Checked through Caddy, not around it**

`/api/health` reachable, the page served, a hashed asset served, an unknown path falling back
to `index.html` so a reload does not 404, and `/api/nope` returning the backend's own JSON
error rather than a Caddy page. `AI_PROVIDER` was left at `mock` throughout and no key was
set anywhere, which is the rule the whole project is built around.

**Next**

Rent the Hetzner box, install Docker, copy the repository across, set `DOMAIN` to the
sslip.io hostname, and start it. The build should be identical, which is the entire reason
for having done this first.
