import { Link } from 'react-router-dom';
import Header from './components/Header';

export default function App() {
  return (
    <div className="page">
      <Header />

      <main>
        <section className="hero">
          <h2>欢迎使用 Pinme</h2>
          <p>一站式全栈部署工具，前端上 IPFS，后端上 Worker</p>
        </section>

        <section className="features">
          <div className="feature">
            <h3>🚀 快速部署</h3>
            <p>一行命令部署前端到 IPFS，永久不可篡改</p>
          </div>
          <div className="feature">
            <h3>⚡ 极速响应</h3>
            <p>Cloudflare 全球 CDN，边缘计算</p>
          </div>
          <div className="feature">
            <h3>💾 持久存储</h3>
            <p>D1 SQLite 数据库，轻松存储数据</p>
          </div>
        </section>

        <section className="cta">
          <Link to="/home" className="btn-primary">
            开始使用 →
          </Link>
        </section>
      </main>
    </div>
  );
}
