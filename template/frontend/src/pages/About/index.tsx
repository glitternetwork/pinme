import Header from '../../components/Header';

export default function About() {
  return (
    <div className="page">
      <Header />

      <main>
        <section className="about">
          <h2>关于 Pinme</h2>
          <p>
            Pinme 是一个一站式全栈部署工具，整合了去中心化静态托管（IPFS）和无服务器后端（Cloudflare Workers + D1 数据库）。
          </p>
          
          <h3>核心功能</h3>
          <ul>
            <li><code>pinme upload</code> - 前端静态文件 → IPFS，永久可访问</li>
            <li><code>pinme worker deploy</code> - 后端 Worker → {`{name}.pinme.pro`}</li>
            <li><code>pinme db migrate</code> - SQL 迁移文件 → D1 数据库</li>
          </ul>

          <h3>技术栈</h3>
          <ul>
            <li>前端: React + TypeScript + Vite</li>
            <li>后端: Cloudflare Workers</li>
            <li>数据库: Cloudflare D1 (SQLite)</li>
            <li>部署: Pinme (IPFS + Workers)</li>
          </ul>

          <div className="links">
            <a href="https://pinme.eth.limo" target="_blank" rel="noopener noreferrer">
              访问 Pinme →
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
