import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: '首页' },
  { path: '/home', label: '消息' },
  { path: '/demo', label: 'Demo' },
  { path: '/about', label: '关于' },
];

export default function Header() {
  const location = useLocation();

  return (
    <header className="page-header">
      <h1>Pinme App</h1>
      <nav>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={location.pathname === item.path ? 'active' : ''}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
