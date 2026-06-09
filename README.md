Here's everything that was built and how to run it:

Project Structure

Mark1Job/
├── backend/          FastAPI + SQLite + OpenAI
│   ├── main.py
│   ├── models.py     Job, Application (ORM)
│   ├── routers/
│   │   ├── jobs.py           CRUD for job postings
│   │   └── applications.py   Full screening + displacement logic
│   └── services/
│       ├── ai_service.py     GPT-4o screening + rejection email gen
│       ├── email_service.py  SMTP / console fallback
│       └── file_parser.py    PDF, DOCX, TXT extraction
└── frontend/         React + TypeScript + Tailwind
    └── src/pages/
        ├── Home.tsx            Job listings grid
        ├── JobDetail.tsx       JD + live leaderboard sidebar
        ├── Apply.tsx           Drag-drop resume upload form
        ├── ApplicationResult.tsx  Score ring + AI feedback
        └── RecruiterPortal.tsx    Post jobs + ranked applicant table
Running the app
Step 1 — add your OpenAI key:


cp backend/.env.example backend/.env
# edit backend/.env and set OPENAI_API_KEY=sk-...
Step 2 — start backend:


cd backend
source venv/bin/activate
uvicorn main:app --reload
# runs on http://localhost:8000
Step 3 — start frontend:


cd frontend
npm run dev
# runs on http://localhost:5173
How the AI screening works
Score	Outcome
< 80%	Instant rejection — GPT-4o generates a personalised email with specific gaps + 3 actionable resume tips
≥ 80%, pool not full	Accepted — ranked by score, acceptance notification sent
≥ 80%, pool full, score > lowest	Displaces lowest-ranked candidate — displaced gets a specific "you were displaced" email; new candidate confirmed
≥ 80%, pool full, score ≤ lowest	Rejected — pool-full rejection email sent
Email sending falls back to console logging if SMTP is not configured — so it works for development out of the box.

in case 3 are we placing the new resume at right rank instead of last
Let me read the relevant code to confirm:

Read applications.py (lines 2-31)
Yes — it's correct. Here's exactly what happens in Case 3:

lowest.status = "displaced", lowest.rank = None — removes the bottom candidate from the accepted pool
_save("accepted") — inserts the new candidate with rank=None
_rerank(db, job_id) — queries all status=="accepted" apps for that job, sorts them by match_score DESC, then assigns ranks 1, 2, 3... in order
So if the pool was [95, 90, 85, 82, 80] and the new candidate scored 88:

After displacing 80: pool has [95, 90, 85, 82] + new 88
_rerank sorts: 95 → #1, 90 → #2, 88 → #3, 85 → #4, 82 → #5
The new candidate lands at rank 3 — exactly where their score places them. Every other candidate above them keeps their rank, those below them shift down by one. It's a full re-sort on every change, not an append.
