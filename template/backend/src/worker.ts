// ============ 类型定义 ============

export interface Env {
  DB: any;
}

// ============ 工具函数 ============

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// 内存存储（开发阶段使用，上线后换 D1）
const messages: { id: number; content: string; created_at: string }[] = [];
let messageId = 0;

// ============ 路由处理器 ============

async function handleHello(env: Env): Promise<Response> {
  // 如果有 D1 数据库，使用数据库
  if (env.DB) {
    const { results } = await env.DB
      .prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 10')
      .all();
    return json({ message: 'Hello from Worker!', data: results, source: 'd1' });
  }
  // 否则使用内存存储
  return json({ 
    message: 'Hello from Worker!', 
    data: messages.slice(-10).reverse(),
    source: 'memory' 
  });
}

async function handleAddMessage(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { message?: string };
  const message = (body.message ?? '').trim().slice(0, 500);
  if (!message) return json({ error: 'message is required' }, 400);

  // 如果有 D1 数据库，使用数据库
  if (env.DB) {
    const result = await env.DB
      .prepare('INSERT INTO messages (content) VALUES (?) RETURNING *')
      .bind(message)
      .first();
    return json(result, 201);
  }

  // 否则使用内存存储
  const newMessage = {
    id: ++messageId,
    content: message,
    created_at: new Date().toISOString(),
  };
  messages.push(newMessage);
  return json(newMessage, 201);
}

// ============ 示例 Demo API ============

async function handleGetRootDomain(): Promise<Response> {
  try {
    const response = await fetch('https://pinme.dev/api/v4/root_domain', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    return json(data);
  } catch (error) {
    return json({ error: 'Failed to fetch root domain' }, 500);
  }
}

// ============ 主入口 ============

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    // 处理 CORS 预检请求
    if (method === 'OPTIONS') {
      return handleOptions();
    }

    try {
      if (pathname === '/api/hello' && method === 'GET') return handleHello(env);
      if (pathname === '/api/messages' && method === 'POST') return handleAddMessage(request, env);
      if (pathname === '/api/root-domain' && method === 'GET') return handleGetRootDomain();

      return json({ error: 'Not found' }, 404);
    } catch {
      return json({ error: 'Internal server error' }, 500);
    }
  },
};
