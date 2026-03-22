---
name: pinme-api
description: 当用户的 PinMe 项目（Worker TypeScript）需要集成发送邮件（send_email）或调用大模型 API（chat/completions）时使用此技能。指导 AI 生成正确的 Worker TS 代码。
---

# PinMe Worker API 集成

指导在 PinMe Worker（TypeScript）中调用 PinMe 平台的邮件发送和 LLM API。

## 环境变量

Worker 创建时自动注入以下环境变量，无需手动配置：

```typescript
// backend/src/worker.ts
export interface Env {
  DB: D1Database;
  API_KEY: string;      // 项目 API Key — 用于 send_email 和 chat/completions 认证
}
```

> `API_KEY` 是 Worker 调用 PinMe 平台 API 的唯一凭证。

---

## API 1：发送邮件

**端点：** `POST https://pinme.dev/api/v4/send_email`
**认证：** `X-API-Key` header（使用 `env.API_KEY`）
**发件人：** 自动为 `{project_name}@pinme.dev`

### 请求格式

```json
{
  "to": "user@example.com",
  "subject": "Your verification code",
  "html": "<p>Your code is <strong>123456</strong></p>"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `to` | string | 是 | 收件人邮箱 |
| `subject` | string | 是 | 邮件主题 |
| `html` | string | 是 | HTML 正文 |

### 响应格式

**成功 (200)：**
```json
{ "code": 200, "msg": "ok", "data": { "ok": true } }
```

**错误：**

| HTTP 状态码 | 含义 | data.error 示例 |
|-------------|------|-----------------|
| 401 | API Key 缺失或无效 | `"X-API-Key header is required"` / `"Invalid API key"` |
| 400 | 参数校验失败 | `"Invalid email address"` / `"Subject is required"` |
| 500 | 邮件服务异常 | `"Failed to send email"` |

### Worker 示例代码

```typescript
async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch('https://pinme.dev/api/v4/send_email', {
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

// 在路由中使用
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

## API 2：LLM Chat Completions

**端点：** `POST https://pinme.dev/api/v1/chat/completions?project_name={project_name}`
**认证：** `X-API-Key` header（使用 `env.API_KEY`）
**请求体：** OpenAI 兼容格式，原样透传给 LLM 服务
**流式：** 支持 SSE（`stream: true`）

### 请求格式

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

> `project_name` 从 Worker 的子域名解析，见下方示例。模型列表参考 [PinMe LLM 支持的模型](https://openrouter.ai/models)（OpenAI 兼容格式）。

### 响应格式

**非流式成功 (200)：**
```json
{
  "id": "chatcmpl-...",
  "choices": [{ "message": { "role": "assistant", "content": "Hello!" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
}
```

**流式成功 (200)：** SSE 格式
```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" there"}}]}
data: [DONE]
```

**错误：**

| HTTP 状态码 | 含义 | data.error 示例 |
|-------------|------|-----------------|
| 401 | API Key 缺失或无效 | `"X-API-Key header is required"` / `"Invalid API key or project name"` |
| 400 | project_name 缺失或 LLM 未配置 | `"project_name is required"` / `"LLM service not configured for this project"` |
| 413 | 请求体超过 1MB | `"Request body too large (max 1MB)"` |
| 502 | LLM 服务不可用 | `"LLM service unavailable"` |

### Worker 示例代码 — 非流式

```typescript
// 获取 project_name：从 Worker 的子域名解析
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
  const resp = await fetch(
    `https://pinme.dev/api/v1/chat/completions?project_name=${projectName}`,
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

// 在路由中使用
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

### Worker 示例代码 — 流式（SSE 透传）

```typescript
async function handleChatStream(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const projectName = getProjectName(request);

  // 确保请求中 stream=true
  let parsed = JSON.parse(body);
  parsed.stream = true;

  const resp = await fetch(
    `https://pinme.dev/api/v1/chat/completions?project_name=${projectName}`,
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

  // 直接透传 SSE 流
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

### 前端消费 SSE 流示例

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
    buffer = lines.pop()!; // 保留不完整的行

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

## 错误处理模式

PinMe 平台 API 统一响应格式：

```typescript
interface PinmeResponse<T = unknown> {
  code: number;   // 200=成功，其他=失败
  msg: string;    // "ok" | "error" | "invalid params"
  data?: T;       // 成功时为业务数据，失败时可能含 { error: string }
}
```

### 推荐的统一错误处理

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

### 使用示例

```typescript
// 发邮件
const emailResult = await callPinmeAPI<{ ok: boolean }>(
  'https://pinme.dev/api/v4/send_email', env.API_KEY,
  { to: 'user@example.com', subject: 'Hello', html: '<p>Hi</p>' },
);
if (emailResult.error) return json({ error: emailResult.error }, 500);

// 调 LLM（非流式）
const llmResult = await callPinmeAPI<{ choices: Array<{ message: { content: string } }> }>(
  `https://pinme.dev/api/v1/chat/completions?project_name=${projectName}`, env.API_KEY,
  { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }] },
);
if (llmResult.error) return json({ error: llmResult.error }, 502);
```
