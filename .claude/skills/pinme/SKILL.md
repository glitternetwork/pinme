---
name: pinme
description: 当用户提到 "pinme"、"上传文件"、"部署静态网站"、"pin" 时使用此技能；当用户需要创建网站项目（带前端页面和后端 API）、新建项目、需要后端接口或数据库时也使用此技能。提供两类功能：① 上传文件/静态网站到 IPFS；② 创建并部署全栈网站项目（前端 React+Vite + 后端 Cloudflare Worker + D1 数据库）。
---

# PinMe 技能

PinMe CLI 提供两类功能：**① 上传文件/静态网站**，**② 创建并部署网站项目（前端页面 + 后端 API）**。

---

## 一、上传文件 / 静态网站

> **无需登录**，直接上传即可。

### 步骤

**1. 检查是否已安装**

```bash
pinme --version
# 未安装则执行：
npm install -g pinme
```

**2. 确认上传目标**

静态网站，按优先级查找构建输出目录：
1. `dist/` — Vue / React / Vite 默认输出
2. `build/` — Create React App 输出
3. `out/` — Next.js 静态导出
4. `public/` — 纯静态项目

**3. 执行上传**

```bash
pinme upload <路径>
```

**4. 返回结果**

上传成功后返回预览链接给用户。

### 常见示例

```bash
pinme upload ./document.pdf          # 上传单个文件
pinme upload ./my-folder             # 上传文件夹
pinme upload dist                   # Vue/Vite 构建后上传
pinme upload build                   # React CRA 构建后上传
pinme upload out                     # Next.js 静态导出后上传
pinme upload ./dist --domain my-site # 绑定 Pinme 子域名（需要 VIP）
pinme import ./my-archive.car        # 导入 CAR 文件
```

### 不要上传

- `node_modules/`、`.env` 文件、`.git/` 目录
- 源代码目录（上传 `dist/` 等构建产物，不上传 `src/`）

---

## 二、创建并部署网站项目

> **需要先登录**，`pinme create` / `pinme save` 等命令必须已登录才能使用。

### 架构：前后端分离

| 层 | 技术 | 部署目标 |
|----|------|---------|
| 前端 | React + Vite（`frontend/`） | `pinme upload frontend/dist/` → IPFS |
| 后端 | Cloudflare Worker（`backend/src/worker.ts`） | `pinme save` → `{name}.pinme.pro` |
| 数据库 | D1 SQLite（`db/*.sql`） | `pinme update-db` |

### 核心命令

```bash
pinme login                  # 登录（只需一次）
pinme create <dirName>       # 从远程仓库克隆模板并创建项目（自动填充 API 地址）
pinme save                   # 首次部署 / 全量更新（同时部署前端 + 后端 + 数据库，一条命令搞定）
pinme update-worker          # 只更新后端（仅改了 backend/src/worker.ts 时用）
pinme update-web            # 只更新前端（仅改了 frontend/src/ 时用）
pinme update-db             # 只执行 SQL 迁移（仅改了 db/ 时用）
```

> ⚠️ **`pinme save` 会同时打包并部署前端、后端、数据库三部分，执行完即可，无需再执行其他命令。**
> 只有在明确只改了某一部分时，才使用对应的 `pinme update-*` 命令来节省时间。

### 项目结构

```
{项目名}/
├── pinme.toml              # 根配置（自动生成，不要修改）
├── package.json            # monorepo 根（workspaces: frontend + backend）
├── backend/
│   ├── wrangler.toml       # Worker 配置（自动生成，不要修改）
│   ├── package.json
│   └── src/
│       └── worker.ts       # 后端唯一入口，只返回 JSON API ← AI 填充业务逻辑
│   └── schema/
│       └── 001_init.sql    # ← AI 填充建表语句
├── frontend/
│   ├── package.json
│   ├── vite.config.ts      # 含开发代理 /api → localhost:8787
│   ├── index.html
│   ├── .env                # 自动生成：VITE_WORKER_URL=https://...（不要修改）
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── utils/
│       │   └── api.ts      # export const API = import.meta.env.VITE_WORKER_URL || ''
│       └── pages/
│           └── Home/
│               └── index.tsx  # ← AI 填充页面组件
└── .gitignore
```

### 首次部署

```bash
pinme login
pinme create my-app
cd my-app
# 修改 backend/src/worker.ts（添加 API 路由）
# 修改 frontend/src/pages/（添加页面组件）
pinme save
# ✅ 前端 + 后端 + 数据库一次性全部部署完成
# ✅ 输出前端预览链接：https://pinme.dev/#/preview/{CID}
#    打开该链接即可查看并获取最终前端访问地址
```

> **注意：** 执行完 `pinme save` 后无需再执行任何其他命令，数据库迁移也已包含在内。
> 前端部署成功后会输出一个预览链接（`https://pinme.dev/#/preview/{CID}`），**将该链接返回给用户**，用户可在页面中查看最终访问地址。

### 后续更新（按改动内容选择）

| 改动范围 | 执行命令 | 说明 |
|---------|----------|------|
| 只改了后端代码（`backend/src/worker.ts`） | `pinme update-worker` | 只更新 Worker，速度更快 |
| 只改了前端代码（`frontend/src/`） | `pinme update-web` | 只重新构建并上传前端 |
| 只改了 SQL 迁移文件（`db/`） | `pinme update-db` | 只执行新增的迁移文件 |
| 改了多处，或不确定改了哪里 | `pinme save` | 全量部署，安全兜底 |

> ⚠️ **前端地址说明：** 每次部署前端（执行 `pinme save` 或 `pinme update-web`），只要前端文件有任何改动，都会生成新的 CID，输出一个新的预览链接 `https://pinme.dev/#/preview/{CID}`。**旧链接仍然可以访问**，请将最新预览链接告知用户，用户可在页面中获取最终访问地址。

### 后端 Worker 代码模式（backend/src/worker.ts）

Worker 后端**只能写 JSON API，不能引入任何 npm 包**（hono、express 等均禁止），使用手写路由：

```typescript
export interface Env {
  DB: D1Database;           // 有数据库时添加
  JWT_SECRET: string;       // 有 JWT 认证时添加
  ADMIN_PASSWORD: string;   // 有单密码认证时添加
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

**Worker 禁止列表：**

| 禁止行为 | 正确替代 |
|---------|---------|
| `import from 'hono'` 等 npm 包 | 手写路由（`if pathname === '/api/...'`） |
| `import fs from 'fs'` / Node.js 内置模块 | 用 Web API：`crypto`、`fetch`、`URL` 等 |
| `require()` 语法 | 只用 ESM `import` |
| Worker 返回 HTML | Worker 只返回 JSON API |
| 明文存储密码 | 必须 SHA-256 哈希后存储 |
| SQL 字符串拼接 | 必须 `.bind()` 参数化 |

### 前端 API 工具（frontend/src/utils/api.ts）

```typescript
// 开发环境：走 Vite 代理 /api → localhost:8787
// 生产环境：VITE_WORKER_URL 由 pinme create 自动写入 .env
export const API = import.meta.env.VITE_WORKER_URL || '';

export function getApiUrl(path: string): string {
  return API ? `${API}${path}` : path;
}
```

### 数据库操作（D1 SQLite）

```typescript
// 查多行
const { results } = await env.DB.prepare('SELECT * FROM t WHERE x = ?').bind(val).all();

// 查单行（不存在时返回 null）
const row = await env.DB.prepare('SELECT * FROM t WHERE id = ?').bind(id).first();

// 插入并返回新行
const row = await env.DB.prepare('INSERT INTO t (a, b) VALUES (?, ?) RETURNING *').bind(a, b).first();

// 更新
await env.DB.prepare('UPDATE t SET a = ? WHERE id = ?').bind(val, id).run();

// 删除（检查是否命中）
const { meta } = await env.DB.prepare('DELETE FROM t WHERE id = ?').bind(id).run();
if (meta.changes === 0) return json({ error: 'Not found' }, 404);
```

**SQL 迁移文件格式：** `db/NNN_描述.sql`（如 `001_init.sql`），按文件名顺序执行。

**SQLite 类型约束：**

| 不能用 | 替代 |
|--------|------|
| `BOOLEAN` | `INTEGER`（0 = false，1 = true） |
| `DATETIME` / `TIMESTAMP` | `TEXT`，存 ISO 8601（默认值用 `datetime('now')`） |
| `JSON` 类型 | `TEXT`，存时 `JSON.stringify()`，取时 `JSON.parse()` |
| `VARCHAR(n)` | `TEXT` |

### 能力边界

**不支持（遇到请降级）：**

| 限制 | 降级方案 |
|------|----------|
| 文件存储（上传图片） | 存外部图片 URL，或 `pinme upload` 上传后存 IPFS 链接 |
| WebSocket | 轮询 API（每 5 秒 `fetch`） |
| 多 Worker | 合并为单 Worker，路由前缀区分 |
| 多数据库 | 合并到一个 D1 |

### 注意事项

- `pinme.toml`、`backend/wrangler.toml`、`frontend/.env` 均由 `pinme create` 自动生成，**不要修改**
- 前端 API 地址通过 `VITE_WORKER_URL` 环境变量自动注入，不要硬编码
- 密码、Token、API Key 必须放 secrets，不能写入配置文件

---

## 错误处理

| 错误 | 解决方案 |
|------|----------|
| `command not found: pinme` | 执行 `npm install -g pinme` |
| `No such file or directory` | 检查路径是否存在 |
| `Permission denied` | 检查文件/文件夹权限 |
| 上传失败 | 检查网络，重试 |
| 未登录报错 | 先执行 `pinme login` |

## 其他命令

```bash
pinme list / pinme ls -l 5    # 查看上传历史
pinme list -c                 # 清除上传历史
pinme rm <hash>               # 删除已上传的文件
pinme bind <路径> --domain <域名>  # 绑定域名（需要 VIP + AppKey）
pinme export <CID>            # 导出内容为 CAR 文件
pinme set-appkey              # 查看/设置 AppKey
pinme my-domains              # 查看已绑定的域名
pinme delete <project>           # 删除项目（Worker + 域名 + D1 数据库）
pinme logout                  # 退出登录
```
