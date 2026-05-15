import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import api from '../api';
import type { ApiErrorBody, AuthResponse } from '../types';

type Mode = 'login' | 'register';

interface AuthFormProps {
  onSuccess: (data: AuthResponse) => void;
}

interface FormState {
  name: string;
  email: string;
  password: string;
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';

  function update<K extends keyof FormState>(field: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: form.email, password: form.password }
        : form;
      const { data } = await api.post<AuthResponse>(url, payload);
      onSuccess(data);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiErrorBody>;
      setError(axiosErr.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>{isLogin ? 'Login' : 'Create account'}</h1>
      <form onSubmit={handleSubmit}>
        {!isLogin && (
          <input
            type="text"
            placeholder="Name"
            value={form.name}
            onChange={update('name')}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={update('email')}
          required
        />
        <input
          type="password"
          placeholder="Password (min 6 chars)"
          value={form.password}
          onChange={update('password')}
          minLength={6}
          required
        />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? 'Please wait…' : isLogin ? 'Login' : 'Register'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 12 }}>
        {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(isLogin ? 'register' : 'login');
            setError('');
          }}
        >
          {isLogin ? 'Register' : 'Login'}
        </button>
      </p>
    </>
  );
}
