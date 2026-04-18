# CLAUDE.md — ProxyOS Repository Contract

**Purpose:** This file tells Claude Code sessions what is stable, what can be changed, and how to behave in this repo.

**Read this entire file at the start of EVERY session before making any change.**

---

## 🔒 Stable Files — Do NOT Modify Without Explicit User Request

The following files/regions are **locked**. They contain working code that the user has tested and verified in production. Do NOT modify them even if you think there's a better way, a cleanup opportunity, or a bug fix needed in passing.

If you genuinely believe one of these files needs to change, STOP and ask the user explicitly. Do not modify as a side effect of another task.

### Locked files

```
apps/web/next.config.mjs
packages/caddy/src/build-route.ts          ← handler builder — locked after Bug #1/#4 fix
packages/caddy/src/resolve-upstream.ts     ← static upstream resolver (Bug #2 fix)
packages/caddy/src/regenerate-routes.ts    ← routes array regeneration (Bug #6 fix)
packages/db/src/migrations/*.sql           ← all existing migrations — add new migrations, never edit past ones
packages/api/src/routers/users.ts                  ← login/logout __setCookie mechanism (see Auth Cookie Handling below)
packages/api/src/trpc.ts                           ← createContext with resHeaders fallback (see Auth Cookie Handling below)
apps/web/src/app/api/trpc/[trpc]/route.ts          ← tRPC response interceptor for Set-Cookie injection
docker-compose.yml                                 ← /var/run/docker.sock mount required for network discovery
```

*(Adjust these paths to match actual repo structure when you first populate this file.)*

### Locked DB migrations

Never edit an existing migration file, even if you spot an error. If the schema needs to change:

1. Create a new migration with incremented timestamp/number
2. Write corrective SQL in the new migration
3. Do NOT modify past migrations — other environments may have already applied them

### Locked auth/session logic

```
packages/auth/src/**/*
packages/api/src/trpc/context.ts
apps/web/src/middleware.ts
```

Auth bugs that users report must be fixed through new code, not by reinterpreting existing session/CSRF logic. Ask before touching.

---

### 🔐 Auth Cookie Handling (CRITICAL — DO NOT MODIFY)

The following three files implement a workaround for a Next.js 15 standalone build bug where tRPC v11's `resHeaders` argument is not reliably plumbed through to procedure context. At the source level the destructuring looks correct, but the compiled standalone output produces `Cannot read properties of undefined (reading 'append')` crashes on any procedure that calls `ctx.resHeaders.append()`.

**The workaround is a three-file pattern. Do not change any of these files without explicit user approval.**

1. **`packages/api/src/routers/users.ts`** — The `login` and `logout` procedures each return a `__setCookie: string` field in their response body, alongside normal response data. Inside each procedure there's ALSO a best-effort `ctx.resHeaders.append()` call guarded by `typeof ctx.resHeaders.append === 'function'` — this works in dev, no-ops in standalone. Do NOT remove the `__setCookie` field. Do NOT remove the defensive guard. Do NOT add `next/headers` imports to this file (it breaks the build — `packages/api` is not allowed to depend on `next`).

2. **`packages/api/src/trpc.ts`** — `createContext` accepts `opts: { req: Request; resHeaders?: Headers }` (NOT destructured parameters) and initializes `const resHeaders = opts.resHeaders ?? new Headers()` as a fallback. This prevents runtime crashes when Next.js standalone fails to pass `resHeaders`. Do NOT revert this to destructured `{ req, resHeaders }`. Do NOT remove the fallback Headers() construction. Do NOT remove the `[trpc] createContext called WITHOUT resHeaders` warning log.

3. **`apps/web/src/app/api/trpc/[trpc]/route.ts`** — Wraps `fetchRequestHandler` and intercepts the tRPC response. For each item in the response body, it drills into `result.data.json.__setCookie`, appends any found cookie strings as real `Set-Cookie` headers on a new Response, and removes the `__setCookie` field from the body before returning to the client. Do NOT simplify this handler. Do NOT "refactor" the response interception into middleware. Do NOT switch the handler to edge runtime — it MUST stay on `nodejs` runtime.

**If a future Next.js or tRPC version fixes the underlying bug**, the workaround can be removed — but only after a user confirms with curl testing that `ctx.resHeaders.append('Set-Cookie', ...)` directly in a login procedure sets a real `Set-Cookie` header in the production container. Until then, the three-file pattern stays.

Reference commit: `1c9bf69` — `fix(auth): work around Next.js standalone tRPC resHeaders bug`

---

## 📝 Change Discipline

Every change you make MUST follow this process:

1. **Read the spec handed to you** — if there's no spec, ask for one. Don't freelance.
2. **Read the files you plan to modify** before editing.
3. **Scope only what the spec asks for** — don't refactor, don't "clean up," don't fix adjacent bugs unless the spec says so.
4. **Run the verification gates** the spec provides. If there are no gates, write them with the user before coding.
5. **One commit per spec** with a descriptive message. No "fix stuff + other tweaks" commits.
6. **Report back in the format the spec requests.** If no format, report:
   - Files modified (with line counts)
   - Commit hash
   - What gates passed
   - What you deliberately did NOT change but noticed

---

## 🚫 Anti-Patterns — Do NOT Do These

### Don't expand scope

If the user asks you to fix Bug X and you spot Bug Y, note Bug Y in your report but do NOT fix it. Scope creep has broken past deployments.

### Don't refactor on the way through

Legacy code that works is not a bug. Rewriting working code for style or taste without being asked is forbidden.

### Don't change formatting unless asked

If the user's Prettier config produces weird indentation, respect it. Don't "fix" formatting as a side effect. Use `--no-format` patches if available.

### Don't add dependencies casually

New packages get added ONLY with user approval. `pnpm add <anything>` is a decision, not a reflex.

### Don't write tests unless asked

This project doesn't currently have comprehensive test coverage. Adding tests for new code is fine; adding tests for existing code as a side quest is not. The user will decide when to invest in test coverage.

### Don't upgrade versions

If a dependency is pinned to `1.23.4`, don't bump it to `1.23.5` or `^1.23.4` unless the user asks. Version bumps in dependencies have broken the build before.

### Don't remove `// TODO` or `// HACK` comments

They're there for a reason. If you think one should be addressed, mention it in your report. Don't silently delete context.

---

## ✅ Things You're ENCOURAGED to Do

- **Ask clarifying questions** before writing code. Better to ask one "is this what you meant?" than to rewrite 500 lines on a misread spec.
- **Read the relevant spec files in `/mnt/user-data/outputs/`** when referenced — the user's specs are canonical.
- **Propose a plan before coding** if the task is longer than 50 lines of change.
- **Run the existing test suite** before declaring done: `pnpm test` (even if you didn't add tests, don't break them).
- **Match the existing code style** — imitate, don't innovate.

---

## 🧭 Repo Context

ProxyOS is part of the **Homelab OS** product family. Other products in the family share patterns — `apps/web` layout, Caddy wrapping pattern, tRPC API layout, better-auth for auth, Lemon Squeezy billing. If you're asked to add a feature that looks similar to something in sibling products (BackupOS, InfraOS, MxWatch, LockBoxOS, AccessOS), check if there's a shared package in `packages/` first before reinventing.

**ProxyOS's special responsibility:** it's the reverse proxy. Routes are user-facing. Breaking a route in production means users can't reach their services. Treat the route generator and Caddy config layer with extra caution.

---

## 🛑 Hard Stops

If you encounter any of these, STOP and ask before proceeding:

- User asks you to modify a file in the locked list above
- A change you're about to make would require updating the locked list
- The spec you were given appears internally contradictory
- A verification gate defined in the spec is failing and you can't see why
- You find a security-relevant issue (auth bypass, SQL injection, exposed secret)
- You're about to add a new top-level dependency
- You're about to change database schema in a way that requires data migration

For all of these: STOP. Report the finding. Wait for user direction.

---

## 📜 Version History of This File

```
2026-04-18  Initial version — after Phase 1 ProxyOS bug fixes
            Locked: next.config.mjs, build-route.ts, resolve-upstream.ts,
                    regenerate-routes.ts, all existing migrations

2026-04-18  Added Auth Cookie Handling lock (commit 1c9bf69)
            Locked: packages/api/src/routers/users.ts (login __setCookie),
                    packages/api/src/trpc.ts (resHeaders fallback),
                    apps/web/src/app/api/trpc/[trpc]/route.ts (interceptor),
                    docker-compose.yml (docker.sock mount)
```

When you update this file (with user approval), append a version row.

---

## TL;DR

1. Read this file every session.
2. Don't touch locked files without explicit user ask.
3. Don't expand scope.
4. Don't refactor what works.
5. Run the gates the spec gives you.
6. One commit per spec.
7. Report honestly — including what you didn't do.

This isn't bureaucracy. It's because the user has been burned by scope creep and silent changes. Respect the contract and this project stays shippable.
