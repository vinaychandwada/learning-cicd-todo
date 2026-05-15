# Complete CI/CD Setup Guide

> A step-by-step walkthrough for building a CI/CD pipeline that auto-deploys a
> Node.js + React.js application from GitHub to a local machine on every push.
>
> Tested on **Ubuntu 22.04**. Should work on any modern Linux. macOS instructions
> noted where they differ.

---

## Table of contents

- [Part 1 — Concepts](#part-1--concepts)
  - [What is CI/CD?](#what-is-cicd)
  - [The big picture of what we're building](#the-big-picture-of-what-were-building)
  - [Why each tool was chosen](#why-each-tool-was-chosen)
- [Part 2 — Prerequisites](#part-2--prerequisites)
- [Part 3 — Setup steps](#part-3--setup-steps)
  - [Step 1: Verify your tools are installed](#step-1--verify-your-tools-are-installed)
  - [Step 2: Configure your Git identity](#step-2--configure-your-git-identity)
  - [Step 3: Create a root `.gitignore`](#step-3--create-a-root-gitignore)
  - [Step 4: Initialise the Git repository](#step-4--initialise-the-git-repository)
  - [Step 5: Create the GitHub repo and push](#step-5--create-the-github-repo-and-push)
  - [Step 6: Confirm MongoDB is running](#step-6--confirm-mongodb-is-running)
  - [Step 7: Install PM2 globally](#step-7--install-pm2-globally)
  - [Step 8: Install a self-hosted GitHub Actions runner](#step-8--install-a-self-hosted-github-actions-runner)
  - [Step 9: Add GitHub Secrets](#step-9--add-github-secrets)
  - [Step 10: Create the PM2 ecosystem config](#step-10--create-the-pm2-ecosystem-config)
  - [Step 11: Create the deploy script](#step-11--create-the-deploy-script)
  - [Step 12: Create the GitHub Actions workflow](#step-12--create-the-github-actions-workflow)
  - [Step 13: Push and watch the first pipeline run](#step-13--push-and-watch-the-first-pipeline-run)
  - [Step 14: Verify the deployed apps](#step-14--verify-the-deployed-apps)
  - [Step 15: Make PM2 survive reboots](#step-15--make-pm2-survive-reboots)
- [Part 4 — Verifying the whole loop](#part-4--verifying-the-whole-loop)
- [Part 5 — PM2 cheat sheet](#part-5--pm2-cheat-sheet)
- [Part 6 — Useful Git commands recap](#part-6--useful-git-commands-recap)

---

## Part 1 — Concepts

### What is CI/CD?

CI/CD is two ideas glued together:

- **CI (Continuous Integration)** — every time someone pushes code, an automated
  system fetches the change, installs dependencies, type-checks, runs tests, and
  builds the project. This catches breakages early instead of letting them pile
  up. The output is a green ✅ or red ❌ for that commit.
- **CD (Continuous Deployment)** — when CI is green, automatically ship the new
  code to a running environment. No humans logging into servers and running
  commands by hand.

Together they turn `git push` into "live in production within minutes," with
guard-rails so broken code never deploys.

### The big picture of what we're building

```
┌─────────────────┐    git push     ┌──────────────────┐
│  Your editor    │ ───────────────►│      GitHub      │
└─────────────────┘                 └──────────┬───────┘
                                               │
                            triggers ci-cd.yml │
                                               │
                  ┌────────────────────────────┴──────────────────────┐
                  │                                                   │
                  ▼                                                   ▼
       Job 1: build-test                              Job 2: deploy
   (runs on a GitHub VM)                         (runs on YOUR machine)
                  │                                                   │
                  │   ┌─── if Job 1 fails, Job 2 never runs ────┐    │
                  ▼   ▼                                          ▼    │
       npm ci + typecheck + build                      bash deploy/deploy.sh
       for backend AND frontend                                  │
                                                                 ▼
                                                       PM2 reload both apps
                                                                 │
                                                                 ▼
                                                http://localhost:5050  (API)
                                                http://localhost:5173  (UI)
```

### Why each tool was chosen

| Choice | Why over the alternative |
|---|---|
| **GitHub Actions** (vs Jenkins / GitLab CI / CircleCI) | Built into GitHub; free for public repos; YAML-defined workflows live next to the code; huge marketplace of pre-built actions |
| **Self-hosted runner** (vs SSH-from-cloud / Docker registry pull) | The "server" *is* the local machine, so the simplest path is to let GitHub send jobs *to* it; no inbound SSH/firewall changes needed |
| **PM2** (vs systemd-per-app / Docker / `forever`) | Beginner-friendly; one config file describes all apps; auto-restart on crash + boot; great log handling out of the box |
| **MongoDB local** (vs MongoDB Atlas) | Faster for development, no internet needed. Easy to swap for Atlas later by changing one env var |
| **`serve` for the React build** (vs nginx / vite preview) | Tiny, single-purpose static server; perfect for SPA fallback; one-line install |
| **GitHub Secrets** (vs committing `.env` / SSH-ing config files) | Encrypted in GitHub, masked in logs, portable to any future server |

---

## Part 2 — Prerequisites

You will need:

| Tool | Minimum | Install (Ubuntu) | Verify |
|---|---|---|---|
| **Node.js** | 18+ (LTS) | `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -` then `sudo apt install nodejs` | `node --version` |
| **npm** | 9+ | Bundled with Node.js | `npm --version` |
| **Git** | 2.30+ | `sudo apt install git` | `git --version` |
| **MongoDB Community** | 6.0+ | [MongoDB install docs](https://www.mongodb.com/docs/manual/installation/) | `mongod --version` |
| **A GitHub account** | — | https://github.com/signup | sign in |
| **A code editor** | — | VS Code, Vim, nano, anything | — |

> **macOS users:** install Node/npm via [nvm](https://github.com/nvm-sh/nvm),
> Git via `xcode-select --install`, MongoDB via Homebrew. Use `brew services start mongodb-community`
> in place of `systemctl` commands.

---

## Part 3 — Setup steps

This section is structured so you can replicate it command-by-command.

> **Convention:** lines you should type appear in `code blocks`. Output you should
> *expect* is shown below them in plain text.

---

### Step 1 — Verify your tools are installed

#### Why this step exists

Before automating anything, every tool the pipeline depends on must work
manually. A pipeline is just `git`, `npm`, and shell commands run in a sequence —
if any of them fails on your machine, the pipeline will fail too.

#### Commands

```bash
node --version
npm --version
git --version
mongod --version
```

#### Expected

Each command prints a version number. If any says `command not found`, install
that tool before continuing (see [Prerequisites](#part-2--prerequisites)).

---

### Step 2 — Configure your Git identity

#### Why this step exists

Every Git commit records the author's name and email. Without these, `git commit`
will refuse to run. GitHub also uses the email to attribute commits to your
profile (avatar + green contribution squares).

#### Commands

Replace the values with your real name and the email registered on your GitHub
account.

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

#### Verify

```bash
git config --global user.name
git config --global user.email
```

Both should print exactly what you set.

> **What `--global` means:** writes the setting to `~/.gitconfig`, which applies
> to every Git repository on this machine. Without `--global`, the setting would
> apply only to the current repo's `.git/config`.

---

### Step 3 — Create a root `.gitignore`

#### Why this step exists

A `.gitignore` file tells Git: *"don't track these files."* This is critical for
two reasons:

1. **Secrets must never be committed.** A `.env` file in Git history is a
   permanent leak — even if you delete it later, it's in the commit history
   forever.
2. **`node_modules/` is huge** (hundreds of MB) and is regenerated by
   `npm install`. Committing it bloats the repo and slows every clone.

The repo already has `.gitignore` files inside `node/` and `react/`. We add one
more at the root as a project-wide safety net.

#### Commands

```bash
cd /path/to/your/project
nano .gitignore
```

Paste:

```gitignore
# Node / build outputs
node_modules/
dist/
*.tsbuildinfo

# Environment files (NEVER commit secrets)
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*

# OS / editor junk
.DS_Store
Thumbs.db
.vscode/
.idea/

# PM2 runtime files
.pm2/

# GitHub Actions self-hosted runner
actions-runner/

# Local-only editor / AI tool files
.claude/
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

#### Verify

```bash
cat .gitignore
```

---

### Step 4 — Initialise the Git repository

#### Why this step exists

`git init` turns a plain folder into a Git repository by creating a hidden
`.git/` directory. Without this, Git can't track changes.

#### Commands

```bash
cd /path/to/your/project
git init -b main
```

> **`-b main`** sets the default branch name to `main` (modern standard) instead
> of `master`. On older Git versions this flag is silently ignored — if so,
> rename afterwards: `git branch -m master main`.

Stage and commit:

```bash
git add .
git status      # confirm: no .env, no node_modules, no dist/
git commit -m "Initial commit: Node.js + React.js todo app"
```

#### Verify

```bash
git log --oneline
git status
```

You should see one commit, and `git status` should say `On branch main`,
`working tree clean`.

> **Sanity check:** before committing, `git status` should NOT show `.env` or
> `node_modules/` as files to add. If it does, your `.gitignore` isn't being
> read — fix it before continuing.

---

### Step 5 — Create the GitHub repo and push

This step has three sub-parts: **5A** create the empty repo on GitHub.com,
**5B** create a Personal Access Token for authentication, **5C** push.

#### 5A — Create the empty repo

1. Visit **https://github.com** and sign in.
2. Click the **`+`** in the top-right → **New repository**.
3. Fill in:
   - **Repository name**: e.g. `learning-cicd-todo`
   - **Public** or **Private**: either works
   - ⚠️ **Leave all three "Initialize this repository with..." options UNCHECKED**.
     You already have a local `.gitignore` and code; letting GitHub add a README
     or another `.gitignore` would create a merge conflict on the first push.
4. Click **Create repository**.
5. On the next page, copy the HTTPS URL — e.g.
   `https://github.com/yourname/learning-cicd-todo.git`.

#### 5B — Create a Personal Access Token (PAT)

GitHub disabled password authentication for Git over HTTPS in 2021. You need a
token instead.

1. Visit **https://github.com/settings/tokens** → **Generate new token** →
   **Generate new token (classic)**.
2. Fill in:
   - **Note**: e.g. `learning-laptop-push`
   - **Expiration**: 90 days
   - **Scopes**: tick only **`repo`** and **`workflow`**. Smaller scope, smaller
     blast radius if leaked.
3. Click **Generate token**. **Copy the token immediately** — GitHub shows it
   once, you'll never see it again.

> **Treat the PAT like a password.** Don't paste it in chat, don't commit it,
> don't share it. If it leaks, revoke it on the same Settings page.

Optionally, tell Git to cache it so you're not prompted on every push:

```bash
git config --global credential.helper store
# or, less permanent:
git config --global credential.helper 'cache --timeout=3600'
```

#### 5C — Add the remote and push

```bash
git remote add origin https://github.com/yourname/learning-cicd-todo.git
git remote -v          # verify: should print fetch + push URLs
git push -u origin main
```

When prompted:
- **Username:** your GitHub username
- **Password:** paste your **PAT** (not your account password)

> **`-u origin main`** sets the upstream — future pushes can just be `git push`.

After the push, refresh the repo page on GitHub. Your folders (`node/`, `react/`,
`.gitignore`, etc.) should appear. **Confirm `.env` is NOT visible** — only
`.env.example` should be.

---

### Step 6 — Confirm MongoDB is running

#### Why this step exists

The backend connects to MongoDB at startup and exits if it can't. The deploy
pipeline will start the backend — so Mongo must be reachable.

#### Commands

```bash
systemctl status mongod
```

Look at the `Active:` line.

| If it says... | Do this |
|---|---|
| `active (running)` | Nothing — already good |
| `inactive (dead)` or `failed` | Run the two commands below |
| Unit not found | Service might be named `mongodb` — try `systemctl status mongodb`. If that also fails, MongoDB isn't installed. |

```bash
sudo systemctl start mongod
sudo systemctl enable mongod     # ← auto-start on boot
```

#### Verify

```bash
systemctl status mongod
```

You want **`Active: active (running)`** and the `Loaded:` line to include
`enabled` (so it auto-starts on boot).

Optional connectivity test:

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
# Or, if mongosh isn't installed:
ss -tlnp 2>/dev/null | grep 27017
```

---

### Step 7 — Install PM2 globally

#### Why this step exists

**PM2** is a process manager for Node apps. Without it, you'd run
`node server.js` in a terminal and the app would die when the terminal closed.
PM2 keeps apps running in the background, restarts them on crash, and can
auto-start them on boot.

`-g` (global) installs PM2 as a system-wide CLI tool — `pm2` becomes available
from any folder.

#### Commands

```bash
sudo npm install -g pm2
```

#### Verify

```bash
pm2 --version       # prints version number
pm2 list            # prints an empty table
```

---

### Step 8 — Install a self-hosted GitHub Actions runner

> **This is the largest step.** Done in four sub-steps.

#### Why this step exists

A **runner** is a small program installed on a machine that polls GitHub for
jobs. When you push code, GitHub's workflow tells the runner *"check out the
repo and run these commands."* The runner runs them locally.

We need a **self-hosted** runner (not GitHub's cloud-hosted runners) because the
deploy job has to run *on this machine* — that's how the apps get installed
here.

#### 8A — Get the registration token

1. Go to your repo's runner settings:
   `https://github.com/yourname/learning-cicd-todo/settings/actions/runners`
2. Click **New self-hosted runner**.
3. Select **Linux** + **x64**.
4. GitHub displays a **Download** code block and a **Configure** code block.
   The Configure block contains a one-hour registration token. Keep this page
   open.

#### 8B — Download and extract

Run **the Download block** exactly as GitHub displays it, from your home folder
(NOT from inside your project — the runner needs its own folder):

```bash
cd ~
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-VERSION.tar.gz -L https://github.com/actions/runner/releases/download/vVERSION/actions-runner-linux-x64-VERSION.tar.gz
echo "EXPECTED_SHA256_HASH  actions-runner-linux-x64-VERSION.tar.gz" | shasum -a 256 -c
tar xzf ./actions-runner-linux-x64-VERSION.tar.gz
```

> Use the **exact version numbers and hash from GitHub**, not the placeholders
> here.
> **Do not `sudo`** any of these — the runner must be owned by your user.
> The `shasum ... -c` line should print `: OK`.

After extracting:

```bash
ls
```

You should see `config.sh`, `run.sh`, `bin/`, `externals/`, etc.

#### 8C — Configure (register with GitHub)

Run **the Configure block** from GitHub:

```bash
./config.sh --url https://github.com/yourname/learning-cicd-todo --token AAAA...XXX
```

You'll get four prompts. **Press Enter on all of them** to accept the defaults:

| Prompt | Default | Why default is fine |
|---|---|---|
| Runner group name | `Default` | You have one runner — no grouping needed |
| Runner name | machine's hostname | Self-documenting |
| Additional labels | (empty) | We'll target via the built-in `self-hosted` label |
| Work folder | `_work` | Convention |

Success looks like:

```
√ Connected to GitHub
√ Runner successfully added
√ Settings Saved.
```

In your browser, refresh the Runners page — your machine should now appear
(status: **Offline**, because we haven't started it yet).

#### 8D — Install as a system service

The runner ships with a helper script (`svc.sh`) that installs it as a systemd
service. This means:
- Runs in the background (no terminal needed)
- Auto-starts on boot
- Restarts on crash

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

> Even though you use `sudo` to *install* the service, the service runs as your
> user — not root. That's intentional: the runner shouldn't have root.

#### Verify

```bash
sudo ./svc.sh status        # Active: active (running)
```

Then refresh the Runners page in your browser — runner should now show
🟢 **Idle** (connected, waiting for a job).

---

### Step 9 — Add GitHub Secrets

#### Why this step exists

Your backend reads `MONGO_URI`, `JWT_SECRET`, etc. from a `.env` file. We never
commit `.env` to Git (secret-leak risk), so the pipeline needs another way to
inject these values.

**GitHub Secrets** are encrypted key/value pairs stored in repo settings.
Workflows can reference them as environment variables. Once stored, their
values are write-only (you can update or delete but not view), and they're
automatically masked in workflow logs.

#### Action

Go to:
`https://github.com/yourname/learning-cicd-todo/settings/secrets/actions`

Click **New repository secret** four times. Add each of these:

| Name | Value | Purpose |
|---|---|---|
| `MONGO_URI` | `mongodb://127.0.0.1:27017/learning_todo` | Backend's database connection string |
| `JWT_SECRET` | A random 64-character hex string (see below) | Signs JWT login tokens |
| `JWT_EXPIRES_IN` | `1d` | JWT validity duration |
| `BACKEND_PORT` | `5050` | Port the backend listens on |

To generate a strong `JWT_SECRET`:

```bash
openssl rand -hex 32
```

Copy the output and paste it as the secret's value.

> **Never reuse a JWT secret across projects.** If it leaks, an attacker can
> forge logins.

---

### Step 10 — Create the PM2 ecosystem config

#### Why this step exists

PM2 can be told what to run via CLI flags — but for two apps with custom config,
a file is cleaner. The ecosystem file is a manifest: *"run these apps, in these
folders, with these options."*

We put it in `deploy/` to keep all deployment-related files in one folder.

#### Commands

```bash
mkdir deploy
nano deploy/ecosystem.config.cjs
```

Paste:

```javascript
module.exports = {
  apps: [
    {
      name: 'todo-backend',
      cwd: './node',
      script: 'dist/server.js',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'todo-frontend',
      cwd: './react',
      // Absolute path so PM2 doesn't try to resolve via PATH or cwd.
      // On a new server, run `which serve` and update this if needed.
      script: '/usr/bin/serve',
      args: '-s dist -l 5173',
      interpreter: 'none',
      autorestart: true,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

> **Why `.cjs`?** PM2 configs use CommonJS syntax (`module.exports`). If your
> project's `package.json` declares `"type": "module"`, regular `.js` files are
> treated as ES modules and CommonJS breaks. `.cjs` is always CommonJS.

#### Field reference

| Field | Why it's set this way |
|---|---|
| `name` | Label PM2 shows in `pm2 list` and logs |
| `cwd: './node'` | "Change to this folder before running the script." Relative paths are portable across machines. |
| `script: 'dist/server.js'` | Backend entry point after TypeScript build |
| `script: '/usr/bin/serve'` | Absolute path — PM2 treats `script:` as a literal file path, not a PATH lookup |
| `args: '-s dist -l 5173'` | `serve` args: serve from `dist/`, SPA fallback (`-s`), listen on 5173 (`-l`) |
| `interpreter: 'none'` | Don't wrap with `node` — `serve` is a binary, not a JS file |
| `autorestart: true` | Restart if the process exits/crashes |
| `max_memory_restart: '300M'` | Restart if memory grows past 300 MB (safety net against memory leaks) |
| `env: { NODE_ENV: 'production' }` | Many libraries switch to faster modes when this is set |

---

### Step 11 — Create the deploy script

#### Why this step exists

The pipeline could put all deploy logic inline in the workflow YAML. But putting
it in a shell script means:

1. **Easier debugging** — you can run `bash deploy/deploy.sh` manually (with
   secrets exported) instead of triggering a pipeline.
2. **Portable** — if you ever switch from GitHub Actions to another CI system,
   the script doesn't change. Only the YAML wrapper does.

#### Commands

```bash
nano deploy/deploy.sh
```

Paste:

```bash
#!/usr/bin/env bash
# Deploy script — runs on the self-hosted runner after every push to main.
# Builds both apps and (re)starts them under PM2.

set -euo pipefail

echo "==> Deploying from: $(pwd)"
echo "==> Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"

# -------------------------------------------------------------
# 1. Write the backend .env from environment variables
#    (the workflow YAML passes these in from GitHub Secrets)
# -------------------------------------------------------------
echo "==> Writing node/.env from secrets"
cat > node/.env <<EOF
PORT=${BACKEND_PORT:-5050}
MONGO_URI=${MONGO_URI}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-1d}
EOF

# -------------------------------------------------------------
# 2. Backend: install deps & build
# -------------------------------------------------------------
echo "==> Backend: installing dependencies"
(cd node && npm ci)

echo "==> Backend: building TypeScript -> dist/"
(cd node && npm run build)

# -------------------------------------------------------------
# 3. Frontend: install deps & build
# -------------------------------------------------------------
echo "==> Frontend: installing dependencies"
(cd react && npm ci)

echo "==> Frontend: building -> dist/"
(cd react && npm run build)

# -------------------------------------------------------------
# 4. Ensure 'serve' is installed
# -------------------------------------------------------------
if ! command -v serve >/dev/null 2>&1; then
  echo "==> Installing 'serve' globally (first time only)"
  sudo npm install -g serve
fi

# -------------------------------------------------------------
# 5. Start or reload apps in PM2
# -------------------------------------------------------------
echo "==> PM2: start-or-reload via ecosystem file"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env

# -------------------------------------------------------------
# 6. Save PM2 state so apps survive reboots
# -------------------------------------------------------------
echo "==> PM2: saving process list"
pm2 save

echo "==> Deploy complete."
pm2 list
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

Make it executable:

```bash
chmod +x deploy/deploy.sh
```

> **`chmod +x`** adds the execute permission bit. Without it, the OS refuses to
> run the file even though it's a valid shell script.

#### Key concepts inside the script

- **`#!/usr/bin/env bash`** — shebang. Tells the OS *"run this script with bash"*.
- **`set -euo pipefail`** — safety harness:
  - `-e` exit on any command failure
  - `-u` exit on referencing an undefined variable (catches typos)
  - `-o pipefail` if any command in a pipe fails, the whole pipe fails
- **`npm ci`** vs `npm install` — `ci` ("clean install") uses the exact versions
  in `package-lock.json` and never modifies the lockfile. Use it in CI/CD for
  reproducible builds.
- **`pm2 startOrReload`** — starts apps if not running, gracefully reloads them
  if they are. The `--update-env` flag tells PM2 to pick up env-var changes.

#### Install `serve` once manually

The script has a fallback to install `serve` if missing, but it requires sudo
without prompt — easier to install it once now:

```bash
sudo npm install -g serve
serve --version       # confirms install
```

---

### Step 12 — Create the GitHub Actions workflow

#### Why this step exists

This YAML file is the pipeline definition. GitHub Actions watches
`.github/workflows/*.yml` files and runs them based on the triggers inside.

#### Commands

```bash
mkdir -p .github/workflows
nano .github/workflows/ci-cd.yml
```

Paste:

```yaml
name: CI/CD Pipeline

# What triggers this workflow
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch: {}  # lets you run it manually from the Actions tab

# Cancel an older run if a newer push happens on the same branch
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ----------------------------------------------------------
  # JOB 1: Build & type-check (runs in GitHub's cloud)
  # ----------------------------------------------------------
  build-test:
    name: Build & type-check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: |
            node/package-lock.json
            react/package-lock.json

      # ---- Backend ----
      - name: Backend - install
        working-directory: node
        run: npm ci

      - name: Backend - type-check
        working-directory: node
        run: npm run typecheck

      - name: Backend - build
        working-directory: node
        run: npm run build

      # ---- Frontend ----
      - name: Frontend - install
        working-directory: react
        run: npm ci

      - name: Frontend - type-check
        working-directory: react
        run: npm run typecheck

      - name: Frontend - build
        working-directory: react
        run: npm run build

  # ----------------------------------------------------------
  # JOB 2: Deploy to your local machine via self-hosted runner
  # ----------------------------------------------------------
  deploy:
    name: Deploy to local machine
    needs: build-test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: [self-hosted, Linux, X64]

    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      - name: Run deploy script
        env:
          MONGO_URI: ${{ secrets.MONGO_URI }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          JWT_EXPIRES_IN: ${{ secrets.JWT_EXPIRES_IN }}
          BACKEND_PORT: ${{ secrets.BACKEND_PORT }}
        run: bash deploy/deploy.sh
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

#### Field reference

| Section | What it does |
|---|---|
| `on.push.branches: [main]` | Trigger on pushes to `main` |
| `on.pull_request.branches: [main]` | Also trigger on PRs targeting `main` — runs Job 1 only (the `if:` on Job 2 prevents deploy) |
| `on.workflow_dispatch: {}` | Adds a manual "Run workflow" button to the Actions tab |
| `concurrency.cancel-in-progress: true` | If you push twice rapidly, the older run is cancelled |
| `runs-on: ubuntu-latest` (Job 1) | GitHub-hosted Ubuntu VM — free, throwaway |
| `runs-on: [self-hosted, Linux, X64]` (Job 2) | Pick a runner with all three labels — matches the labels assigned during runner registration |
| `actions/checkout@v4` | Official action that clones the repo into the runner's working directory |
| `actions/setup-node@v4` | Official action that installs a specific Node.js version, with optional npm cache |
| `working-directory: node` | Change directory for this step (default is the repo root) |
| `needs: build-test` (Job 2) | Don't start Job 2 until Job 1 succeeds |
| `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` | Only deploy on actual pushes to `main`, never on PRs |
| `env:` block | Inject secrets as environment variables — they're masked in logs |

> **Always pin action versions with `@v4`** (or a commit hash). An unpinned
> action could update at any time and break your pipeline.

---

### Step 13 — Push and watch the first pipeline run

#### Commands

```bash
git status                                  # confirm new files: .github/, deploy/
git add .
git status                                  # confirm: no .env, no node_modules in green list
git commit -m "Add CI/CD pipeline (GitHub Actions + PM2 self-hosted deploy)"
git push
```

The push triggers the pipeline immediately.

#### Watch

Visit: `https://github.com/yourname/learning-cicd-todo/actions`

You'll see a new run named after your commit. Click into it. Two jobs appear:
**Build & type-check** and **Deploy to local machine**.

First run timing:
- Job 1 (cloud build): ~3–5 minutes (no npm cache yet)
- Job 2 (local deploy): ~1–2 minutes
- Subsequent runs: 1–2 minutes total thanks to caching

Expected: both jobs end ✅ green.

> **Heads-up on known TS issue:** If you scaffolded the React app with an older
> Vite template, the build will fail with:
>
> `Referenced project '.../react/tsconfig.node.json' may not disable emit.`
>
> Fix: in `react/tsconfig.node.json`, replace `"noEmit": true` with
> `"emitDeclarationOnly": true` and add `"declarationDir": "./node_modules/.cache/tsc-node"`.
> Commit and push again. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for details.

---

### Step 14 — Verify the deployed apps

After both jobs go green, confirm the apps are actually serving traffic.

```bash
pm2 list
```

You should see **two apps**, both with:
- `status: online`
- A real PID (NOT `N/A`)
- Memory > 0

```bash
curl http://localhost:5050/
# expected: {"message":"Todo API is running"}

curl -I http://localhost:5173/
# expected: HTTP/1.1 200 OK
```

In a browser:
- http://localhost:5050/ — backend health response
- http://localhost:5173/ — your React app

> **If `todo-frontend` shows status=online but PID=N/A and memory=0b:** PM2
> couldn't find the `serve` binary. Fix the `script:` field in
> `deploy/ecosystem.config.cjs` to use the absolute path (`/usr/bin/serve` or
> wherever `which serve` returned), then:
>
> ```bash
> pm2 delete todo-frontend
> pm2 start deploy/ecosystem.config.cjs
> pm2 save
> ```

---

### Step 15 — Make PM2 survive reboots

#### Why this step exists

Without this, rebooting your machine kills all apps and they don't come back.
PM2 ships a helper (`pm2 startup`) that registers itself as a systemd service.
On boot, systemd starts PM2, PM2 runs `resurrect`, which restores the last saved
process list.

#### Commands

```bash
pm2 startup
```

PM2 doesn't install anything — it **prints** a `sudo env PATH=... pm2 startup
systemd -u <username> --hp /home/<username>` command tailored to your user.

**Copy that printed command and run it.** You'll be prompted for sudo password.

Then save your current process list so reboot restores exactly these apps:

```bash
pm2 save
```

#### Verify

```bash
systemctl status pm2-<your-username>
```

You want:
- `Loaded: ... enabled` ← will auto-start on boot
- `Active: ...` (any state — `inactive (dead)` is normal when PM2 was launched
  directly outside the service)

#### Optional final test

Reboot your machine. After login, **without running anything**, open a terminal:

```bash
pm2 list
curl http://localhost:5050/
```

Both apps should be online with fresh PIDs, and the API should respond.

---

## Part 4 — Verifying the whole loop

To prove the pipeline really is end-to-end automated, make a trivial code change:

```bash
# Make any visible change — for example, edit the homepage response:
sed -i 's/Todo API is running/Todo API v2/' node/server.ts
git add node/server.ts
git commit -m "Test: trivial backend change"
git push
```

Then watch:
1. The Actions tab: a new run starts within seconds
2. Both jobs go ✅ green
3. `curl http://localhost:5050/` now returns the new message

If all three happen, the pipeline is working. Revert the change with another
commit if you want.

---

## Part 5 — PM2 cheat sheet

| Command | Use |
|---|---|
| `pm2 list` | Show all managed apps and their status |
| `pm2 logs <name>` | Tail logs (Ctrl+C to exit) |
| `pm2 logs <name> --lines 100 --nostream` | Print last N lines and exit |
| `pm2 restart <name>` | Hard restart an app |
| `pm2 reload <name>` | Graceful restart (cluster mode only) |
| `pm2 stop <name>` | Stop but keep in list |
| `pm2 delete <name>` | Stop and remove from list |
| `pm2 save` | Snapshot current list for reboot persistence |
| `pm2 resurrect` | Manually restore the saved list |
| `pm2 monit` | Interactive dashboard with CPU/memory graphs |
| `pm2 flush` | Empty all log files |
| `pm2 info <name>` | Detailed info about one app |

---

## Part 6 — Useful Git commands recap

| Command | Use |
|---|---|
| `git status` | What's changed, what's staged, what branch you're on |
| `git add <file>` / `git add .` | Stage changes for the next commit |
| `git commit -m "msg"` | Record a checkpoint of staged changes |
| `git log --oneline` | Compact history view |
| `git diff` | Show unstaged changes |
| `git diff --staged` | Show staged-but-not-committed changes |
| `git push` | Send commits to the remote |
| `git pull` | Fetch + merge remote commits |
| `git branch -m old new` | Rename a branch |
| `git remote -v` | Show configured remotes |
| `git commit --amend -m "new"` | Replace the last (unpushed) commit's message |

---

## You're done

If you've reached this point with green checks across the board, you've built:

- A **two-job CI/CD pipeline** that builds in the cloud and deploys to your
  local machine
- A **self-healing app stack** — PM2 restarts on crash, MongoDB and PM2
  auto-start on boot
- A **secrets-aware deployment** that doesn't leak `.env` content to Git or logs
- A **portable setup** — the same `deploy.sh` and `ecosystem.config.cjs` will
  work on any future server with minimal changes

See [DEPLOY_TO_REAL_SERVER.md](DEPLOY_TO_REAL_SERVER.md) for moving this to a
cloud VM when you're ready, and [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if
anything breaks along the way.
