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
12. [Running log](#12-running-log)

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
Ours will insert about thirty invented expenses so the charts have something to show the
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
| Starting data | ~30 invented expenses across 3 months | An empty app looks broken and gives the charts nothing to draw. Three months is the minimum that makes month-over-month comparison meaningful. |
| Web address | Free automatic address (sslip.io) for now | Costs nothing, still gets a real HTTPS padlock, and avoids waiting hours for DNS to spread. Swapping to a purchased domain later is a one-line change in the Caddy config. |
| Extra feature | AI monthly spending summary, not receipt photos | Reuses AI plumbing we're already building, needs no file uploads or image storage, and still works in fake mode. Roughly 20 minutes of work versus 90. |
| Home currency | Euro | Every expense is stored both as entered and as converted to EUR, so totals always add up in one currency regardless of what was typed. |
| AI confirmation | Show the interpretation, let the user correct it before saving | The AI will sometimes be wrong. A confirm step turns that weakness into a visible feature and stops bad data reaching the database. It also makes a better demo — the audience watches a sentence become structured data. |
| Charts | Pie for category share, line for the monthly trend | Recharts provides both cheaply. The trend line is what makes three months of seed data worthwhile. |
| Pages | One single scrolling page | Removes routing entirely — no extra library, no navigation state, fewer moving parts. Three sections stacked: add, summary, history. |

---

## 12. Running log

A short note after each work session: what got built, what broke, what it taught us.

### Session 1 — planning

- Settled every open question: no login, light visual style, swappable AI with a fake mode,
  ~30 seed expenses over 3 months, free sslip.io address, EUR base currency, AI monthly
  summary instead of receipt photos, confirm-before-save, pie plus trend chart, one page.
- Wrote the build plan.
- Nothing built yet. Next session starts with the database and backend.

### Session 2 — _to be filled in_
