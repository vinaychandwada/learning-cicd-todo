# Deploying to a Real Server

This guide shows how to take the **same pipeline** (built in [SETUP.md](SETUP.md))
and run it against a real cloud server — AWS EC2, DigitalOcean Droplet, Google
Cloud VM, Hetzner, Linode, anything Linux.

> **TL;DR:** the pipeline files don't change. You just spin up a server,
> install the same tools, register a new runner there, and point the
> `MONGO_URI` secret at production-quality storage.

---

## What changes vs the localhost setup

| Thing | Localhost setup | Real-server setup |
|---|---|---|
| Where the runner lives | Your laptop | The cloud VM |
| MongoDB location | Local Mongo on your laptop | Mongo on the same VM, OR — better — MongoDB Atlas |
| HTTPS / public access | Not needed | Add nginx + Let's Encrypt |
| Domain | `localhost` | `yourdomain.com` |
| Process manager | PM2 | PM2 (unchanged) |
| Workflow YAML | Same | Same |
| Deploy script | Same | Same |
| Ecosystem config | Same (path to `serve` may differ) | Same (verify path) |

---

## Step-by-step migration

### 1. Provision a Linux VM

Recommendations for a small learning project:

| Provider | Smallest reasonable plan | Approx. cost |
|---|---|---|
| DigitalOcean | $6/mo droplet (1 GB RAM) | $6/mo |
| Hetzner | CX11 (2 GB RAM) | €4.51/mo |
| AWS EC2 | t3.micro (free tier for 12 months) | free → ~$8/mo |
| Google Cloud | e2-micro (free tier eligible) | free → ~$7/mo |
| Linode | Nanode 1 GB | $5/mo |

Pick **Ubuntu 22.04 LTS** as the OS for the smoothest path with these
instructions.

After provisioning, SSH in:
```bash
ssh root@your.server.ip
# or for cloud providers that disable root SSH:
ssh ubuntu@your.server.ip
```

Create a non-root user (production best practice — don't run apps as root):
```bash
adduser deploy
usermod -aG sudo deploy
# Copy your SSH key so you can log in as 'deploy'
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

From now on, log in as `deploy`:
```bash
exit
ssh deploy@your.server.ip
```

---

### 2. Install the prerequisites on the server

Identical to what we did locally:

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs git

# PM2 + serve globally
sudo npm install -g pm2 serve

# Verify
node --version
npm --version
git --version
pm2 --version
serve --version
```

---

### 3. Choose: MongoDB on the VM, or MongoDB Atlas

#### Option A — MongoDB on the same VM (simplest, less production-grade)

Install MongoDB exactly like in the localhost setup:
[MongoDB install docs](https://www.mongodb.com/docs/manual/installation/).

```bash
sudo systemctl start mongod
sudo systemctl enable mongod
```

Your `MONGO_URI` GitHub Secret stays the same:
`mongodb://127.0.0.1:27017/learning_todo`

> **Caveat:** if the VM crashes, your DB is gone. No backups, no high
> availability. Fine for a portfolio / learning project, not for anything you'd
> hate to lose.

#### Option B — MongoDB Atlas (recommended for any real project)

1. Sign up at https://www.mongodb.com/cloud/atlas/register.
2. Create a free M0 cluster (512 MB, free forever).
3. In **Network Access**, add the VM's public IP to the allow-list (or
   `0.0.0.0/0` to allow from anywhere — fine for learning).
4. In **Database Access**, create a database user with a strong password.
5. Click **Connect → Drivers → Node.js** and copy the connection string. It
   looks like:
   ```
   mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/learning_todo?retryWrites=true&w=majority
   ```
6. Update the `MONGO_URI` GitHub Secret with this string.

> **Atlas is the better choice long-term** because it survives VM failures,
> includes automatic backups on paid tiers, and works identically from your
> laptop and the server.

---

### 4. Register a self-hosted runner *on the VM*

Same procedure as [SETUP.md Step 8](SETUP.md#step-8--install-a-self-hosted-github-actions-runner),
but executed on the VM instead of your laptop.

```bash
# On the VM, as the 'deploy' user
cd ~
mkdir actions-runner && cd actions-runner

# Get the download URL + token from
# https://github.com/yourname/your-repo/settings/actions/runners/new
# (the page generates a fresh token; tokens last 1 hour)

curl -o actions-runner-linux-x64-VERSION.tar.gz \
  -L https://github.com/actions/runner/releases/download/vVERSION/actions-runner-linux-x64-VERSION.tar.gz
tar xzf ./actions-runner-linux-x64-VERSION.tar.gz

./config.sh --url https://github.com/yourname/your-repo --token AAAA...
# Press Enter through the four prompts

sudo ./svc.sh install
sudo ./svc.sh start
```

The new runner will appear on the GitHub runners page as Idle.

> **Important:** you now have **two** runners (your laptop + the VM). The
> workflow's `runs-on: [self-hosted, Linux, X64]` will pick whichever is free
> first. To target one specifically, add a unique label during registration
> (e.g. `production`) and reference it in the workflow.

---

### 5. Update GitHub Secrets if needed

The only secret likely to change is `MONGO_URI`. If you switched to Atlas (Option
B above), update it to the Atlas connection string in the Secrets settings
page.

`JWT_SECRET`, `JWT_EXPIRES_IN`, `BACKEND_PORT` are unchanged.

---

### 6. Push and watch — but target the new runner only

If you want this push to deploy *only* to the VM (not your laptop too), add a
unique label.

#### During runner registration on the VM, add a label:

When prompted `Enter any additional labels`, type `production`.

#### Update the workflow's `runs-on:`

```yaml
deploy:
  ...
  runs-on: [self-hosted, Linux, X64, production]
```

Commit and push. Only the runner with the `production` label (the VM) will
accept the job. Your laptop is bypassed.

You can keep both runners (laptop = preview, VM = real) or unregister the
laptop one whenever you like:
```bash
# On the laptop:
cd ~/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh uninstall
./config.sh remove --token NEW_REMOVAL_TOKEN_FROM_GITHUB
```

---

### 7. Add nginx for HTTPS and a proper domain

Currently your app listens on `5050` (backend) and `5173` (frontend) directly.
On a server, you want:

- A real domain (e.g. `todo.example.com`)
- HTTPS on port 443
- nginx in front, routing:
  - `/api/*` → backend on `localhost:5050`
  - everything else → frontend on `localhost:5173`

#### Install nginx and certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

#### Point your domain at the server

In your DNS provider, create an **A record** for `todo.example.com` pointing to
the VM's public IP. Wait ~5 minutes for it to propagate.

#### Create an nginx config

```bash
sudo nano /etc/nginx/sites-available/todo
```

Paste:

```nginx
server {
    listen 80;
    server_name todo.example.com;

    location /api/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:5050;
    }

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/todo /etc/nginx/sites-enabled/
sudo nginx -t           # test config
sudo systemctl reload nginx
```

#### Get a free SSL cert

```bash
sudo certbot --nginx -d todo.example.com
```

Certbot edits your nginx config to add HTTPS + auto-redirects HTTP → HTTPS, and
sets up automatic renewal. After this, your app is live at
`https://todo.example.com`.

#### Update the frontend's API URL

By default the frontend hits `http://localhost:5050/api`. Now that everything
runs behind nginx, you want it to hit `/api/` on the same domain.

In `react/src/api.ts` (or wherever the base URL is set), or in `react/.env`:

```env
VITE_API_URL=/api
```

Commit, push, pipeline rebuilds the frontend with the new URL — done.

---

### 8. (Optional) Lock down the firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'      # opens 80 and 443
sudo ufw enable
```

Ports `5050` and `5173` are NOT exposed directly to the internet — they're
proxied by nginx — so you don't need to open them.

---

## Quick checklist

When migrating from localhost to a real server, verify each of these:

- [ ] VM provisioned with Ubuntu 22.04
- [ ] Non-root `deploy` user created with sudo + SSH access
- [ ] Node 20, npm, git, PM2, `serve` installed
- [ ] MongoDB available (local or Atlas)
- [ ] Self-hosted runner registered with `production` label and running as a service
- [ ] `MONGO_URI` secret updated to point at production DB
- [ ] Workflow's `runs-on:` updated with the `production` label
- [ ] nginx installed, domain pointed at VM, SSL cert via certbot
- [ ] Frontend `VITE_API_URL` updated to `/api`
- [ ] Firewall configured: SSH + 80/443 open, 5050/5173 closed externally
- [ ] First push completes both jobs green
- [ ] `https://yourdomain.com` loads the app

---

## What if you also want a *staging* environment?

Run through this guide twice: once for `staging`, once for `production`. Use
separate runners with distinct labels (`staging` vs `production`), and update
the workflow to deploy to each based on the branch:

```yaml
deploy-staging:
  if: github.ref == 'refs/heads/develop'
  runs-on: [self-hosted, Linux, X64, staging]
  ...

deploy-production:
  if: github.ref == 'refs/heads/main'
  runs-on: [self-hosted, Linux, X64, production]
  ...
```

Then `develop` deploys to staging, `main` deploys to production. Same files,
same logic — just different labels.
