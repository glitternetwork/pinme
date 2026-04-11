---
name: pinme-email
description: Use this skill when a PinMe project (Worker TypeScript) needs to integrate email sending (send_email). Guides AI to generate correct Worker TS code.
---

# PinMe Worker Email API Integration

Guides how to call PinMe platform's email sending API in a PinMe Worker (TypeScript).

## Environment Variables

The following environment variables are automatically injected when the Worker is created — no manual configuration needed:

```typescript
// backend/src/worker.ts
export interface Env {
  DB: D1Database;
  API_KEY: string;      // Project API Key — used for send_email authentication
  BASE_URL?: string;    // Optional override for PinMe API base URL, defaults to https://pinme.dev
}
```

> `API_KEY` is the sole credential for the Worker to call PinMe platform APIs. When `BASE_URL` is not set, it defaults to `https://pinme.dev`.

---

## Send Email API

**Endpoint:** `POST {BASE_URL}/api/v4/send_email`
**Authentication:** `X-API-Key` header (using `env.API_KEY`)
**Sender:** Automatically set to `{project_name}@pinme.dev`

### Request Format

```json
{
  "to": "user@example.com",
  "subject": "Your verification code",
  "html": "<p>Your code is <strong>123456</strong></p>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Recipient email address |
| `subject` | string | Yes | Email subject |
| `html` | string | Yes | HTML body |

### Response Format

**Success (200):**
```json
{ "code": 200, "msg": "ok", "data": { "ok": true } }
```

**Errors:**

| HTTP Status | Meaning | data.error Example |
|-------------|---------|-------------------|
| 401 | API Key missing or invalid | `"X-API-Key header is required"` / `"Invalid API key"` |
| 400 | Parameter validation failed | `"Invalid email address"` / `"Subject is required"` |
| 500 | Email service error | `"Failed to send email"` |

### Worker Example Code

```typescript
async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const resp = await fetch(`${baseUrl}/api/v4/send_email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': env.API_KEY,
    },
    body: JSON.stringify({ to, subject, html }),
  });

  const result = await resp.json() as { code: number; msg: string; data?: { ok?: boolean; error?: string } };

  if (resp.status !== 200 || result.code !== 200) {
    return { ok: false, error: result.data?.error || result.msg || 'Unknown error' };
  }
  return { ok: true };
}

// Usage in routes
async function handleSendVerification(request: Request, env: Env): Promise<Response> {
  const { email } = await request.json() as { email: string };
  const code = Math.random().toString().slice(2, 8);

  const result = await sendEmail(env, email, 'Verification Code',
    `<p>Your code is <strong>${code}</strong></p>`);

  if (!result.ok) {
    return json({ error: result.error }, 500);
  }
  return json({ ok: true });
}
```

---

## Error Handling Pattern

PinMe platform API unified response format:

```typescript
interface PinmeResponse<T = unknown> {
  code: number;   // 200=success, other=failure
  msg: string;    // "ok" | "error" | "invalid params"
  data?: T;       // Business data on success, may contain { error: string } on failure
}
```

### Recommended Unified Error Handler

```typescript
async function callPinmeAPI<T>(url: string, apiKey: string, body: unknown): Promise<{ data?: T; error?: string }> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: 'Network error' };
  }

  if (!resp.ok) {
    try {
      const err = await resp.json() as PinmeResponse;
      return { error: err.data && typeof err.data === 'object' && 'error' in err.data
        ? (err.data as { error: string }).error
        : err.msg || `HTTP ${resp.status}` };
    } catch {
      return { error: `HTTP ${resp.status}` };
    }
  }

  const result = await resp.json() as PinmeResponse<T>;
  if (result.code !== 200) {
    return { error: result.data && typeof result.data === 'object' && 'error' in result.data
      ? (result.data as { error: string }).error
      : result.msg };
  }
  return { data: result.data as T };
}
```

### Usage Example

```typescript
const baseUrl = env.BASE_URL ?? 'https://pinme.dev';

// Send email
const emailResult = await callPinmeAPI<{ ok: boolean }>(
  `${baseUrl}/api/v4/send_email`, env.API_KEY,
  { to: 'user@example.com', subject: 'Hello', html: '<p>Hi</p>' },
);
if (emailResult.error) return json({ error: emailResult.error }, 500);
```
