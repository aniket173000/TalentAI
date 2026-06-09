# Mark1Job – AI-Powered Candidate Screening Platform

An AI-powered recruitment platform that automatically screens resumes against job descriptions, ranks candidates, manages limited acceptance pools, and handles candidate displacement using GPT-4o.

---

## Features

### Recruiter Features

* Create and manage job postings
* Define maximum accepted candidate pool size
* View ranked candidate leaderboard
* Monitor accepted, rejected, and displaced applicants
* AI-generated candidate evaluation summaries

### Candidate Features

* Browse available jobs
* Upload resumes (PDF, DOCX, TXT)
* Receive instant AI screening results
* Get personalized feedback and improvement suggestions
* Track application status

### AI Capabilities

* Resume parsing
* Job-description matching
* Candidate scoring
* Personalized rejection emails
* Candidate feedback generation
* Automatic displacement handling

---

# Project Structure

```text
Mark1Job/
│
├── backend/
│   ├── main.py
│   ├── models.py
│   │
│   ├── routers/
│   │   ├── jobs.py
│   │   └── applications.py
│   │
│   ├── services/
│   │   ├── ai_service.py
│   │   ├── email_service.py
│   │   └── file_parser.py
│   │
│   ├── requirements.txt
│   ├── .env.example
│   └── database.db
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── JobDetail.tsx
│   │   │   ├── Apply.tsx
│   │   │   ├── ApplicationResult.tsx
│   │   │   └── RecruiterPortal.tsx
│   │   │
│   │   ├── components/
│   │   └── services/
│   │
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

# Technology Stack

## Backend

* FastAPI
* SQLAlchemy
* SQLite
* OpenAI GPT-4o
* Python

## Frontend

* React
* TypeScript
* TailwindCSS
* Vite

---

# Setup Instructions

## 1. Clone Repository

```bash
git clone https://github.com/<username>/Mark1Job.git

cd Mark1Job
```

---

## 2. Configure Environment Variables

Create a `.env` file:

```bash
cp backend/.env.example backend/.env
```

Update:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

Optional SMTP configuration:

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
```

If SMTP is not configured, emails will be logged to the console.

---

# Backend Setup

## Create Virtual Environment

```bash
cd backend

python -m venv venv
```

### Linux / Mac

```bash
source venv/bin/activate
```

### Windows

```bash
venv\Scripts\activate
```

---

## Install Dependencies

```bash
pip install -r requirements.txt
```

---

## Run Backend

```bash
uvicorn main:app --reload
```

Backend runs at:

```text
http://localhost:8000
```

Swagger Documentation:

```text
http://localhost:8000/docs
```

---

# Frontend Setup

Open a new terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Run application:

```bash
npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

---

# AI Screening Workflow

```text
Resume Upload
       │
       ▼
Resume Parsing
       │
       ▼
GPT-4o Candidate Evaluation
       │
       ▼
Generate Match Score
       │
       ▼
Decision Engine
```

---

# Candidate Outcomes

| Score                            | Outcome                    |
| -------------------------------- | -------------------------- |
| < 80%                            | Rejected                   |
| ≥ 80% & Pool Available           | Accepted                   |
| ≥ 80% & Pool Full & Better Score | Displaces Lowest Candidate |
| ≥ 80% & Pool Full & Lower Score  | Rejected                   |

---

# Candidate Displacement Logic

When the candidate pool reaches capacity:

1. Identify the lowest-ranked accepted candidate.
2. Compare incoming candidate score.
3. If incoming score is higher:

   * Mark lowest candidate as displaced.
   * Send displacement notification.
   * Accept new candidate.
4. Re-rank all accepted candidates.
5. Update leaderboard.

### Example

Current Leaderboard

| Rank | Score |
| ---- | ----- |
| #1   | 95    |
| #2   | 90    |
| #3   | 85    |
| #4   | 82    |
| #5   | 80    |

New Candidate Score = **88**

Updated Leaderboard

| Rank | Score |
| ---- | ----- |
| #1   | 95    |
| #2   | 90    |
| #3   | 88    |
| #4   | 85    |
| #5   | 82    |

The candidate with score **80** is displaced.

---

# API Endpoints

## Jobs

```http
POST   /jobs
GET    /jobs
GET    /jobs/{id}
PUT    /jobs/{id}
DELETE /jobs/{id}
```

## Applications

```http
POST /applications/apply
GET  /applications/job/{job_id}
```

---

# Future Enhancements

* Multi-job recommendation engine
* Recruiter analytics dashboard
* ATS integrations
* Vector-based semantic resume matching
* Interview scheduling
* Email provider integrations (SendGrid, SES)
* Multi-tenant architecture

---

# License

MIT License
