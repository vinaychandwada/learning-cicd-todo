# Learning Project — React + Node + MongoDB + JWT + File Upload (TypeScript)

A single-document walkthrough of how this project is built and why each piece exists. Both the backend (Node + Express) and the frontend (React + Vite) are written in **TypeScript**. Read top to bottom — the order matches how a request flows through the system.

---

## 1. The big picture

```
┌──────────────────────┐       HTTP + JWT        ┌────────────────────────┐
│  React + TS (Vite)   │ ─────────────────────▶  │  Node + Express + TS   │
│  port 5173           │                         │  port 5050             │
│  ─ AuthForm.tsx      │ ◀─────────────────────  │  /api/auth             │
│  ─ TodoList.tsx      │     JSON / files        │  /api/todos            │
│  ─ ProfileForm.tsx   │                         │  /api/profile          │
│  ─ Routing (RR v6)   │                         │  /uploads (static)     │
└──────────────────────┘                         └─────────────┬──────────┘
                                                               │ Mongoose
                                                               ▼
                                                  ┌────────────────────────┐
                                                  │  MongoDB               │
                                                  │  users, todos,         │
                                                  │  profiles              │
                                                  └────────────────────────┘
                                                  ┌────────────────────────┐
                                                  │  Disk: node/uploads/   │
                                                  │  profile images        │
                                                  └────────────────────────┘
```

- **React** renders the UI, handles in-app routing with `react-router-dom`, and stores the JWT in `localStorage`.
- Every request to a protected endpoint sends the JWT in the `Authorization` header.
- **Express** verifies the token, extracts the user id, and serves only that user's data from MongoDB.
- Profile pictures are uploaded via `multipart/form-data` and stored on disk under `node/uploads/`. The DB stores only the URL path.
- **TypeScript** runs end-to-end: shared shapes (`User`, `Todo`, `Profile`) are typed on both sides so a wrong field name fails the build instead of silently breaking at runtime.

---

## 2. Folder layout

```
reactjs+nodejs/
├── EXPLANATION.md          ← you are here
├── node/                   ← backend (TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── server.ts
│   ├── types/
│   │   └── express.d.ts    ← augments Express.Request with userId
│   ├── middleware/
│   │   └── auth.ts
│   ├── models/
│   │   ├── User.ts
│   │   ├── Todo.ts
│   │   └── Profile.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── todos.ts
│   │   └── profile.ts
│   └── uploads/            ← profile images land here at runtime
└── react/                  ← frontend (TypeScript + Vite)
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx         ← routing lives here
        ├── api.ts
        ├── types.ts        ← shared frontend types
        ├── vite-env.d.ts   ← types for import.meta.env
        ├── styles.css
        └── components/
            ├── AuthForm.tsx
            ├── Layout.tsx
            ├── TodoList.tsx
            └── ProfileForm.tsx
```

---

## 3. Running the project

### 3a. Prerequisites
- **Node.js 18+**
- **MongoDB** running locally on `mongodb://127.0.0.1:27017` (or use a free MongoDB Atlas cluster and paste the URI into `.env`).

### 3b. Backend
```bash
cd node
cp .env.example .env       # then edit JWT_SECRET to anything long & random
npm install
npm run dev                # tsx watch — runs TypeScript directly with hot reload
# → Server listening on http://localhost:5050
```

Other useful scripts:
```bash
npm run typecheck   # tsc --noEmit, fail-fast type errors
npm run build       # tsc → emits compiled JS to dist/
npm start           # runs the compiled JS in dist/
```

### 3c. Frontend (in a second terminal)
```bash
cd react
npm install
npm run dev
# → http://localhost:5173
```

Other useful scripts:
```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc -b && vite build (typecheck first, then bundle)
npm run preview     # serve dist/ locally on 4173 to sanity-check the build
```

Open the URL, register a user, log in, then play with the **Todos** and **Profile** pages.

---

## 4. Why TypeScript here?

JavaScript would also work — but for a learning project that talks JSON between two services, TypeScript pays off quickly:

- **One source of truth for shapes.** A `Todo` is defined once on each side (`ITodo` on the backend, `Todo` on the frontend). If you rename `title` → `text` on the model, the build fails wherever it's used.
- **Catch bad calls early.** `api.post('/todos', { title })` is type-checked because `api.post<Todo>('/todos', body)` is generic. You can't accidentally read `data.titel` — the compiler complains.
- **Better refactors.** Renaming a field, removing a function, changing a return type — TS shows you every callsite that needs updating.
- **It's optional.** TS is just JS with annotations stripped at build time. Runtime behavior is identical.

The cost: a few extra lines for type definitions and a `tsconfig.json`. Worth it once your project has more than ~3 files.

---

## 5. The Node.js backend, file by file

### 5a. `tsconfig.json` — compiler config
- `target: ES2022` + `module: commonjs` → modern JS features compiled to CommonJS, which Node loads natively.
- `strict: true` enables all strict-mode checks (no implicit `any`, null-safety, etc.).
- `outDir: dist` and `rootDir: .` → `npm run build` writes compiled JS to `dist/`.
- `esModuleInterop: true` lets us `import express from 'express'` even though Express is CommonJS.

### 5b. `types/express.d.ts` — module augmentation
Express types don't know about our custom `req.userId`. We extend the `Express.Request` interface globally:

```ts
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
export {};
```

Now `req.userId` is typed everywhere automatically. No casts needed.

### 5c. `server.ts` — the entry point
- Uses `import 'dotenv/config'` (ESM-style import that runs `dotenv.config()` as a side effect).
- Creates an Express app, enables `cors()` and `express.json()`.
- `app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')))` exposes the `uploads/` folder so the browser can `GET http://localhost:5050/uploads/<file>`. We use `process.cwd()` (the directory you ran `npm` from) instead of `__dirname` so the path is stable in both `tsx watch` (running source) and `node dist/server.js` (running compiled).
- Mounts three routers: `/api/auth`, `/api/todos`, `/api/profile`.
- `MONGO_URI` is checked at boot — if missing, we exit with a clear error rather than connecting to `undefined`.
- Final error handler is typed as `ErrorRequestHandler`, which is how Express tells the four-arg overload `(err, req, res, next)` from a normal middleware.

### 5d. `models/User.ts` — typed Mongoose model
```ts
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  comparePassword(plain: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({...});
```
- `Schema<IUser>` ties the schema to the interface — fields you forgot to declare in `IUser` won't typecheck.
- The `pre('save')` hook hashes the password with bcrypt before the document hits the DB.
- `comparePassword` is declared on the interface *and* attached at runtime via `userSchema.methods`.

### 5e. `models/Todo.ts` and `models/Profile.ts`
Same pattern:
- Interface (`ITodo`, `IProfile`) extends `Document` and lists every field, including `Types.ObjectId` for references and `createdAt`/`updatedAt` from `timestamps: true`.
- `Schema<ITodo>` / `Schema<IProfile>` enforces the contract.
- Profiles have `unique: true` on `user`, so each account can have at most one profile document.

### 5f. `routes/auth.ts` — register & login
Both endpoints end the same way: build a JWT and return it together with a small user object.

```ts
function signToken(userId: string): string {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '1d') as SignOptions['expiresIn'],
  };
  return jwt.sign({ id: userId }, process.env.JWT_SECRET as string, options);
}
```

What's in a JWT? Three base64url segments joined by dots:
1. **Header** — algorithm, e.g. `HS256`.
2. **Payload** — your claims, here `{ id, iat, exp }`.
3. **Signature** — HMAC of header+payload using `JWT_SECRET`.

The signature is what makes the token tamper-proof. The client can read the payload, but it cannot change the user id without invalidating the signature, because it doesn't know the secret.

`POST /api/auth/login` flow:
1. Look up the user by email.
2. `user.comparePassword(plain)` returns `true` only if the bcrypt hash matches.
3. Sign a JWT and send it back. **We never return the password hash.**

Note the typed body parsing pattern: `const { name, email, password } = req.body as { name?: string; ... }`. Express types `req.body` as `any` by default; we narrow it with a cast and then validate at runtime.

### 5g. `middleware/auth.ts` — gate for protected routes
```ts
export default function auth(req: Request, res: Response, next: NextFunction) {
  const token = (req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization!.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload;
    req.userId = payload.id;   // ← typed thanks to types/express.d.ts
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```
- `jwt.verify` throws if the signature is bad or the token expired.
- On success, attaches `req.userId` so downstream handlers know **who** is calling.

### 5h. `routes/todos.ts` — the todo CRUD
The very first line is `router.use(auth);` — every todo route requires a valid token, period.

| Method | Path             | What it does                                    |
|--------|------------------|-------------------------------------------------|
| GET    | `/api/todos`     | List the current user's todos (newest first)   |
| POST   | `/api/todos`     | Create a todo for the current user             |
| PUT    | `/api/todos/:id` | Update title and/or completed flag             |
| DELETE | `/api/todos/:id` | Delete one of the user's todos                 |

Two important security details:
- Every query filters by **both** `_id` and `user: req.userId`. So user A can never read or modify user B's todo, even if they guess the id.
- We never trust the client to set the `user` field on create — we take it from the verified token.

### 5i. `routes/profile.ts` — profile + image upload (multer)
This is where file handling happens.

```ts
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.userId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, GIF or WEBP images are allowed'));
  },
});
```

Notice `Express.Multer.File` — the `@types/multer` package augments the global `Express` namespace so `req.file` is properly typed too.

What this gives us:
- Files are written to `node/uploads/` with the name `<userId>-<timestamp>.<ext>`. Including the user id in the filename means user A literally cannot overwrite user B's file even if multer misbehaves.
- `limits.fileSize` rejects anything bigger than 2 MB **before** it lands on disk.
- `fileFilter` only accepts a small whitelist of image MIME types. (Note: MIME is client-supplied; for production add server-side magic-byte sniffing.)

Endpoints:

| Method | Path             | What it does                                            |
|--------|------------------|---------------------------------------------------------|
| GET    | `/api/profile`   | Return the current user's profile (or `null` if none)   |
| POST   | `/api/profile`   | Create or update — `multipart/form-data`, optional `image` field |

The `POST` handler is wrapped with `upload.single('image')`. Multer:
1. Parses the multipart body.
2. If a field named `image` is present and passes the filter, writes it to disk and exposes it as `req.file`.
3. All non-file fields end up in `req.body` (so `name`, `email`, etc. behave like a normal form).

The handler validates that `name` is non-empty (the only required field) and then upserts the profile:

```ts
const update: Record<string, string> = {
  name: name.trim(), email: ..., phone: ..., address: ..., bio: ...
};
if (req.file) update.imageUrl = `/uploads/${req.file.filename}`;

const profile = await Profile.findOneAndUpdate(
  { user: req.userId },
  { $set: update, $setOnInsert: { user: req.userId } },
  { new: true, upsert: true, setDefaultsOnInsert: true }
);
```

`upsert: true` means "create if missing, update otherwise" in a single round trip. Same endpoint works for both first save and edits.

> **Heads up on a known limitation:** when a user uploads a *new* image, we don't delete the old file from disk. For a learning project that's fine; for production you'd `fs.unlink` the previous `imageUrl` after a successful save.

---

## 6. The React frontend, file by file

### 6a. `tsconfig.json` — frontend compiler config
The Vite default. Highlights:
- `jsx: "react-jsx"` → no need to `import React` in every file.
- `moduleResolution: "bundler"` → resolution rules that match how Vite/esbuild actually load modules.
- `noEmit: true` → TS only typechecks; **Vite/esbuild does the actual compiling**.
- `strict: true` plus `noUnusedLocals` and `noUnusedParameters` → catches dead code immediately.

`tsconfig.node.json` is a tiny sister config used to typecheck `vite.config.ts` (which runs in Node, not the browser).

### 6b. `src/types.ts` — shared shapes
```ts
export interface User { id: string; name: string; email: string; }
export interface AuthResponse { token: string; user: User; }
export interface Todo { _id: string; user: string; title: string; ... }
export interface Profile { _id: string; user: string; name: string; imageUrl: string; ... }
```
A central place for the JSON shapes the API returns. Each component imports these instead of re-declaring them.

### 6c. `src/vite-env.d.ts` — typing `import.meta.env`
Vite reads env vars prefixed with `VITE_`. We declare the shape:
```ts
interface ImportMetaEnv { readonly VITE_API_URL?: string; }
interface ImportMeta { readonly env: ImportMetaEnv; }
```
Now `import.meta.env.VITE_API_URL` is `string | undefined` instead of `any`.

### 6d. `src/main.tsx` — bootstrap
Renders `<App />` into `#root`. `React.StrictMode` runs effects twice in dev, which surfaces accidental side-effects early. The `as HTMLElement` cast tells TS we're sure the `#root` div exists.

### 6e. `src/api.ts` — typed axios instance
- `baseURL` defaults to `http://localhost:5050/api` (overridable via `VITE_API_URL`).
- Request interceptor reads the token from `localStorage` and adds `Authorization: Bearer …`. We use `config.headers.set(...)` because in axios v1 `headers` is an `AxiosHeaders` object, not a plain object.
- Response interceptor clears the stored token on `401`, so an expired session is cleaned up automatically.

When components call the API they pass the expected response type:
```ts
const { data } = await api.get<Todo[]>('/todos');
const { data } = await api.post<AuthResponse>('/auth/login', payload);
```
That's how `data` ends up properly typed downstream.

### 6f. `src/App.tsx` — auth gate + routing
- `useState<User | null>(null)` — explicit initial type so consumers see `User | null`, not `null` only.
- Reads `user` from `localStorage` on first render. While that's happening, renders `null` (so we don't flash the login screen on a refresh).
- **Not logged in** → renders `<AuthForm />` (no router needed).
- **Logged in** → wraps the app in `<BrowserRouter>` and defines the routes:

```tsx
<Routes>
  <Route element={<Layout user={user} onLogout={handleLogout} />}>
    <Route index element={<TodoList />} />
    <Route path="profile" element={<ProfileForm />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>
</Routes>
```

Because `<Layout>` is the parent route, every page renders the nav + logout, and the actual page goes into `<Outlet />`.

### 6g. `src/components/Layout.tsx` — shell with nav + logout
Props are typed:
```ts
interface LayoutProps { user: User; onLogout: () => void; }
```
- `NavLink` from react-router renders an anchor and tells you when its route is active via the `isActive` callback. We use that to highlight the current tab.
- `Outlet` is the slot where the matched child route is rendered.

### 6h. `src/components/AuthForm.tsx` — login & register in one form
Things worth pointing at for TS:
- `Mode = 'login' | 'register'` — a string literal union, narrower and safer than just `string`.
- `update<K extends keyof FormState>(field: K)` — a generic helper that returns a typed change handler. The compiler verifies that `field` is actually a key of `FormState`, so you can't typo `'naem'`.
- Errors from axios are narrowed: `const axiosErr = err as AxiosError<ApiErrorBody>;` lets us read `.response.data.message` safely.

### 6i. `src/components/TodoList.tsx` — CRUD with inline edit
The CRUD actions map 1:1 to the backend, all generically typed:

```ts
api.get<Todo[]>('/todos')
api.post<Todo>('/todos', { title })
api.put<Todo>(`/todos/${id}`, { title: next })
api.delete(`/todos/${id}`)
```

Inline edit pattern (no `prompt` dialog):
- Two pieces of state: `editingId: string | null` and `editingTitle: string`.
- Clicking **Edit** sets both → the row swaps the `<span>` for an `<input>` with `autoFocus`.
- **Enter** = save, **Escape** = cancel; the input is its own keyboard mini-state-machine.
- After save, the API response replaces the row in state and `editingId` is reset to `null`.

A few React patterns worth pointing out:
- `useEffect(() => { loadTodos(); }, [])` runs once on mount.
- After a successful create/update/delete we update local state directly instead of refetching the whole list. This keeps the UI snappy and avoids a round trip.
- State updates use the **functional form** (`setTodos((prev) => …)`) so they remain correct even if React batches multiple updates.

### 6j. `src/components/ProfileForm.tsx` — Profile page with image upload
Three things going on at once:

**1. Load existing profile on mount**
```ts
const { data } = await api.get<Profile | null>('/profile');
```
On first render the form is empty; once the GET returns we hydrate it.

**2. Validation: only `name` is required**
```tsx
<input type="text" value={form.name} onChange={update('name')} required />
```
The HTML `required` attribute gives an instant browser-level check, and we also guard in `handleSubmit`:
```ts
if (!form.name.trim()) { setError('Name is required'); return; }
```
The backend repeats the check (never trust the client). All other fields go through with an empty string when blank.

**3. Image upload — preview before save, then `multipart/form-data`**

When the user picks a file:
```ts
function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0] || null;
  if (!file) { setImageFile(null); setImagePreview(''); return; }
  setImageFile(file);
  setImagePreview(URL.createObjectURL(file));
}
```
`URL.createObjectURL(file)` gives you a `blob:` URL pointing at the in-memory file. The `<img src="…">` displays it without ever hitting the network — instant preview.

When the form is submitted:
```ts
const data = new FormData();
data.append('name', form.name);
// … other text fields
if (imageFile) data.append('image', imageFile);

const res = await api.post<Profile>('/profile', data, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
```
- `FormData` is the browser API for building a multipart body. Each `append` adds one part.
- The field name `'image'` must match `upload.single('image')` on the backend.
- Plain text fields go through unchanged; the file field is sent with its filename and content type.

When the response comes back, we read `res.data.imageUrl` and render it from the API origin:
```ts
const previewSrc = imagePreview || (savedImageUrl ? `${API_ORIGIN}${savedImageUrl}` : '');
```
- During the session: we keep showing the local blob preview.
- After save / on next load: we show the server-hosted image at `http://localhost:5050/uploads/...`.

---

## 7. How an image actually flows through the system

End-to-end for a profile picture:

```
[browser]
  user picks file in <input type="file">
       │
       ▼
  React stores File object in state, makes blob: URL for live preview
       │
       │  user clicks "Save profile"
       ▼
  React builds FormData { name, email, …, image: <File> }
       │
       │  axios POST /api/profile  with multipart body + JWT header
       ▼
[network — multipart/form-data]
       │
       ▼
[express]
  cors + auth middleware run → req.userId set
       │
       ▼
  multer parses the multipart body:
    - text fields → req.body
    - file part   → written to node/uploads/<userId>-<ts>.<ext>, exposed as req.file
       │
       ▼
  handler validates name, computes /uploads/<filename>, upserts Profile in MongoDB
       │
       ▼
  res.json(profile)   ← contains imageUrl: "/uploads/…"
       │
       ▼
[react]
  reads imageUrl, renders <img src="http://localhost:5050/uploads/…" />
       │
       ▼
[browser]
  separate GET /uploads/<file> → served by express.static from node/uploads/
```

Why store the **file on disk** and just the **path in Mongo**, instead of stuffing the bytes into a Mongo `Buffer`?
- Documents in MongoDB are limited to 16 MB. Even small image sets bloat documents and queries.
- Static files served from disk are extremely cheap and cache-friendly.
- Easy to swap the storage backend later (S3, Cloudinary, etc.) — only `imageUrl` and the upload step change.

---

## 8. End-to-end: a single todo request, traced

Imagine the user types "buy milk" and clicks **Add**:

1. `TodoList.addTodo` calls `api.post<Todo>('/todos', { title: 'buy milk' })`.
2. The axios **request interceptor** attaches `Authorization: Bearer eyJhbGc…`.
3. Network → Express on port 5050 (the backend port).
4. `cors()` allows the cross-origin call. `express.json()` parses the body.
5. The router matches `POST /api/todos`, runs `auth` middleware first.
6. `auth` decodes the JWT, finds `id`, sets `req.userId`, calls `next()`.
7. The handler runs `Todo.create({ user: req.userId, title: 'buy milk' })`.
8. Mongoose generates an `_id`, writes to MongoDB, returns the saved document.
9. Express responds `201 Created` with JSON.
10. axios resolves; the response is typed as `Todo`; React prepends it to state; the component re-renders and the new row appears.

If step 6 had failed (token expired, say), the middleware would have returned `401`. The response interceptor would clear `localStorage` and the next render of `<App />` would see `user === null`, automatically switching back to the login form.

---

## 9. Common pitfalls & how this project avoids them

| Pitfall                                                | What we did                                                            |
|--------------------------------------------------------|------------------------------------------------------------------------|
| Storing plain-text passwords                           | bcrypt hash in a `pre('save')` hook                                    |
| Returning the password hash to the client              | We hand-pick `{ id, name, email }` in responses                        |
| Trusting client-provided user ids                      | `req.userId` comes only from a verified JWT                            |
| User A reading user B's data                           | Every Mongo query filters by `user: req.userId`                        |
| User A overwriting user B's image file                 | Filenames are namespaced as `<userId>-<timestamp>.<ext>`              |
| Unlimited upload size                                  | `multer.limits.fileSize = 2 MB`                                        |
| Uploading non-images                                   | `multer.fileFilter` whitelists JPEG/PNG/GIF/WEBP                       |
| Hard-coding the JWT secret                             | Loaded from `.env`; `.env` is gitignored                               |
| CORS blocking the React dev server                     | `app.use(cors())` enabled in Express                                   |
| Forgetting auth on a new route                         | `router.use(auth)` at the top of each protected router                 |
| Stale UI after create/update                           | Local state is updated from the API response (no full refetch)         |
| Browser flashing the login screen on refresh           | `App.tsx` keeps a `ready` flag; renders `null` until localStorage read |
| Drifting types between client and server               | Shared shapes in `models/*.ts` (server) and `src/types.ts` (client)    |
| Untyped `req.userId`                                   | `types/express.d.ts` augments `Express.Request`                        |
| Missing env var crashing at runtime                    | `MONGO_URI` is checked at boot; we exit fast with a clear message      |

---

## 10. Suggested next steps once this works

1. **Validation** — add `zod` or `express-validator` for stricter input checks; with zod you can also infer TS types from the schema.
2. **Delete old image on replace** — `fs.unlink(prevPath)` after a successful upsert.
3. **Refresh tokens** — short-lived access JWT + long-lived refresh token in an httpOnly cookie.
4. **Switch storage** — move the token from `localStorage` to an httpOnly cookie to mitigate XSS token theft.
5. **Cloud storage for images** — swap multer's disk storage for S3 / Cloudinary; keep the same `imageUrl` field.
6. **Pagination & search** — add `?page=`, `?q=` query params on `GET /api/todos`.
7. **Tests** — `vitest` + `supertest` on the backend, `vitest` + React Testing Library on the frontend.
8. **Shared types package** — extract the shared shapes (`Todo`, `Profile`, `User`) into a tiny package both client and server import, eliminating the last bit of duplication.
9. **Deploy** — backend on Render/Railway, frontend on Vercel/Netlify, MongoDB on Atlas, images on S3.

Happy hacking.
