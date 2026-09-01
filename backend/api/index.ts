import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../dist/app.js";

/**
 * The Vercel entry point.
 *
 * A serverless function is a program that is not running until a request
 * arrives. The platform starts it, hands it one request, takes the response,
 * and may shut it down again seconds later. That is the whole difference from
 * the Docker path, where index.ts opens a port and the process stays up.
 *
 * **Every /api path reaches this one function, and it is vercel.json that says
 * so, not this filename.** The first attempt called this file `[...path].ts`,
 * borrowing the catch-all convention from Next.js. Vercel's plain function
 * routing does not have that convention: it read the brackets as a single
 * dynamic segment whose name happened to be "...path". One-segment paths worked
 * by accident, `/api/analytics/summary` returned Vercel's own 404 without ever
 * reaching Fastify, and every request arrived carrying an extra `...path` query
 * parameter that the strict filter schemas correctly refused. An explicit
 * rewrite is both clearer and actually correct.
 *
 * Vercel's rewrite only chooses which function answers; the original URL is
 * passed through untouched. So Fastify's router sees exactly what it sees under
 * Caddy — /api/expenses, /api/analytics/summary — and not one route had to
 * change.
 *
 * It imports from ../dist rather than ../src deliberately. Vercel runs the same
 * `npm run build` the Dockerfile runs, so both ways of deploying execute
 * JavaScript produced by the same compiler from the same tsconfig. Letting
 * Vercel's own bundler compile the TypeScript instead would be a second, subtly
 * different build of the same code.
 */

// Module scope, not per request. Vercel reuses a warm instance for as many
// requests as it can, and everything up here — the Fastify instance, the route
// table, the database pool inside it — is built once and reused. Building it
// per request would put a cold start's worth of work on every single call.
const app = buildApp();
const ready = app.ready();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Fastify normally gets its requests from a port it opened itself. Here there
  // is no port, so the raw request and response are handed straight to the
  // server object underneath it. This is Fastify's documented way of running
  // somewhere that will not let you listen.
  await ready;
  app.server.emit("request", req, res);
}
