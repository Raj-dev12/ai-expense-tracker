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
