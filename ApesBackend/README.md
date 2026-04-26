# ApesBackend

Node.js/Express REST API for the Apes of Wrath 668 Team OS, backed by SQLite.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your .env
cp .env.example .env
# Edit .env — set JWT_SECRET to any long random string

# 3. Seed the database
node src/db/seed.js

# 4. Copy your HTML into public/
mkdir -p public
cp ../your-html-file.html public/index.html

# 5. Start
npm start
```

Open **http://localhost:3001**

## Default Logins

| Role    | Email                                  | Password   |
|---------|----------------------------------------|------------|
| Admin   | admin@apesofwrath668.org               | admin000   |
| Captain | jordan.rivera@apesofwrath668.org       | captain456 |
| Mentor  | dr.park@apesofwrath668.org             | mentor789  |
| Student | alex.chen@apesofwrath668.org           | student123 |

## API Endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Any |
| POST | `/api/auth/logout` | Any |
| GET | `/api/users` | Any |
| GET | `/api/tasks` | Any |
| GET | `/api/projects` | Any |
| GET | `/api/events` | Any |
| GET | `/api/attendance` | Any |
| GET | `/api/meetings` | Any |
| GET | `/api/manufacturing/jobs` | Any |
| GET | `/api/manufacturing/orders` | Any |
| GET | `/api/health` | Public |

Full CRUD (POST/PUT/DELETE) available on all routes with appropriate role permissions.
