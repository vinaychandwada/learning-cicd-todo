import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthForm from './components/AuthForm';
import Layout from './components/Layout';
import TodoList from './components/TodoList';
import ProfileForm from './components/ProfileForm';
import type { AuthResponse, User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored) as User);
    setReady(true);
  }, []);

  function handleAuthSuccess({ token, user }: AuthResponse) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  if (!ready) return null;

  if (!user) {
    return (
      <div className="container">
        <AuthForm onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={user} onLogout={handleLogout} />}>
          <Route index element={<TodoList />} />
          <Route path="profile" element={<ProfileForm />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
