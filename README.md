# PathFinder — Career Guidance System

## Setup & Run

### 1. Install dependencies
```bash
npm install express cors bcryptjs jsonwebtoken
```

### 2. Start the backend
```bash
node server.js
```
Backend runs at http://localhost:3000

### 3. Open the frontend
Open `index.html` in your browser (just double-click it).

## Features
- **Register / Login** with JWT authentication
- **10-question** career assessment quiz
- **AI analysis** via Anthropic Claude (add your API key in the quiz)
- **Offline fallback** when no API key is provided
- **Save reports** to your account (last 10 reports stored)
- **Dashboard** to view and manage past reports

## API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/health | No | Server status |
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/login | No | Login |
| GET | /api/auth/me | Yes | Get profile |
| POST | /api/analyse | Yes | Run career analysis |
| GET | /api/reports | Yes | Get saved reports |
| DELETE | /api/reports/:id | Yes | Delete a report |

## Get API Key
Visit https://console.anthropic.com to get a free Anthropic API key.
