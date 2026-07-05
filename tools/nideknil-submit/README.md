# nideknil-submit

Submit your Claude Code session transcripts for a Nideknil take-home assignment.

```bash
# From inside the project folder you built the assignment in:
npx nideknil-submit <token>
```

Your `<token>` is in your invitation link (`…/assignment/<token>`).

## What it does

1. Finds the Claude Code transcripts for **this one project** (`~/.claude/projects/<slug>/*.jsonl`) — never your whole Claude history.
2. Redacts API keys, tokens, and other secrets **on your machine, before anything is sent**, and strips embedded images.
3. Captures a small git snapshot (commit count, timestamps, recent commit subjects — no file contents).
4. Shows you exactly what will be uploaded and **asks for confirmation**.
5. Uploads to the company.

Nothing is transmitted without your explicit `y` at the prompt.

## Options

| Flag | Meaning |
|---|---|
| `--project <slug\|path>` | Choose the project explicitly instead of auto-detecting from the current directory. |
| `--repo <url>` | Link to the repository you built. |
| `--api <url>` | Override the API base URL (or set `NIDEKNIL_API_URL`). |
| `--dry-run` | Show what would be sent, upload nothing. |
| `--yes` | Skip the confirmation prompt. |
| `--help` | Show usage. |

## Privacy

- Runs entirely on your machine with your own file permissions — this is not remote access.
- Only the project you select is read. Secrets are redacted locally first; the server redacts again as a safeguard.
- Requires Node.js 18 or newer.
