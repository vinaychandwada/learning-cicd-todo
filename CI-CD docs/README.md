# Todo App — CI/CD Pipeline (Node.js + React.js)

A learning project demonstrating a **complete CI/CD pipeline** for a full-stack
TypeScript application — Node.js (Express + MongoDB) backend and React.js (Vite)
frontend — deployed to a local machine using **GitHub Actions** + a
**self-hosted runner** + **PM2**.

> **Audience:** anyone learning CI/CD. This repository is designed so that a
> reader can replicate the entire setup end-to-end on their own machine.

---

## What this pipeline does

Every `git push` to the `main` branch automatically:

1. Runs on GitHub's cloud (Ubuntu VM):
   - Installs dependencies for both apps
   - Type-checks the TypeScript code
   - Builds both apps
2. If the cloud build passes, hands off to the **self-hosted runner**
   (this machine), which:
   - Pulls the latest code
   - Writes the production `.env` file from GitHub Secrets
   - Rebuilds both apps in place
   - Reloads them under **PM2** (zero-downtime restart)

If the build fails in step 1, step 2 never runs — so broken code never deploys.

---

## Architecture

```
                          GitHub                         Local machine
                       ┌─────────────┐                ┌──────────────────┐
   git push  ─────►   │ main branch │ ─── webhook ──►│ self-hosted      │
                      │             │                 │ runner (systemd) │
                      │   workflow  │                 └────────┬─────────┘
                      │   ci-cd.yml │                          │
                      └─────┬───────┘                          ▼
                            │                          ┌──────────────────┐
                            ├── Job 1 ─► GitHub cloud: │ build + typecheck│
                            │            ubuntu-latest │     (free VM)    │
                            │                          └────────┬─────────┘
                            │                                   │ ✅
                            └── Job 2 ─► Self-hosted (here):    │
                                         bash deploy/deploy.sh  │
                                                │               │
                                                ▼               │
                                         ┌──────────────┐       │
                                         │ PM2          │       │
                                         │  ├ backend   │ ◄── MongoDB
                                         │  └ frontend  │     (systemd)
                                         └──────────────┘
                                                │
                                          http://localhost:5050  (API)
                                          http://localhost:5173  (UI)
```

Both apps auto-restart on crash and come back automatically after a reboot.

---

## Tech stack

| Layer | Tool | Reason |
|---|---|---|
| Backend | Node.js + Express + TypeScript | The application |
| Database | MongoDB (local) | Persistence |
| Auth | JSON Web Tokens (JWT) | Stateless sessions |
| Frontend | React 18 + Vite + TypeScript | The UI |
| HTTP client | Axios | Frontend → backend calls |
| Process manager | **PM2** | Keeps Node apps alive, auto-restarts, survives reboots |
| Static server | `serve` | Serves the React production build |
| Pipeline | **GitHub Actions** | Free CI/CD, integrated with the repo |
| Self-hosted runner | GitHub Actions runner | Lets the pipeline run commands on this machine |
| Service manager | systemd | Auto-starts Mongo, the runner, and PM2 on boot |

---

## Repository layout

```
.
├── .github/
│   └── workflows/
│       └── ci-cd.yml              # The pipeline definition
├── deploy/
│   ├── ecosystem.config.cjs       # PM2 process recipe for both apps
│   └── deploy.sh                  # Runs on every deploy (build + reload)
├── docs/
│   ├── SETUP.md                   # Full step-by-step setup guide
│   ├── TROUBLESHOOTING.md         # Common errors and fixes
│   └── DEPLOY_TO_REAL_SERVER.md   # Moving from localhost to a cloud server
├── node/                          # Express backend (TypeScript)
├── react/                         # React frontend (TypeScript + Vite)
├── .gitignore
└── README.md                      # You are here
```

---

## Quick start (TL;DR)

If you already understand the pieces, the setup is:

1. Install **Node.js 18+**, **MongoDB**, **PM2**, **`serve`** globally
2. Push your code to a GitHub repo
3. Add 4 GitHub Secrets: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `BACKEND_PORT`
4. Install a **self-hosted runner** from
   *Repo → Settings → Actions → Runners → New self-hosted runner*
5. Install it as a service: `cd ~/actions-runner && sudo ./svc.sh install && sudo ./svc.sh start`
6. Commit and push — pipeline runs
7. Run `pm2 startup` and follow its instructions to make apps survive reboots

If any of that doesn't make sense, **read [docs/SETUP.md](docs/SETUP.md)** — it
explains every step from zero with the reasoning behind each choice.

---

## Documents in this repo

| File | When to read |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Setting up the pipeline from scratch (the full presentation document) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Something is broken and you need to know why |
| [docs/DEPLOY_TO_REAL_SERVER.md](docs/DEPLOY_TO_REAL_SERVER.md) | Moving this same setup from localhost to a cloud VM |

---

## License

Learning project — use freely.
