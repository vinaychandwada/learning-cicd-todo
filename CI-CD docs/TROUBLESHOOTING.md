# Troubleshooting Guide

Common errors hit while setting up this CI/CD pipeline, with the fix for each.

> If your problem isn't listed here, the first thing to do is read the **failing
> step's full log** in the GitHub Actions tab. Most errors are self-describing.

---

## Table of contents

- [Git & GitHub issues](#git--github-issues)
- [GitHub Actions issues](#github-actions-issues)
- [Self-hosted runner issues](#self-hosted-runner-issues)
- [PM2 issues](#pm2-issues)
- [TypeScript / build issues](#typescript--build-issues)
- [Network / port issues](#network--port-issues)

---

## Git & GitHub issues

### `Please tell me who you are`

**Cause:** Git doesn't know your name or email.

**Fix:**
```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

### `remote: Support for password authentication was removed`

**Cause:** You tried to authenticate with your GitHub account password. GitHub
disabled this in 2021.

**Fix:** Use a **Personal Access Token (PAT)** as the password instead.
Generate one at https://github.com/settings/tokens (Tokens classic) with
`repo` + `workflow` scopes. Paste the token when Git asks for a password.

---

### `fatal: 'origin' does not appear to be a git repository`

**Cause:** No remote named `origin` is configured.

**Fix:**
```bash
git remote add origin https://github.com/yourname/your-repo.git
git remote -v       # verify it stuck
```

If you get `fatal: remote origin already exists`, update it instead:
```bash
git remote set-url origin https://github.com/yourname/your-repo.git
```

---

### Branch is named `master` but you want `main`

**Cause:** Older Git versions default to `master`, or `git init -b main` wasn't
recognised.

**Fix (before any push):**
```bash
git branch -m master main
```

---

### `error: failed to push some refs ... (fetch first)`

**Cause:** GitHub has commits your local repo doesn't (often because you
checked one of the "Initialize this repository" boxes when creating the repo on
GitHub).

**Fix:**
```bash
git pull --rebase origin main
git push -u origin main
```

If the pull has conflicts, resolve them or — if your local commit has
everything you need and you're SURE you want to overwrite GitHub — force push:
```bash
git push -u origin main --force
```
(Only safe on a brand-new repo with nothing important on GitHub yet.)

---

## GitHub Actions issues

### Both jobs stuck queued / never start

**Cause for Job 1 (cloud):** rare; GitHub-hosted runners are usually instant.
Check https://www.githubstatus.com/.

**Cause for Job 2 (self-hosted):** the runner is offline.

**Fix:**
1. Visit `https://github.com/yourname/your-repo/settings/actions/runners`. The
   runner should show a green dot ("Idle"). If it shows Offline:
   ```bash
   cd ~/actions-runner
   sudo ./svc.sh status        # systemd status
   sudo ./svc.sh start         # if not running
   ```
2. Wait 10 seconds, refresh the runners page.

---

### `Referenced project '.../tsconfig.node.json' may not disable emit`

**Cause:** Modern TypeScript (5.5+) forbids `"noEmit": true` on a project that
appears in another tsconfig's `references` list. Older Vite scaffolds shipped
with this combination.

**Fix:** Edit `react/tsconfig.node.json` and replace `"noEmit": true` with the
two lines below:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "emitDeclarationOnly": true,
    "declarationDir": "./node_modules/.cache/tsc-node"
  },
  "include": ["vite.config.ts"]
}
```

Test locally before pushing:
```bash
cd react && npm run build
```

---

### `MONGO_URI: unbound variable` when running `deploy.sh` manually

**Cause:** `set -u` is on, so the script exits when an env var is undefined.
GitHub Secrets are only available when the workflow runs them — not from your
plain terminal.

**Fix (if you really want to run the script manually):** export the values
first:
```bash
export MONGO_URI="mongodb://127.0.0.1:27017/learning_todo"
export JWT_SECRET="$(openssl rand -hex 32)"
export JWT_EXPIRES_IN="1d"
export BACKEND_PORT="5050"
bash deploy/deploy.sh
```

Otherwise just trigger the pipeline via `git push`; the workflow injects them
for you.

---

### Pipeline runs but secrets show up as `***` and the script crashes

**Cause:** Either you misnamed a secret in the GitHub UI, or you misspelt the
secret name in the workflow YAML. GitHub silently passes an empty string for
missing secrets.

**Fix:** Verify the names match **exactly** (case-sensitive) in:
- The Secrets settings page
- The `env:` block in `.github/workflows/ci-cd.yml`
- The variable references in `deploy/deploy.sh`

The four expected names: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
`BACKEND_PORT`.

---

## Self-hosted runner issues

### `Must not run with sudo` during `./config.sh`

**Cause:** You used `sudo` to register the runner. Don't.

**Fix:**
```bash
cd ~
rm -rf actions-runner
# re-run the Download and Configure commands from GitHub, without sudo
```

---

### Runner registration fails with `Bad token`

**Cause:** Registration tokens expire one hour after GitHub generates them.

**Fix:** Refresh the runner setup page on GitHub (Settings → Actions → Runners →
New self-hosted runner). It regenerates the token. Copy the new `./config.sh
... --token ...` line and run it.

---

### Service doesn't start on boot

**Cause:** `svc.sh install` failed silently, or the service is disabled.

**Fix:**
```bash
cd ~/actions-runner
sudo ./svc.sh status
sudo systemctl enable actions.runner.yourname-your-repo.your-hostname.service
sudo systemctl start actions.runner.yourname-your-repo.your-hostname.service
```

The full service name is shown in the output of `sudo ./svc.sh status`.

---

## PM2 issues

### App shows `status: online` but `pid: N/A` and `mem: 0b`

**Cause:** PM2 couldn't actually spawn the underlying process — usually the
`script:` path doesn't exist or isn't executable. PM2 marks the entry as
"online" optimistically before the spawn fails.

**Diagnose:**
```bash
pm2 logs <app-name> --lines 50 --nostream
```

If the logs are empty (a classic symptom), the spawn failed before producing
output.

**Fix for `serve` specifically:** PM2 treats `script:` as a literal file path,
not a PATH lookup. Use the absolute path:

```bash
which serve         # e.g. /usr/bin/serve
```

In `deploy/ecosystem.config.cjs`, change:
```javascript
script: 'serve',
```
to:
```javascript
script: '/usr/bin/serve',     // use what `which serve` returned
```

Then clean up and restart:
```bash
pm2 delete <app-name>
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

---

### Backend crashes immediately with `MongoDB connection failed`

**Cause:** Mongo isn't running, or `MONGO_URI` is wrong.

**Fix:**
```bash
systemctl status mongod              # is the service running?
mongosh --eval "db.runCommand({ping: 1})"   # can you connect?
cat node/.env                        # what URI is being used?
```

If Mongo isn't running:
```bash
sudo systemctl start mongod
sudo systemctl enable mongod
```

---

### `pm2 startup` printed a command but I didn't run it

**Cause:** `pm2 startup` only **prints** the install command. You have to
copy-paste it back into the terminal to actually install the systemd service.

**Fix:**
```bash
pm2 startup
# Look for a line starting with "sudo env PATH=..."
# Copy that exact line, paste it back, and run it.
```

Verify:
```bash
systemctl status pm2-<your-username>
# Loaded: ... enabled   ← critical
```

---

### Apps don't come back after reboot

**Causes:**
- You didn't run `pm2 save` after starting them
- `pm2 startup` was never installed (see above)
- MongoDB isn't enabled to start on boot

**Fix:**
```bash
pm2 save                                # snapshot current apps
sudo systemctl enable mongod            # auto-start Mongo
systemctl is-enabled pm2-$(whoami)      # should print "enabled"
```

---

## TypeScript / build issues

### Build fails locally but the pipeline succeeded (or vice versa)

**Cause:** Your local Node version differs from the CI Node version
(workflow uses Node 20).

**Fix:** Either upgrade your local Node, or pin the CI Node to your local
version in `.github/workflows/ci-cd.yml`:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'    # match what you use locally
```

---

### `npm ci` complains about lockfile mismatch

**Cause:** `package.json` was edited without `package-lock.json` being
regenerated. `npm ci` refuses to install when these are out of sync.

**Fix:** Locally, run `npm install` (which updates the lockfile), commit both
files, and push:
```bash
cd node     # or react
npm install
git add package.json package-lock.json
git commit -m "Update lockfile"
git push
```

---

## Network / port issues

### `Connection refused` on port 5050 or 5173

Check:
```bash
pm2 list                             # app online?
ss -tlnp 2>/dev/null | grep -E '5050|5173'    # something listening?
```

If `pm2 list` says online but no listener exists, see the
[PM2 `pid: N/A`](#app-shows-status-online-but-pid-na-and-mem-0b) section above.

If nothing's running at all:
```bash
pm2 resurrect       # restore from the saved list
# or
pm2 start deploy/ecosystem.config.cjs
```

---

### Port already in use (`EADDRINUSE`)

**Cause:** Something else is already bound to the port (e.g. a `vite dev`
process still running from earlier development).

**Fix:**
```bash
ss -tlnp 2>/dev/null | grep 5050     # find the PID
kill <pid>                            # stop it
```

Or change the port in:
- GitHub Secret `BACKEND_PORT`, and
- The `args:` field of the frontend in `ecosystem.config.cjs` for the frontend
  port.

---

## Still stuck?

1. Read the **full** log of the failing step in the Actions tab — most errors
   are self-explanatory once you see the surrounding context.
2. Reproduce the failing command locally — many errors that surface in CI also
   reproduce on your machine.
3. Search the exact error message on Google; CI/CD problems are very common
   and rarely unique.
