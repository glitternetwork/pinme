---
name: pinme
description: Use this skill when the user mentions "pinme", or needs to upload files, store to IPFS, create/publish/deploy websites or full-stack services (including frontend pages, backend APIs, database storage, email sending, etc.), or any feature requiring backend database/server support.
---

# PinMe

Zero-config deployment tool: upload static files to IPFS, or create and deploy full-stack web projects (React+Vite + Cloudflare Worker + D1 database). Workers also support sending emails via the PinMe platform API.

## When to Use

```dot
digraph pinme_decision {
    "User Request" [shape=doublecircle];
    "Needs backend API or database?" [shape=diamond];
    "Upload Files (Path 1)" [shape=box];
    "Full-Stack Project (Path 2)" [shape=box];

    "User Request" -> "Needs backend API or database?";
    "Needs backend API or database?" -> "Upload Files (Path 1)" [label="No"];
    "Needs backend API or database?" -> "Full-Stack Project (Path 2)" [label="Yes"];
}
```

## Path 1: Upload Files / Static Sites

> No login required.

```dot
digraph upload_flow {
    "Install/update pinme to latest" [shape=box];
    "Determine build artifacts" [shape=box];
    "pinme upload <path>" [shape=box];
    "Return preview URL" [shape=doublecircle];

    "Install/update pinme to latest" -> "Determine build artifacts";
    "Determine build artifacts" -> "pinme upload <path>";
    "pinme upload <path>" -> "Return preview URL";
}
```

**1. Check installation and update to latest:**
```bash
LOCAL=$(pinme --version 2>/dev/null || echo "0.0.0")
LATEST=$(npm view pinme version)
[ "$LOCAL" != "$LATEST" ] && npm install -g pinme@latest || echo "pinme is up to date ($LOCAL)"
```

**2. Determine upload target** (priority order):
1. `dist/` — Vite / Vue / React
2. `build/` — Create React App
3. `out/` — Next.js static export
4. `public/` — Plain static files

**3. Upload:**
```bash
pinme upload <path>
pinme upload ./dist --domain my-site  # Optional: bind subdomain (VIP required)
```

**4. Return** the preview URL (`https://pinme.eth.limo/#/preview/*`) to the user. Note: return the **full URL** including all hash characters — do not truncate.

### Common Examples

```bash
pinme upload ./document.pdf          # Single file
pinme upload ./my-folder             # Folder
pinme upload dist                    # Vite/Vue build artifacts
pinme upload build                   # CRA build artifacts
pinme upload out                     # Next.js static export
pinme upload ./dist --domain my-site # Bind PinMe subdomain (VIP required)
pinme import ./my-archive.car        # Import CAR file
```

### Do NOT Upload
- `node_modules/`, `.env`, `.git/`, `src/`
- Only upload build artifacts, never upload source code

---

## Path 2: Full-Stack Project

> Login required. Uses React+Vite frontend + Cloudflare Worker backend + D1 SQLite database.
> When designing frontend projects, use Ant Design as the primary design reference, and prioritize following its conventions for layout, components, spacing, and interaction patterns.

```dot
digraph fullstack_flow {
    "Install/update pinme to latest" [shape=box];
    "pinme login" [shape=box];
    "pinme create <name>" [shape=box];
    "Modify template code" [shape=box];
    "pinme save" [shape=box];
    "Return preview URL" [shape=doublecircle];

    "Install/update pinme to latest" -> "pinme login";
    "pinme login" -> "pinme create <name>";
    "pinme create <name>" -> "Modify template code";
    "Modify template code" -> "pinme save";
    "pinme save" -> "Return preview URL";
}
```

### Architecture

| Layer | Tech Stack | Deploy Target |
|-------|-----------|---------------|
| Frontend | React + Vite (`frontend/`) | IPFS |
| Backend | Cloudflare Worker (`backend/src/worker.ts`) | `{name}.pinme.pro` |
| Database | D1 SQLite (`db/*.sql`) | Cloudflare D1 |

### Core Commands

```bash
pinme login                  # Login (only needed once)
pinme create <dirName>       # Clone template and create project (auto-fills API URL)
pinme save                   # First deploy / full update (frontend + backend + database, single command)
pinme update-worker          # Update backend only (when only backend/src/worker.ts was modified)
pinme update-web             # Update frontend only (when only frontend/src/ was modified)
pinme update-db              # Run SQL migrations only (when only db/ was modified)
```

> `pinme save` deploys frontend + backend + database all at once. Only use `pinme update-*` when you're certain only one part was modified.

### Project Structure

```
{project}/
├── pinme.toml              # Root config (auto-generated, do not modify)
├── package.json            # Monorepo root (workspaces: frontend + backend)
├── backend/
│   ├── wrangler.toml       # Worker config (auto-generated, do not modify)
│   ├── package.json
│   └── src/
│       └── worker.ts       # Backend entry — JSON API only
├── db/
│   └── 001_init.sql        # SQL table definitions
├── frontend/
│   ├── package.json
│   ├── vite.config.ts      # Dev proxy: /api → localhost:8787
│   ├── index.html
│   ├── .env                # Auto-generated: VITE_WORKER_URL (do not modify)
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── utils/
│       │   ├── api.ts      # export const API = import.meta.env.VITE_WORKER_URL || ''
│       │   └── config.ts   # Auto-generated: public_client_config (only when auth is enabled)
│       └── pages/
│           └── Home/
│               └── index.tsx
└── .gitignore
```

### First Deployment

```bash
LOCAL=$(pinme --version 2>/dev/null || echo "0.0.0")
LATEST=$(npm view pinme version)
[ "$LOCAL" != "$LATEST" ] && npm install -g pinme@latest
pinme login
pinme create my-app
cd my-app
```

`pinme create` generates a working Hello World template (includes frontend page + backend API routes + database schema). **Modify the template** to match the user's business logic — do not write from scratch:

- Modify `backend/src/worker.ts` — replace API routes
- Modify `frontend/src/pages/` — replace page components
- Modify `db/001_init.sql` — replace table definitions

```bash
pinme save
# Single command deploys frontend + backend + database
# Outputs preview URL: https://pinme.eth.limo/#/preview/{CID}
```

**Return** the preview URL to the user. Note: return the **full URL** including all hash characters — do not truncate.

The backend Worker is deployed at `https://{name}.pinme.pro`. Frontend API requests are automatically configured to point to that address — no manual setup needed.

### Subsequent Updates

| Changes | Command | Notes |
|---------|---------|-------|
| Backend only (`backend/src/worker.ts`) | `pinme update-worker` | Faster |
| Frontend only (`frontend/src/`) | `pinme update-web` | Generates new CID |
| Database only (`db/`) | `pinme update-db` | Runs new migrations |
| Multiple changes or uncertain | `pinme save` | Safe full deployment |

> Each frontend deployment generates a new CID and preview URL. Old URLs remain accessible.

---

## Worker Code Patterns (backend/src/worker.ts)

The Worker backend only serves JSON APIs. **No npm packages allowed** (no hono, express, etc.). Write routes manually:

```typescript
export interface Env {
  DB: D1Database;           // When using database
  API_KEY?: string;         // When using email sending
  JWT_SECRET: string;       // When using JWT auth
  ADMIN_PASSWORD: string;   // When using password auth
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    try {
      if (pathname === '/api/items' && method === 'GET')  return handleGetItems(env);
      if (pathname === '/api/items' && method === 'POST') return handleCreateItem(request, env);
      return json({ error: 'Not found' }, 404);
    } catch {
      return json({ error: 'Internal server error' }, 500);
    }
  },
};
```

### Worker Restrictions

| Prohibited | Alternative |
|-----------|-------------|
| `import from 'hono'` or any npm package | Manual routing (`if pathname === '/api/...'`) |
| `import fs from 'fs'` / Node.js built-in modules | Web APIs: `crypto`, `fetch`, `URL`, etc. |
| `require()` syntax | ESM `import` only |
| Worker returning HTML | JSON API only |
| Storing passwords in plaintext | Hash with SHA-256 before storing |
| SQL string concatenation | Use `.bind()` parameterized queries |

### Email API Reference (for Worker Backend)

When the backend needs email sending capability, use the PinMe platform API (`https://pinme.dev/api/v4/send_email`).

**1. Configure API_KEY**

Add to the `Env` interface:

```typescript
export interface Env {
  DB: D1Database;
  API_KEY?: string;  // Required for email sending
}
```

**2. Email Handler Code**

```typescript
async function handleSendEmail(request: Request, env: Env): Promise<Response> {
  const apiKey = env.API_KEY;
  if (!apiKey) {
    return json({ error: 'API_KEY not configured' }, 500);
  }

  const body = await request.json() as {
    to?: string;
    subject?: string;
    html?: string;
  };

  if (!body.to) return json({ error: 'Email address is required' }, 400);
  if (!body.subject) return json({ error: 'Subject is required' }, 400);
  if (!body.html) return json({ error: 'HTML content is required' }, 400);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.to)) {
    return json({ error: 'Invalid email address' }, 400);
  }

  const response = await fetch('https://pinme.dev/api/v4/send_email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      to: body.to,
      subject: body.subject,
      html: body.html,
    }),
  });

  const result = await response.json();
  return json(result);
}
```

## Frontend API Utility (frontend/src/utils/api.ts)

```typescript
// Development: Vite proxies /api → localhost:8787
// Production: VITE_WORKER_URL is auto-injected by pinme create
export const API = import.meta.env.VITE_WORKER_URL || '';

export function getApiUrl(path: string): string {
  return API ? `${API}${path}` : path;
}
```

## D1 Database Operations

```typescript
// Query multiple rows
const { results } = await env.DB.prepare('SELECT * FROM t WHERE x = ?').bind(val).all();

// Query single row (returns null if not found)
const row = await env.DB.prepare('SELECT * FROM t WHERE id = ?').bind(id).first();

// Insert and return new row
const row = await env.DB.prepare('INSERT INTO t (a, b) VALUES (?, ?) RETURNING *').bind(a, b).first();

// Update
await env.DB.prepare('UPDATE t SET a = ? WHERE id = ?').bind(val, id).run();

// Delete (check if affected)
const { meta } = await env.DB.prepare('DELETE FROM t WHERE id = ?').bind(id).run();
if (meta.changes === 0) return json({ error: 'Not found' }, 404);
```

### SQL Migration Files

**Format:** `db/NNN_description.sql` (e.g. `001_init.sql`). Executed in filename order.

**SQLite Type Constraints:**

| Do Not Use | Alternative |
|-----------|-------------|
| `BOOLEAN` | `INTEGER` (0 = false, 1 = true) |
| `DATETIME` / `TIMESTAMP` | `TEXT`, store ISO 8601 (default: `datetime('now')`) |
| `JSON` type | `TEXT`, use `JSON.stringify()` / `JSON.parse()` |
| `VARCHAR(n)` | `TEXT` |

## Capability Limits

| Limitation | Alternative |
|-----------|-------------|
| File storage (image uploads) | Store external image URLs, or `pinme upload` then store IPFS link |
| WebSocket | Polling API (fetch every 5 seconds) |
| Multiple Workers | Merge into a single Worker with route prefixes |
| Multiple databases | Merge into one D1 |

## Important Notes

- `pinme.toml`, `backend/wrangler.toml`, `frontend/.env` are auto-generated — do not modify
- Frontend API URL is obtained via `VITE_WORKER_URL` env var — do not hardcode
- Passwords, tokens, and API keys must be stored in secrets, never in config files

## Common Errors

| Error | Solution |
|-------|----------|
| `command not found: pinme` | `npm install -g pinme` |
| `No such file or directory` | Verify the path exists |
| `Permission denied` | Check file/folder permissions |
| Upload failed | Check network connection, retry |
| Not logged in error | Run `pinme login` first |

## Other Commands

```bash
pinme list / pinme ls -l 5     # View upload history
pinme list -c                  # Clear upload history
pinme rm <hash>                # Delete uploaded content
pinme bind <path> --domain <domain>  # Bind domain (VIP + AppKey required)
pinme export <CID>             # Export as CAR file
pinme set-appkey               # Set/view AppKey
pinme my-domains               # List bound domains
pinme delete <project>          # Delete project (Worker + domain + D1)
pinme logout                   # Log out
```
