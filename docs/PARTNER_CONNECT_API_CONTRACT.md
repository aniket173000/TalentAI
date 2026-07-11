# Nideknil Partner Connect API — Contract (v1)

> For external partner integrations (e.g. Bhume) embedding the "connect your Claude Code"
> step for AI Fluency take-home assignments on your own hiring/assignment page.

## Overview

Your backend calls two Nideknil REST endpoints, server-to-server, using an API key we issue you.
No candidate account or prior invite on Nideknil is required — the candidate identity is created
on first use.

**Flow:**

1. Candidate lands on your assignment page and clicks "Generate command."
2. Your backend calls **Mint/Rotate Connect Token** with the candidate's email.
3. You display the returned `connect_command` to the candidate; they paste it into a terminal
   running Claude Code.
4. Claude Code connects to Nideknil's MCP server using that command.
5. Your backend calls **Get Connection Status** (poll) to show "Connected" once it flips true.
6. If the candidate's terminal session dies or they lose the command, call step 2 again with the
   same email — this issues a fresh command and invalidates the old one.

---

## Authentication

All requests use a bearer API key we issue you out-of-band, one key per hiring team/company on
our side:

```
Authorization: Bearer <your API key>
```

- Keep this key server-side only. Never expose it to the candidate's browser.
- The key is scoped to your company's own jobs/assignments — you cannot access another
  company's data with it, and vice versa.
- If a key is compromised, contact us to revoke it and issue a new one.

**Base URL:** `https://api.nideknil.in`

---

## Endpoint 1 — Mint / Rotate Connect Token

```
POST /api/assignments/{assignment_id}/connect-token
```

`assignment_id` — the take-home assignment's ID, provided to you when the assignment is set up.

### Request

```
Content-Type: application/json
Authorization: Bearer <your API key>
```

```json
{
  "candidate_email": "candidate@example.com",
  "candidate_name": "Jane Doe"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `candidate_email` | string (email) | yes | Identifies the candidate. Calling this endpoint again with the same email (case-insensitive) reuses the same candidate record and rotates their token. |
| `candidate_name` | string | no | Defaults to the local part of the email if omitted. |

### Response — `200 OK`

```json
{
  "submission_id": 4821,
  "access_token": "8f2c1a...redacted",
  "connect_command": "claude mcp add --transport http nideknil-assignment https://api.nideknil.in/mcp/ --header \"Authorization: Bearer 8f2c1a...redacted\""
}
```

| Field | Type | Notes |
|---|---|---|
| `submission_id` | integer | Stable identifier for this candidate's assignment attempt — use this to poll status (Endpoint 2). Does not change across reconnects. |
| `access_token` | string | The fresh credential embedded in `connect_command`. Show it to the candidate only via the command — don't ask them to type it manually. |
| `connect_command` | string | Copy-paste ready. Display verbatim to the candidate; they run it in a terminal with Claude Code installed. |

**Important:** each call to this endpoint **invalidates the previously issued token** for that
candidate/assignment pair. If you re-display an old `connect_command` after minting a new one,
it will no longer work — always show the most recent response.

### Error responses

| Status | Meaning |
|---|---|
| `401 Unauthorized` | Missing/invalid/unknown API key. |
| `403 Forbidden` | The assignment does not belong to your company. |
| `404 Not Found` | `assignment_id` doesn't exist. |
| `400 Bad Request` | The assignment is closed (past deadline or manually closed). |
| `422 Unprocessable Entity` | `candidate_email` is missing or not a valid email address. |

---

## Endpoint 2 — Get Connection Status

```
GET /api/assignments/submissions/{submission_id}/connection-status
```

`submission_id` — from the Endpoint 1 response.

### Request

```
Authorization: Bearer <your API key>
```

No body.

### Response — `200 OK`

```json
{
  "connected": true,
  "connected_at": "2026-07-12T09:14:03Z",
  "last_seen_at": "2026-07-12T09:41:27Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `connected` | boolean | `true` once the candidate has successfully run the connect command at least once. |
| `connected_at` | string (ISO 8601) or `null` | Timestamp of the *first* successful connection. Null until then. |
| `last_seen_at` | string (ISO 8601) or `null` | Timestamp of the *most recent* MCP activity from this candidate. |

Polling is the only mechanism in v1 — there is no webhook yet. A poll interval of every few
seconds while the candidate is on your page is reasonable; no strict rate limit is documented,
but avoid sub-second polling.

### Error responses

| Status | Meaning |
|---|---|
| `401 Unauthorized` | Missing/invalid/unknown API key. |
| `403 Forbidden` | The submission does not belong to an assignment your company owns. |
| `404 Not Found` | `submission_id` doesn't exist. |

---

## What the candidate experiences

Running `connect_command` registers Nideknil's MCP server with their local Claude Code install.
From that point, in any Claude Code session, they can ask things like:

- *"what's the brief for this assignment?"* — returns the assignment title, brief, deadline, and
  job/company context.
- *"how do I submit?"* — returns the exact submit command for when they're done.

They build the assignment normally; no special mode. Submission (uploading their Claude Code
session transcript for AI-fluency scoring) happens separately, outside this API's scope — the
candidate either uses the submit command surfaced above or a web portal link, both independent
of this partner integration.

---

## Example: end-to-end curl sequence

```bash
API_KEY="<your api key>"
ASSIGNMENT_ID=42

# 1. Mint a token for a candidate
curl -s -X POST https://api.nideknil.in/api/assignments/$ASSIGNMENT_ID/connect-token \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"candidate_email":"jane@example.com","candidate_name":"Jane Doe"}'
# => { "submission_id": 4821, "access_token": "...", "connect_command": "claude mcp add ..." }

# 2. (Candidate runs connect_command in their terminal)

# 3. Poll status
curl -s https://api.nideknil.in/api/assignments/submissions/4821/connection-status \
  -H "Authorization: Bearer $API_KEY"
# => { "connected": true, "connected_at": "...", "last_seen_at": "..." }
```

---

## Versioning / stability note

This is a v1 contract for a pilot integration. Endpoint paths and response shapes will be kept
stable; additive fields may be introduced but existing fields will not change type or be
removed without notice.
