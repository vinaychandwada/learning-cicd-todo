import { NavLink, Outlet } from 'react-router-dom';
import type { User } from '../types';

interface LayoutProps {
  user: User;
  onLogout: () => void;
}

export default function Layout({ user, onLogout }: LayoutProps) {
  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Hi, {user.name}</h1>
        <button className="secondary" onClick={onLogout}>Logout</button>
      </div>

      <nav className="row" style={{ gap: 12, marginBottom: 16 }}>
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? 'link active-link' : 'link')}
        >
          Todos
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) => (isActive ? 'link active-link' : 'link')}
        >
          Profile
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
