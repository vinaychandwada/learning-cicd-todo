import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import api from '../api';
import type { ApiErrorBody, Todo } from '../types';

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    loadTodos();
  }, []);

  function readError(err: unknown, fallback: string) {
    const axiosErr = err as AxiosError<ApiErrorBody>;
    return axiosErr.response?.data?.message || fallback;
  }

  async function loadTodos() {
    setLoading(true);
    try {
      const { data } = await api.get<Todo[]>('/todos');
      setTodos(data);
    } catch (err) {
      setError(readError(err, 'Failed to load todos'));
    } finally {
      setLoading(false);
    }
  }

  async function addTodo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const { data } = await api.post<Todo>('/todos', { title });
      setTodos((prev) => [data, ...prev]);
      setTitle('');
    } catch (err) {
      setError(readError(err, 'Failed to add todo'));
    }
  }

  function startEditing(todo: Todo) {
    setEditingId(todo._id);
    setEditingTitle(todo.title);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingTitle('');
  }

  async function saveEditing(todo: Todo) {
    const next = editingTitle.trim();
    if (!next || next === todo.title) {
      cancelEditing();
      return;
    }
    try {
      const { data } = await api.put<Todo>(`/todos/${todo._id}`, { title: next });
      setTodos((prev) => prev.map((t) => (t._id === data._id ? data : t)));
      cancelEditing();
    } catch (err) {
      setError(readError(err, 'Failed to rename todo'));
    }
  }

  async function deleteTodo(todo: Todo) {
    try {
      await api.delete(`/todos/${todo._id}`);
      setTodos((prev) => prev.filter((t) => t._id !== todo._id));
    } catch (err) {
      setError(readError(err, 'Failed to delete todo'));
    }
  }

  return (
    <>
      <h2>My Todos</h2>
      <form onSubmit={addTodo}>
        <div className="row">
          <input
            type="text"
            placeholder="What do you need to do?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit">Add</button>
        </div>
      </form>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : todos.length === 0 ? (
          <p className="muted">No todos yet. Add your first one above.</p>
        ) : (
          todos.map((todo) => {
            const isEditing = editingId === todo._id;
            return (
              <div key={todo._id} className="todo">
                {isEditing ? (
                  <input
                    type="text"
                    className="title"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditing(todo);
                      if (e.key === 'Escape') cancelEditing();
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="title">{todo.title}</span>
                )}
                {isEditing ? (
                  <>
                    <button onClick={() => saveEditing(todo)}>Save</button>
                    <button className="secondary" onClick={cancelEditing}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="secondary" onClick={() => startEditing(todo)}>
                      Edit
                    </button>
                    <button className="danger" onClick={() => deleteTodo(todo)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
