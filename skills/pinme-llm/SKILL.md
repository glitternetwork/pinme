---
name: pinme-llm
description: Use this skill when a PinMe project (Worker TypeScript) needs to call OpenRouter-backed LLM APIs, including models, chat/completions, streaming, or OpenRouter web search. Guides AI to generate correct Worker TS code.
---

# PinMe Worker OpenRouter API Integration

Guides how to call PinMe platform's OpenRouter proxy APIs in a PinMe Worker (TypeScript). Workers use the PinMe project API key; they never hold the real OpenRouter API key.

## Environment Variables

The following environment variables are automatically injected when the Worker is created — no manual configuration needed:

```typescript
// backend/src/worker.ts
export interface Env {
  DB: D1Database;
  API_KEY: string;       // Project API Key from create_worker
  PROJECT_NAME: string;  // Actual project_name from create_worker; must match API_KEY
  BASE_URL?: string;     // Optional override for PinMe API base URL, defaults to https://pinme.dev
}
```

> `API_KEY` authenticates the Worker to PinMe. `PROJECT_NAME` is required for `chat/completions` and must belong to the same project as `API_KEY`. When `BASE_URL` is not set, use `https://pinme.dev`.

---

## Models API

**Endpoint:** `GET {BASE_URL}/api/v1/models`
**Authentication:** `X-API-Key` header (using `env.API_KEY`)
**Request Body:** none

Use this when the Worker needs to list available OpenRouter models. The response body, status, and headers are passed through from OpenRouter `/models`.

```typescript
async function listModels(env: Env): Promise<unknown> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const resp = await fetch(`${baseUrl}/api/v1/models`, {
    headers: { 'X-API-Key': env.API_KEY },
  });

  if (!resp.ok) {
    throw new Error(await extractPinmeOpenRouterError(resp));
  }

  return await resp.json();
}
```

---

## Chat Completions API

**Endpoint:** `POST {BASE_URL}/api/v1/chat/completions?project_name={project_name}`
**Authentication:** `X-API-Key` header (using `env.API_KEY`)
**Request Body:** OpenRouter chat/completions format, passed through as-is after a 1MB size check
**Streaming:** Supports SSE (`stream: true`)
**Web Search:** Supports OpenRouter `openrouter:web_search` server tool via the `tools` array

### Request Format

```json
{
  "model": "openai/gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true
}
```

> Use `env.PROJECT_NAME` from `create_worker`; always URL-encode it in the query string. For available models, call `GET /api/v1/models` or refer to OpenRouter model IDs.

### OpenRouter Web Search

PinMe does not provide a raw search endpoint. To search the web, pass OpenRouter's `openrouter:web_search` server tool to `chat/completions`; the model decides whether and when to search.

Always set `max_results` and `max_total_results` to keep search volume and cost bounded.

```typescript
async function searchWithLLM(env: Env, query: string): Promise<string> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const resp = await fetch(
    `${baseUrl}/api/v1/chat/completions?project_name=${encodeURIComponent(env.PROJECT_NAME)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.API_KEY,
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.2',
        messages: [{ role: 'user', content: query }],
        tools: [
          {
            type: 'openrouter:web_search',
            parameters: {
              engine: 'auto',
              max_results: 5,
              max_total_results: 10,
            },
          },
        ],
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(await extractPinmeOpenRouterError(resp));
  }

  const data = await resp.json() as { choices: Array<{ message?: { content?: string } }> };
  return data.choices[0]?.message?.content ?? '';
}
```

### Response Format

Successful requests return OpenRouter's raw response body.

**Non-streaming Success (200):**
```json
{
  "id": "chatcmpl-...",
  "choices": [{ "message": { "role": "assistant", "content": "Hello!" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
}
```

**Streaming Success (200):** SSE format
```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" there"}}]}
data: [DONE]
```

**Errors:**

| HTTP Status | Meaning | data.error Example |
|-------------|---------|-------------------|
| 401 | API Key missing, invalid, or mismatched with project_name | `"X-API-Key header is required"` / `"Invalid API key"` / `"Invalid API key or project name"` |
| 400 | project_name missing or OpenRouter key not configured | `"project_name is required"` / `"LLM service not configured for this project"` |
| 403 | LLM balance insufficient or disabled | `"Insufficient balance, please recharge to continue using LLM service"` |
| 413 | Request body exceeds 1MB | `"Request body too large (max 1MB)"` |
| 500 | Proxy failed before upstream request | `"Failed to build request"` |
| 502 | LLM service unavailable | `"LLM service unavailable"` |

If OpenRouter receives the request and returns a 4xx/5xx, PinMe passes through OpenRouter's status, headers, and response body instead of wrapping it.

### Worker Example Code — Non-streaming

```typescript
async function callLLM(
  env: Env,
  messages: Array<{ role: string; content: string }>,
  model = 'openai/gpt-4o-mini',
): Promise<{ content: string; error?: string }> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const resp = await fetch(
    `${baseUrl}/api/v1/chat/completions?project_name=${encodeURIComponent(env.PROJECT_NAME)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.API_KEY,
      },
      body: JSON.stringify({ model, messages }),
    },
  );

  if (!resp.ok) {
    return { content: '', error: await extractPinmeOpenRouterError(resp) };
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  return { content: data.choices[0]?.message?.content || '' };
}

// Usage in routes
async function handleChat(request: Request, env: Env): Promise<Response> {
  const { question } = await request.json() as { question: string };

  const result = await callLLM(env, [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: question },
  ]);

  if (result.error) {
    return json({ error: result.error }, 502);
  }
  return json({ answer: result.content });
}
```

### Worker Example Code — Streaming (SSE Passthrough)

```typescript
async function handleChatStream(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';

  // Ensure stream=true in the request
  let parsed = JSON.parse(body);
  parsed.stream = true;

  const resp = await fetch(
    `${baseUrl}/api/v1/chat/completions?project_name=${encodeURIComponent(env.PROJECT_NAME)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.API_KEY,
      },
      body: JSON.stringify(parsed),
    },
  );

  if (!resp.ok) {
    return json({ error: await extractPinmeOpenRouterError(resp) }, resp.status);
  }

  // Pass through SSE stream directly
  return new Response(resp.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...CORS_HEADERS,
    },
  });
}
```

### Frontend SSE Stream Consumer Example

```typescript
async function streamChat(question: string, onChunk: (text: string) => void): Promise<void> {
  const resp = await fetch(getApiUrl('/api/chat/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // Keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') return;

      const chunk = JSON.parse(payload) as { choices: Array<{ delta: { content?: string } }> };
      const content = chunk.choices[0]?.delta?.content;
      if (content) onChunk(content);
    }
  }
}
```

---

## Error Handling Pattern

For `/api/v1/models` and `/api/v1/chat/completions`, successful responses are raw OpenRouter responses. Proxy failures before the OpenRouter request use PinMe's wrapped error format:

```typescript
interface PinmeResponse<T = unknown> {
  code: number;   // 200=success, other=failure
  msg: string;    // "ok" | "error" | "invalid params"
  data?: T;       // Business data on success, may contain { error: string } on failure
}
```

### Recommended Error Extractor

```typescript
async function extractPinmeOpenRouterError(resp: Response): Promise<string> {
  const fallback = `HTTP ${resp.status}`;
  try {
    const body = await resp.clone().json() as PinmeResponse | { error?: { message?: string } } | { error?: string };
    if ('data' in body && body.data && typeof body.data === 'object' && 'error' in body.data) {
      return String((body.data as { error: unknown }).error);
    }
    if ('msg' in body && typeof body.msg === 'string' && body.msg) {
      return body.msg;
    }
    if ('error' in body) {
      const error = body.error;
      if (typeof error === 'string') return error;
      if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message: unknown }).message);
      }
    }
  } catch {
    try {
      const text = await resp.text();
      if (text) return text;
    } catch {
      // Ignore and return fallback below.
    }
  }
  return fallback;
}
```

### Optional JSON Helper

Use this helper for non-streaming `POST` calls. It returns the raw OpenRouter JSON on success.

```typescript
async function callOpenRouterJSON<T>(url: string, apiKey: string, body: unknown): Promise<{ data?: T; error?: string }> {
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
    return { error: await extractPinmeOpenRouterError(resp) };
  }

  return { data: await resp.json() as T };
}
```

### Usage Example

```typescript
const baseUrl = env.BASE_URL ?? 'https://pinme.dev';

// Call LLM (non-streaming)
const llmResult = await callOpenRouterJSON<{ choices: Array<{ message: { content: string } }> }>(
  `${baseUrl}/api/v1/chat/completions?project_name=${encodeURIComponent(env.PROJECT_NAME)}`, env.API_KEY,
  { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }] },
);
if (llmResult.error) return json({ error: llmResult.error }, 502);
```
