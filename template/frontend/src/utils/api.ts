// API 配置
// 开发环境：不配置 VITE_WORKER_URL，走 Vite 代理
// 生产环境：配置 VITE_WORKER_URL，使用绝对路径
export const API = import.meta.env.VITE_WORKER_URL || '';

export function getApiUrl(path: string): string {
  return API ? `${API}${path}` : path;
}
