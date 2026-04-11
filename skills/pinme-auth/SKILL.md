---
name: pinme-auth
description: Use when a PinMe project (Worker TypeScript) needs to integrate user authentication — creating email/password users, verifying id_tokens, querying user info, or listing users via Identity Platform auth proxy APIs.
---

# PinMe Worker Auth API Integration

Guides how to call PinMe platform's Identity Platform auth proxy APIs in a PinMe Worker (TypeScript).

## Environment Variables

```typescript
// backend/src/worker.ts
export interface Env {
  DB: D1Database;
  API_KEY: string;       // 项目 API Key — 用于所有 auth 接口认证
  PROJECT_NAME: string;  // 项目名 — 所有 auth 接口必须同时传递
  BASE_URL?: string;     // 可选，默认 https://pinme.dev
}
```

> `API_KEY` 和 `PROJECT_NAME` 是所有 auth 接口的必填凭证，缺一不可。

---

## 认证方式（所有接口通用）

| 参数 | 传递方式 | 必填 | 说明 |
|------|---------|------|------|
| `X-API-Key` | 请求头 | 是 | 项目 API Key |
| `project_name` | Query 参数 | 是 | 必须与 `X-API-Key` 对应同一个项目 |

服务端会先校验这两个字段是否匹配同一个项目，再从项目配置中取出 `tenant_id`，然后转调 Identity Platform。

---

## 通用错误

| 场景 | HTTP | `data.error` |
|------|------|-------------|
| 缺少 `X-API-Key` | 401 | `X-API-Key header is required` |
| 缺少 `project_name` | 400 | `project_name is required` |
| API Key 和项目不匹配 | 401 | `Invalid API key or project name` |
| 项目未配置认证租户 | 400 | `Auth service not configured for this project` |

---

## 通用 TypeScript 类型

```typescript
type ApiEnvelope<T> = {
  code: number   // 200=成功，其他=失败
  msg: string    // "ok" | "fail" | "invalid param"
  data: T
}

type ApiErrorData = { error?: string }

type UserInfo = {
  uid: string
  email: string
  display_name: string
  photo_url?: string
  disabled: boolean
  email_verified: boolean
}
```

---

## API 1: 创建用户

**Endpoint:** `POST {BASE_URL}/api/v1/auth/create_user?project_name={project_name}`

仅用于邮箱密码注册。成功时用户已创建且验证邮件已发出；失败时自动回滚，不会留下僵尸账号。

> 创建成功后用户默认仍是"未验证"状态，需点击邮件验证链接后，`verify_token` 才能通过校验。

### 请求体

```json
{ "email": "alice@example.com", "password": "Test@12345678", "display_name": "Alice" }
```

| 字段 | 类型 | 必填 |
|------|------|------|
| `email` | string | 是 |
| `password` | string | 是 |
| `display_name` | string | 否 |

### 错误

| 场景 | HTTP | `data.error` |
|------|------|-------------|
| 缺少 email/password | 400 | `email and password are required` |
| 上游创建失败 | 502 | `Failed to create user` |
| 发送验证邮件失败 | 500 | `Failed to send verification email. Please try again.` |

### TypeScript 示例

```typescript
async function createAuthUser(
  env: Env,
  payload: { email: string; password: string; display_name?: string }
): Promise<{ user?: UserInfo; error?: string }> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const resp = await fetch(
    `${baseUrl}/api/v1/auth/create_user?project_name=${encodeURIComponent(env.PROJECT_NAME)}`,
    {
      method: 'POST',
      headers: { 'X-API-Key': env.API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  const result = await resp.json() as ApiEnvelope<UserInfo | ApiErrorData>;
  if (!resp.ok || result.code !== 200) {
    return { error: (result.data as ApiErrorData)?.error ?? result.msg };
  }
  return { user: result.data as UserInfo };
}
```

---

## API 2: 校验 id_token

**Endpoint:** `POST {BASE_URL}/api/v1/auth/verify_token?project_name={project_name}`

校验前端登录后拿到的 `id_token`（邮箱密码或 Google 登录均适用）。

**注意：** token 合法但邮箱未验证时返回 `403`，不是 `401`。

### 请求体

```json
{ "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6..." }
```

### 成功响应 data

```typescript
type VerifyTokenData = {
  uid: string
  email?: string
  tenant_id: string
  claims: Record<string, unknown>
}
```

### 错误

| 场景 | HTTP | `data.error` |
|------|------|-------------|
| 缺少 `id_token` | 400 | `id_token is required` |
| token 无效或过期 | 401 | `Invalid or expired token` |
| 邮箱未验证 | 403 | `Email not verified. Please check your inbox and verify your email address.` |

### TypeScript 示例

```typescript
async function verifyAuthToken(
  env: Env,
  idToken: string
): Promise<{ uid?: string; email?: string; error?: string; emailNotVerified?: boolean }> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const resp = await fetch(
    `${baseUrl}/api/v1/auth/verify_token?project_name=${encodeURIComponent(env.PROJECT_NAME)}`,
    {
      method: 'POST',
      headers: { 'X-API-Key': env.API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    }
  );
  const result = await resp.json() as ApiEnvelope<VerifyTokenData | ApiErrorData>;
  if (!resp.ok || result.code !== 200) {
    const error = (result.data as ApiErrorData)?.error ?? result.msg;
    return { error, emailNotVerified: resp.status === 403 };
  }
  const data = result.data as VerifyTokenData;
  return { uid: data.uid, email: data.email };
}
```

---

## API 3: 查询单个用户

**Endpoint:** `GET {BASE_URL}/api/v1/auth/user?project_name={project_name}&uid={uid}`

### 错误

| 场景 | HTTP | `data.error` |
|------|------|-------------|
| 缺少 `uid` | 400 | `uid is required` |
| 用户不存在 | 404 | `User not found` |
| 上游查询失败 | 502 | `Failed to get user` |

### TypeScript 示例

```typescript
async function getAuthUser(env: Env, uid: string): Promise<{ user?: UserInfo; error?: string }> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const resp = await fetch(
    `${baseUrl}/api/v1/auth/user?project_name=${encodeURIComponent(env.PROJECT_NAME)}&uid=${encodeURIComponent(uid)}`,
    { method: 'GET', headers: { 'X-API-Key': env.API_KEY } }
  );
  const result = await resp.json() as ApiEnvelope<UserInfo | ApiErrorData>;
  if (!resp.ok || result.code !== 200) {
    return { error: (result.data as ApiErrorData)?.error ?? result.msg };
  }
  return { user: result.data as UserInfo };
}
```

---

## API 4: 列出用户（分页）

**Endpoint:** `GET {BASE_URL}/api/v1/auth/list_users?project_name={project_name}`

默认 `max_results=100`，最大 `1000`。通过 `next_page_token` 循环翻页。

### Query 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `project_name` | 是 | 项目名 |
| `page_token` | 否 | 分页游标 |
| `max_results` | 否 | 每页数量，1–1000 |

### TypeScript 示例

```typescript
async function listAuthUsers(
  env: Env,
  options: { pageToken?: string; maxResults?: number } = {}
): Promise<{ users?: UserInfo[]; nextPageToken?: string; error?: string }> {
  const baseUrl = env.BASE_URL ?? 'https://pinme.dev';
  const url = new URL('/api/v1/auth/list_users', baseUrl);
  url.searchParams.set('project_name', env.PROJECT_NAME);
  if (options.pageToken) url.searchParams.set('page_token', options.pageToken);
  if (options.maxResults) url.searchParams.set('max_results', String(options.maxResults));

  const resp = await fetch(url.toString(), { method: 'GET', headers: { 'X-API-Key': env.API_KEY } });
  const result = await resp.json() as ApiEnvelope<{ users: UserInfo[]; next_page_token?: string } | ApiErrorData>;
  if (!resp.ok || result.code !== 200) {
    return { error: (result.data as ApiErrorData)?.error ?? result.msg };
  }
  const data = result.data as { users: UserInfo[]; next_page_token?: string };
  return { users: data.users, nextPageToken: data.next_page_token };
}

// 批量遍历所有用户示例
async function* iterAllUsers(env: Env) {
  let pageToken: string | undefined;
  do {
    const { users, nextPageToken, error } = await listAuthUsers(env, { pageToken, maxResults: 1000 });
    if (error) throw new Error(error);
    for (const user of users ?? []) yield user;
    pageToken = nextPageToken;
  } while (pageToken);
}
```

---

## 前端集成（Firebase Auth）

`create_worker` 响应中包含 `public_client_config`，前端用它初始化 Firebase Auth SDK。

### 两种 api_key 区分

| 字段 | 用途 | 是否可暴露到浏览器 |
|------|------|-----------------|
| `data.api_key` | 项目 API Key，调用本文所有代理接口 | **不能**，只给 Worker/服务端 |
| `data.public_client_config.auth_api_key` | Firebase Web API Key，初始化前端登录 SDK | 可以 |

### public_client_config 字段说明

| 字段 | 前端用途 |
|------|---------|
| `public_client_config.auth_api_key` | `initializeApp({ apiKey })` |
| `public_client_config.auth_domain` | `initializeApp({ authDomain })` |
| `public_client_config.auth_project_id` | `initializeApp({ projectId })` |
| `public_client_config.tenant_id` | `auth.tenantId = config.tenant_id`（必须设置，否则 token 归属错误） |

### 前端 TypeScript 示例

```typescript
import { initializeApp } from 'firebase/app'
import {
  type Auth,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'

type PublicClientConfig = {
  tenant_id: string
  auth_api_key: string
  auth_domain: string
  auth_project_id: string
}

export function createProjectAuth(config: PublicClientConfig): Auth {
  const app = initializeApp({
    apiKey: config.auth_api_key,
    authDomain: config.auth_domain,
    projectId: config.auth_project_id,
  })
  const auth = getAuth(app)
  auth.tenantId = config.tenant_id  // 必须设置，确保 token 归属正确租户
  return auth
}

// 邮箱密码登录，返回 id_token
export async function loginWithEmail(auth: Auth, email: string, password: string): Promise<string> {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user.getIdToken()
}

// Google 登录，返回 id_token
export async function loginWithGoogle(auth: Auth): Promise<string> {
  const credential = await signInWithPopup(auth, new GoogleAuthProvider())
  return credential.user.getIdToken()
}

// 用法示例
// pinme create 会自动将 public_client_config 写入 frontend/src/utils/config.ts
import { public_client_config } from '../utils/config'

const auth = createProjectAuth(public_client_config)
const idToken = await loginWithGoogle(auth)
// 然后把 idToken 发给自己的 Worker，由 Worker 调用 verify_token
```

> 前端只负责登录和拿 `id_token`，不要直接持有项目 `api_key`。`verify_token` 必须由 Worker/服务端代调。
> `frontend/src/utils/config.ts` 由 `pinme create` 自动生成，无需手动创建。

---

## 典型调用链路

**邮箱密码注册流程：**
1. `create_user` → 创建用户并发出验证邮件
2. 用户点击邮件链接完成验证
3. 前端登录拿到 `id_token`
4. `verify_token` → 校验 token，取得 `uid`
5. 需要时再调 `getAuthUser` 读取完整用户信息

**Google 登录流程：**
1. 前端完成 Google Sign-In，拿到 `id_token`
2. `verify_token` → 校验 token（无需调用 `create_user`）

---

## 易错点

| 错误 | 正确做法 |
|------|---------|
| 只传 `X-API-Key`，忘记 `project_name` | 每个请求都要同时带 `X-API-Key` header 和 `project_name` query |
| `verify_token` 返回 403 时当 token 失效处理 | 403 = 邮箱未验证，提示用户检查邮箱；401 才是 token 失效 |
| `create_user` 成功就认为邮箱已验证 | 创建成功只代表验证邮件已发，用户必须点击后才算验证 |
| `list_users` 只取第一页 | 有 `next_page_token` 时需继续请求，直到为空 |
| 成功判断只看 `resp.ok` | 同时判断 `resp.ok && result.code === 200` |
