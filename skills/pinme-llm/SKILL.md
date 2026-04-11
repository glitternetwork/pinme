---
name: pinme-llm
description: Use this skill when a PinMe project (Worker TypeScript) needs to call LLM API (chat/completions). Guides AI to generate correct Worker TS code.
---

# PinMe Worker LLM API Integration

Guides how to call PinMe platform's LLM Chat Completions API in a PinMe Worker (TypeScript).

## Environment Variables

The following environment variables are automatically injected when the Worker is created — no manual configuration needed:

```typescript
// backend/src/worker.ts
export interface Env {
  DB: D1Database;
  API_KEY: string;      // Project API Key — used for chat/completions authentication
  BASE_URL?: string;    // Optional override for PinMe API base URL, defaults to https://pinme.dev
}
```

> `API_KEY` is the sole credential for the Worker to call PinMe platform APIs. When `BASE_URL` is not set, it defaults to `https://pinme.dev`.

---

## LLM Chat Completions API

**Endpoint:** `POST {BASE_URL}/api/v1/chat/completions?project_name={project_name}`
**Authentication:** `X-API-Key` header (using `env.API_KEY`)
**Request Body:** OpenAI-compatible format, passed through to LLM service as-is
**Streaming:** Supports SSE (`stream: true`)

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

> `project_name` is parsed from the Worker's subdomain — see example below. For available models, refer to [PinMe LLM Supported Models](https://openrouter.ai/models) (OpenAI-compatible format).

### Response Format

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
| 401 | API Key missing or invalid | `"X-API-Key header is required"` / `"Invalid API key or project name"` |
| 400 | project_name missing or LLM not configured | `"project_name is required"` / `"LLM service not configured for this project"` |
| 413 | Request body exceeds 1MB | `"Request body too large (max 1MB)"` |
| 502 | LLM service unavailable | `"LLM service unavailable"` |

### Worker Example Code — Non-streaming

```typescript
// Get project_name: parsed from the Worker's subdomain
function getProjectName(request: Request): string {
  const host = new URL(request.url).hostname; // e.g. "my-app-1a2b.pinme.pro"
  return host.split('.')[0];
}

async function callLLM(
  env: Env,
  projectName: string,
  messages: Array<{ role: string; content: string }>,
  model = 'openai/gpt-4o-mini',
): Promise<{ content: string; error?: string }> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const resp = await fetch(
    `${baseUrl}/api/v1/chat/completions?project_name=${projectName}`,
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
    const err = await resp.json() as { data?: { error?: string } };
    return { content: '', error: err.data?.error || `HTTP ${resp.status}` };
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  return { content: data.choices[0]?.message?.content || '' };
}

// Usage in routes
async function handleChat(request: Request, env: Env): Promise<Response> {
  const { question } = await request.json() as { question: string };
  const projectName = getProjectName(request);

  const result = await callLLM(env, projectName, [
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
  const projectName = getProjectName(request);
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';

  // Ensure stream=true in the request
  let parsed = JSON.parse(body);
  parsed.stream = true;

  const resp = await fetch(
    `${baseUrl}/api/v1/chat/completions?project_name=${projectName}`,
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
    const err = await resp.json() as { data?: { error?: string } };
    return json({ error: err.data?.error || `HTTP ${resp.status}` }, resp.status);
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

// Call LLM (non-streaming)
const llmResult = await callPinmeAPI<{ choices: Array<{ message: { content: string } }> }>(
  `${baseUrl}/api/v1/chat/completions?project_name=${projectName}`, env.API_KEY,
  { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }] },
);
if (llmResult.error) return json({ error: llmResult.error }, 502);
```
