
# 🦍 Apes of Wrath 668 — Team OS Backend

A Node.js/Express REST API backend for the Team OS web app, backed by SQLite. Designed to run on a home server.

---

## 📁 Project Structure

```
apes-backend/
├── src/
│   ├── server.js              # Express app entry point
│   ├── db/
│   │   ├── index.js           # SQLite connection singleton
│   │   └── seed.js            # Schema + seed data (run once)
│   ├── middleware/
│   │   └── auth.js            # JWT verification middleware
│   └── routes/
│       ├── auth.js            # Login, Google OAuth, refresh, logout
│       ├── users.js           # Roster CRUD
│       ├── tasks.js           # Tasks CRUD
│       ├── projects.js        # Projects CRUD
│       ├── events.js          # Calendar events CRUD
│       ├── attendance.js      # Attendance tracking
│       ├── meetings.js        # Meeting archive CRUD
│       └── manufacturing.js   # MFG jobs + purchase orders
├── public/                    # Drop your HTML file here as index.html
├── data/                      # SQLite database lives here (auto-created)
├── uploads/                   # File uploads (auto-created)
├── .env.example               # Copy to .env and fill in your values
├── setup.sh                   # One-shot setup script
└── package.json
```

---

## 🚀 Quick Start

### 1. Requirements

- **Node.js v18+** — https://nodejs.org
- A Linux/Mac home server (Windows also works)

### 2. Run Setup

```bash
chmod +x setup.sh
./setup.sh
```

This will:
- Install all npm dependencies
- Generate a secure JWT secret
- Create the `.env` file
- Create the SQLite database and seed it with your existing team data

### 3. Add your HTML frontend

Copy your HTML file into the `public/` folder and rename it `index.html`:

```bash
cp /path/to/apes_team_os.html ./public/index.html
```

### 4. Start the server

```bash
npm start
```

Or with auto-reload during development:
```bash
npm run dev
```

The server runs at **http://localhost:3001** (or on your local network at `http://YOUR_SERVER_IP:3001`).

---

## 🔑 Google OAuth Setup (for the "Continue with Google" button)

> You can skip this and use password login only if you prefer.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add Authorized redirect URIs:
   - `http://localhost:3001/api/auth/google/callback` (for local dev)
   - `http://YOUR_SERVER_IP:3001/api/auth/google/callback` (for home server)
7. Copy the **Client ID** and **Client Secret** into your `.env`:

```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://YOUR_SERVER_IP:3001/api/auth/google/callback
```

---

## 🌐 Connecting the Frontend to the Backend

The HTML file currently stores all data in JavaScript variables. To connect it to the backend, you need to replace those in-memory arrays with `fetch()` calls to the API.

### How authentication works

1. User clicks **Sign In with Email & Password** → `POST /api/auth/login`
2. Server returns a JWT access token (also set as an `httpOnly` cookie)
3. All subsequent requests include the token in the `Authorization` header:
   ```
   Authorization: Bearer <token>
   ```
4. For Google Sign-In: redirect user to `GET /api/auth/google` → Google handles it → redirected back

### Minimal example — replacing the login

In your HTML's `admLogin()` function, replace the hardcoded check with:

```javascript
async function admLogin() {
  const email    = document.getElementById('admEmail').value.trim();
  const password = document.getElementById('admPass').value;
  const role     = document.getElementById('admRole').value;

  try {
    const res = await fetch('http://YOUR_SERVER_IP:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',                // sends/receives cookies
      body: JSON.stringify({ email, password, role }),
    });
    const data = await res.json();
    if (!res.ok) { showErr(data.error); return; }

    // Store token for future requests
    window._token = data.accessToken;
    currentUser = data.user;
    resolveUser(data.user.email, data.user);
  } catch (err) {
    showErr('Could not reach server. Is it running?');
  }
}
```

### Fetching data example — loading tasks

```javascript
async function fetchTasks() {
  const res = await fetch('http://YOUR_SERVER_IP:3001/api/tasks', {
    headers: { 'Authorization': `Bearer ${window._token}` },
    credentials: 'include',
  });
  const tasks = await res.json();
  // use tasks array to render your UI
  return tasks;
}
```

---

## 📡 Full API Reference

All routes require `Authorization: Bearer <token>` unless noted.

### Auth

| Method | Path | Body / Notes |
|--------|------|--------------|
| `POST` | `/api/auth/login` | `{ email, password, role? }` |
| `GET`  | `/api/auth/google` | Redirects to Google |
| `GET`  | `/api/auth/google/callback` | Google redirects here |
| `POST` | `/api/auth/refresh` | Uses `refresh_token` cookie |
| `POST` | `/api/auth/logout` | Clears tokens |
| `GET`  | `/api/auth/me` | Returns current user |

### Users (Roster)

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| `GET`    | `/api/users` | all | List all users |
| `POST`   | `/api/users` | admin | Add a user |
| `PUT`    | `/api/users/:id` | admin (or self for name) | Edit user |
| `DELETE` | `/api/users/:id` | admin | Remove user |
| `PUT`    | `/api/users/me/password` | any | Change own password |

### Tasks

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| `GET`    | `/api/tasks` | all | Supports `?status=&category=&project_id=` |
| `POST`   | `/api/tasks` | captain+ | Create task |
| `PUT`    | `/api/tasks/:id` | captain+ or assignee | Update task |
| `DELETE` | `/api/tasks/:id` | captain+ | Delete task |

### Projects

| Method | Path | Roles |
|--------|------|-------|
| `GET`    | `/api/projects` | all |
| `POST`   | `/api/projects` | captain+ |
| `PUT`    | `/api/projects/:id` | captain+ |
| `DELETE` | `/api/projects/:id` | admin |

### Events (Calendar)

| Method | Path | Roles |
|--------|------|-------|
| `GET`    | `/api/events` | all (filtered by role visibility) |
| `POST`   | `/api/events` | captain+ |
| `PUT`    | `/api/events/:id` | captain+ |
| `DELETE` | `/api/events/:id` | captain+ |

### Attendance

| Method | Path | Notes |
|--------|------|-------|
| `GET`    | `/api/attendance` | All records grouped by user |
| `GET`    | `/api/attendance/sessions` | List session dates |
| `POST`   | `/api/attendance` | `{ user_id, session_date, present }` |
| `POST`   | `/api/attendance/bulk` | `{ session_date, records: [{user_id, present}] }` |

### Meetings

| Method | Path | Roles |
|--------|------|-------|
| `GET`    | `/api/meetings` | all |
| `POST`   | `/api/meetings` | captain+ |
| `PUT`    | `/api/meetings/:id` | captain+ |
| `DELETE` | `/api/meetings/:id` | admin |

### Manufacturing & Orders

| Method | Path | Roles |
|--------|------|-------|
| `GET`    | `/api/manufacturing/jobs` | all |
| `POST`   | `/api/manufacturing/jobs` | captain+ |
| `PUT`    | `/api/manufacturing/jobs/:id` | captain+ |
| `DELETE` | `/api/manufacturing/jobs/:id` | admin |
| `GET`    | `/api/manufacturing/orders` | all |
| `POST`   | `/api/manufacturing/orders` | any (records requester) |
| `PUT`    | `/api/manufacturing/orders/:id` | captain+ |
| `DELETE` | `/api/manufacturing/orders/:id` | admin |

---

## 🔒 Security Notes

- Passwords are hashed with **bcrypt** (cost factor 10)
- Access tokens expire in **7 days** by default
- Refresh tokens are stored as SHA-256 hashes and rotate on each use
- Rate limiting: 20 login attempts per 15 min, 200 API calls per minute
- CORS is restricted to your configured `FRONTEND_URL`
- All cookies are `httpOnly` and `secure` in production

---

## 🖥️ Running on Your Home Server

### Keep it running with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start the app
pm2 start src/server.js --name "apes-backend"

# Auto-start on reboot
pm2 startup
pm2 save
```

### Access from other devices on your network

Find your server's local IP:
```bash
ip addr show | grep 'inet ' | grep -v 127.0.0.1
# e.g. 192.168.1.50
```

Update your `.env`:
```env
FRONTEND_URL=http://192.168.1.50:3001
GOOGLE_REDIRECT_URI=http://192.168.1.50:3001/api/auth/google/callback
```

Then access the app from any device on your network at `http://192.168.1.50:3001`.

### Open to the internet (optional)

If you want to access it outside your home network:
1. Set up port forwarding on your router (port 3001 → your server's local IP)
2. Consider using a free domain from [DuckDNS](https://www.duckdns.org/)
3. Add HTTPS with [Caddy](https://caddyserver.com/) or nginx + Let's Encrypt

---

## 🧪 Test the API is working

```bash
# Health check (no auth needed)
curl http://localhost:3001/api/health

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@apesofwrath668.org","password":"admin000","role":"admin"}'
```

---

## Default Credentials (from seed data)

| Role    | Email                              | Password     |
|---------|------------------------------------|--------------|
| Admin   | admin@apesofwrath668.org           | admin000     |
| Admin   | vedant.j@apesofwrath668.org        | admin000     |
| Captain | jordan.rivera@apesofwrath668.org   | captain456   |
| Captain | priya.nair@apesofwrath668.org      | captain456   |
| Mentor  | dr.park@apesofwrath668.org         | mentor789    |
| Student | alex.chen@apesofwrath668.org       | student123   |

> **Change these passwords** after first login, especially for admin accounts!
