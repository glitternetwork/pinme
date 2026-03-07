# Pinme Template

Pinme 官方模板 - 前后端分离架构，使用 Vite + React + TypeScript 前端和 Cloudflare Workers 后端。

## 项目结构（Monorepo）

```
.
├── pinme.toml           # Pinme 配置
├── package.json         # 根配置（npm workspaces）
├── frontend/           # 前端应用
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── backend/           # 后端 Worker
│   ├── src/
│   │   └── worker.ts
│   ├── schema/
│   ├── wrangler.toml
│   └── package.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
# 安装所有依赖（同时安装 frontend + backend）
npm install
```

### 2. 开发模式

```bash
# 终端1：前端（Vite 开发服务器）
npm run dev:frontend

# 终端2：后端（Wrangler 开发服务器）
npm run dev:backend
```

访问 `http://localhost:5173` 即可开发调试。

---

## 部署步骤

### 1. 部署后端 Worker

```bash
npm run deploy:backend
# 或
cd backend && npx wrangler deploy
# 输出: https://your-name.workers.dev
```

### 2. 配置前端环境变量

将 Workers 地址填入 `frontend/.env`：

```bash
# frontend/.env
VITE_WORKER_URL=https://your-name.workers.dev
```

### 3. 构建前端

```bash
npm run build:frontend
# 或
cd frontend && npm run build
```

### 4. 部署前端到 IPFS

```bash
pinme upload frontend/dist/
```

---

## 一键部署

```bash
# 确保已配置 frontend/.env 中的 VITE_WORKER_URL

# 方式一：分别部署
npm run deploy:backend      # 部署后端
npm run deploy:frontend    # 构建 + 部署前端

# 方式二：使用 pinme save（推荐）
pinme save
```

---

## 二次开发

### 修改后端

编辑 `backend/src/worker.ts`，添加新的 API 端点：

```typescript
// 添加新端点
if (pathname === '/api/your-endpoint' && method === 'GET') {
  return handleYourEndpoint(env);
}
```

部署更新：
```bash
npm run deploy:backend
```

### 修改前端

1. **修改页面**：编辑 `frontend/src/pages/` 下的组件
2. **添加新页面**：在 `frontend/src/pages/` 创建组件，然后在 `frontend/src/main.tsx` 添加路由
3. **添加 API**：在 `backend/src/worker.ts` 添加端点，用 `getApiUrl()` 调用

---

## 环境变量

| 位置 | 变量 | 说明 |
|------|------|------|
| `frontend/.env` | VITE_WORKER_URL | Workers 地址（部署后配置） |

**工作原理**：
- 不配置 `VITE_WORKER_URL`：API 调用 `/api/xxx` → Vite 代理 → `localhost:8787`
- 配置 `VITE_WORKER_URL`：API 调用 `https://xxx.workers.dev/api/xxx`

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/hello | 获取消息列表 |
| POST | /api/messages | 添加消息 |
| GET | /api/root-domain | 示例：获取用户 Root Domain |

---

## 技术栈

- **前端**: Vite + React + TypeScript + React Router
- **后端**: Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)
- **部署**: Pinme (IPFS + Workers)

---

## License

MIT
