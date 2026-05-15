import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import api from '../api';
import type { ApiErrorBody, Profile } from '../types';

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5050/api').replace(/\/api$/, '');

interface FormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  bio: string;
}

const EMPTY: FormState = { name: '', email: '', phone: '', address: '', bio: '' };

export default function ProfileForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [savedImageUrl, setSavedImageUrl] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<Profile | null>('/profile');
        if (data) {
          setForm({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            address: data.address || '',
            bio: data.bio || '',
          });
          setSavedImageUrl(data.imageUrl || '');
        }
      } catch (err) {
        const axiosErr = err as AxiosError<ApiErrorBody>;
        setError(axiosErr.response?.data?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function update<K extends keyof FormState>(field: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setImageFile(null);
      setImagePreview('');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearSelectedImage() {
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    try {
      const data = new FormData();
      data.append('name', form.name);
      data.append('email', form.email);
      data.append('phone', form.phone);
      data.append('address', form.address);
      data.append('bio', form.bio);
      if (imageFile) data.append('image', imageFile);

      const res = await api.post<Profile>('/profile', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSavedImageUrl(res.data.imageUrl || '');
      clearSelectedImage();
      setInfo('Profile saved');
    } catch (err) {
      const axiosErr = err as AxiosError<ApiErrorBody>;
      setError(axiosErr.response?.data?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  const previewSrc =
    imagePreview || (savedImageUrl ? `${API_ORIGIN}${savedImageUrl}` : '');

  return (
    <>
      <h2>My Profile</h2>
      <form onSubmit={handleSubmit}>
        <label className="muted">Name *</label>
        <input
          type="text"
          placeholder="Your name (required)"
          value={form.name}
          onChange={update('name')}
          required
        />

        <label className="muted">Email</label>
        <input
          type="email"
          placeholder="Optional"
          value={form.email}
          onChange={update('email')}
        />

        <label className="muted">Phone</label>
        <input
          type="text"
          placeholder="Optional"
          value={form.phone}
          onChange={update('phone')}
        />

        <label className="muted">Address</label>
        <input
          type="text"
          placeholder="Optional"
          value={form.address}
          onChange={update('address')}
        />

        <label className="muted">Bio</label>
        <textarea
          rows={3}
          placeholder="Optional"
          value={form.bio}
          onChange={update('bio')}
        />

        <label className="muted">Profile picture (optional, max 2 MB)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
        />

        {previewSrc && (
          <div style={{ marginTop: 8 }}>
            <img src={previewSrc} alt="Profile preview" className="avatar" />
            {imagePreview && (
              <button
                type="button"
                className="secondary"
                onClick={clearSelectedImage}
                style={{ marginLeft: 8 }}
              >
                Remove selected
              </button>
            )}
          </div>
        )}

        {error && <div className="error">{error}</div>}
        {info && <div className="muted">{info}</div>}

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </>
  );
}
