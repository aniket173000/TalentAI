#!/usr/bin/env node
// nideknil-submit — submit Claude Code transcripts for a take-home assignment.
//
// Usage:
//   npx nideknil-submit <token> [options]
//
// Options:
//   --project <slug|path>   Which Claude Code project to submit (default: the
//                           project matching the current directory).
//   --since <YYYY-MM-DD>    Only include sessions modified on/after this date.
//   --until <YYYY-MM-DD>    Only include sessions modified on/before this date.
//   --repo <url>            Link to the repo you built (optional).
//   --api <url>             API base URL (default: $NIDEKNIL_API_URL or prod).
//   --yes                   Skip the confirmation prompt.
//   --dry-run               Show what would be sent; upload nothing.
//   --help                  Show this help.
//
// The command runs entirely on YOUR machine. It reads only the one project's
// transcripts, redacts secrets locally, shows you exactly what will be sent,
// and asks before uploading. Nothing is transmitted without your confirmation.
// If a project has multiple sessions and you didn't pass --since/--until, you
// will be prompted to pick which sessions actually belong to this assignment.

import fs from 'node:fs';
import readline from 'node:readline';
import { captureGit, filterSessionsByDate, listProjects, resolveProject, sessionFiles } from '../src/discover.js';
import { scrubBuffer } from '../src/scrub.js';

// NOTE: this must be the API host, NOT the frontend SPA domain. nideknil.in /
// www.nideknil.in are Vercel-hosted static hosting (frontend/vercel.json
// rewrites every GET to index.html and 405s any POST) — the real backend is
// a separate host, api.nideknil.in.
const DEFAULT_API = process.env.NIDEKNIL_API_URL || 'https://api.nideknil.in';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--project') args.project = argv[++i];
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--until') args.until = argv[++i];
    else if (a === '--repo') args.repo = argv[++i];
    else if (a === '--api') args.api = argv[++i];
    // Destination is normally detected from the token; these force it.
    else if (a === '--pulse') args.pulse = true;
    else if (a === '--assignment') args.assignment = true;
    else if (a === '--note') args.note = argv[++i]; // optional "what I worked on" (Pulse)
    else args._.push(a);
  }
  return args;
}

const HELP = `
nideknil-submit — submit your Claude Code transcripts for review

  npx nideknil-submit <token> [--project <slug|path>]
                              [--since <YYYY-MM-DD>] [--until <YYYY-MM-DD>]
                              [--repo <url>] [--note <text>]
                              [--api <url>] [--yes] [--dry-run]

The <token> is in your invitation email/link. It works for both a take-home
assignment (…/assignment/<token>) and a Nideknil Pulse seat
(…/pulse/portal/<token>) — the command detects which one it belongs to, so
there is nothing to choose. Pass --pulse or --assignment to force it.

Run this from inside the project folder the work happened in.

  --repo <url>   link the repo you built (assignments only)
  --note <text>  what you worked on this period (Pulse only)

If that project folder has sessions from unrelated work too, use --since/
--until to only include the ones from when you actually built this
assignment, or answer the prompt shown when multiple sessions are found.
`;

// Assignment tokens and Pulse seat tokens look identical, so the product a
// token belongs to cannot be read off the string. Ask the API which portal
// resolves it rather than making the person remember a flag: submitting a
// Pulse token to the assignments endpoint just 404s with nothing to act on.
// --pulse / --assignment skip the probe when you already know.
async function resolveSubmitPath(apiBase, token, args) {
  if (args.pulse) return 'pulse/portal';
  if (args.assignment) return 'assignments/portal';

  const probe = async (path) => {
    try {
      const res = await fetch(`${apiBase}/api/${path}/${token}`);
      return res.ok;
    } catch {
      return null;   // network/DNS failure — distinct from "token not found"
    }
  };

  const [isAssignment, isPulse] = await Promise.all([
    probe('assignments/portal'), probe('pulse/portal'),
  ]);

  if (isAssignment) return 'assignments/portal';
  if (isPulse) return 'pulse/portal';
  if (isAssignment === null && isPulse === null) {
    console.error(`Could not reach ${apiBase}. Check your connection, or pass --api.`);
    process.exit(1);
  }
  console.error(
    `That token isn't valid for an assignment or a Pulse seat.\n` +
    `Check you copied the whole token from your invite link, and that the\n` +
    `assignment or reporting period is still open.`,
  );
  process.exit(1);
}

function fmtBytes(n) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => { rl.close(); resolve(/^y(es)?$/i.test(ans.trim())); });
  });
}

async function pickProject() {
  const projects = listProjects();
  if (!projects.length) {
    console.error('No Claude Code projects found under ~/.claude/projects/.');
    process.exit(1);
  }
  console.log('\nWhich project did you build this assignment in?\n');
  projects.slice(0, 15).forEach((p, i) => {
    const when = p.mtime ? new Date(p.mtime).toLocaleDateString() : '';
    console.log(`  ${String(i + 1).padStart(2)}. ${p.slug}  (${p.sessionCount} sessions, last ${when})`);
  });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question('\nEnter a number: ', (a) => { rl.close(); r(a); }));
  const idx = Number(answer.trim()) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= projects.length) {
    console.error('Invalid selection.');
    process.exit(1);
  }
  return projects[idx];
}

// Parse "YYYY-MM-DD" as a day boundary in local time. `endOfDay` pushes the
// timestamp to 23:59:59.999 so a bare date used as --until is inclusive of
// the whole day, not just midnight.
function parseDayBoundary(dateStr, endOfDay) {
  const ms = new Date(dateStr).getTime();
  if (Number.isNaN(ms)) return null;
  return endOfDay ? ms + 24 * 60 * 60 * 1000 - 1 : ms;
}

async function pickSessions(files) {
  console.log(`\nFound ${files.length} sessions in this project — some may be from unrelated work.\n`);
  files.forEach((f, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${new Date(f.mtime).toLocaleString()}  ${f.name}  (${fmtBytes(f.size)})`);
  });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question(
    '\nWhich sessions actually built this assignment?\n' +
    '  Enter numbers (e.g. 3,4,5), a date (YYYY-MM-DD), a date range (YYYY-MM-DD:YYYY-MM-DD),\n' +
    '  or press Enter to include all of them: ', (a) => { rl.close(); r(a.trim()); },
  ));
  if (!answer) return files;

  const rangeMatch = answer.match(/^(\d{4}-\d{2}-\d{2})(?::(\d{4}-\d{2}-\d{2}))?$/);
  if (rangeMatch) {
    const since = parseDayBoundary(rangeMatch[1], false);
    const until = parseDayBoundary(rangeMatch[2] || rangeMatch[1], true);
    const picked = filterSessionsByDate(files, since, until);
    if (!picked.length) {
      console.error('No sessions match that date/range.');
      process.exit(1);
    }
    return picked;
  }

  const idxs = answer.split(',').map((s) => Number(s.trim()) - 1);
  if (idxs.some((i) => Number.isNaN(i) || i < 0 || i >= files.length)) {
    console.error('Invalid selection.');
    process.exit(1);
  }
  return idxs.map((i) => files[i]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }

  const token = args._[0];
  const apiBase = (args.api || DEFAULT_API).replace(/\/+$/, '');
  const cwd = process.cwd();

  // 1. Resolve the project (scoped — never the whole ~/.claude history).
  let project = resolveProject(cwd, args.project);
  if (!project) {
    if (args.project) {
      console.error(`No Claude Code project matched "${args.project}".`);
      process.exit(1);
    }
    console.log(`\nNo project matched this directory (${cwd}).`);
    project = await pickProject();
  }

  const allFiles = sessionFiles(project);
  if (!allFiles.length) {
    console.error(`No .jsonl transcripts in ${project.dir}`);
    process.exit(1);
  }

  // 1b. Narrow to the sessions that actually built this assignment. Explicit
  // --since/--until wins non-interactively; otherwise, with more than one
  // session found, ask (a project folder often has unrelated work mixed in).
  let files = allFiles;
  if (args.since || args.until) {
    const since = args.since ? parseDayBoundary(args.since, false) : null;
    const until = args.until ? parseDayBoundary(args.until, true) : null;
    files = filterSessionsByDate(allFiles, since, until);
    if (!files.length) {
      console.error(`No sessions between ${args.since || '(start)'} and ${args.until || '(now)'}.`);
      process.exit(1);
    }
  } else if (allFiles.length > 1) {
    files = await pickSessions(allFiles);
  }

  // 2. Scrub locally + measure.
  console.log(`\nProject:  ${project.slug}`);
  console.log(`Sessions: ${files.length} of ${allFiles.length} file(s) selected`);
  const prepared = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalSecrets = 0;
  for (const f of files) {
    const raw = fs.readFileSync(f.path);
    const { buffer, secrets } = scrubBuffer(raw);
    totalIn += raw.length;
    totalOut += buffer.length;
    totalSecrets += secrets;
    prepared.push({ name: f.name, buffer, size: buffer.length, mtime: f.mtime });
  }

  const times = files.map((f) => f.mtime).filter(Boolean);
  const range = times.length
    ? `${new Date(Math.min(...times)).toLocaleString()} → ${new Date(Math.max(...times)).toLocaleString()}`
    : 'unknown';

  // 3. Git snapshot (bounded; history shape only, no file contents).
  const git = captureGit(cwd);

  // 4. Show exactly what will be sent, then confirm.
  console.log(`Window:   ${range}`);
  console.log(`Size:     ${fmtBytes(totalOut)} (after stripping images/binaries)`);
  console.log(`Secrets:  ${totalSecrets} redacted locally before upload`);
  if (git) {
    console.log(`Git:      ${git.commit_count} commits, ${git.file_count} files, branch ${git.branch || '?'}`);
  } else {
    console.log('Git:      not a git repo (no git metadata will be sent)');
  }
  const submitPath = await resolveSubmitPath(apiBase, token, args);
  const isPulse = submitPath === 'pulse/portal';
  console.log(`Sending to: ${isPulse ? 'Nideknil Pulse (team report)' : 'a take-home assignment'}`);
  console.log(`Endpoint: ${apiBase}/api/${submitPath}/${token.slice(0, 8)}…/submit`);
  console.log('\nFiles to send:');
  prepared.forEach((p) => console.log(`  • ${p.name}  ${fmtBytes(p.size)}`));

  if (args.dryRun) {
    console.log('\n[dry-run] Nothing was uploaded.');
    return;
  }

  console.log('\nThis will upload the files above (secrets already removed) to the company.');
  const ok = args.yes || (await confirm('Proceed? [y/N] '));
  if (!ok) {
    console.log('Cancelled. Nothing was sent.');
    process.exit(0);
  }

  // 5. Upload via the same endpoint the web portal uses.
  const form = new FormData();
  for (const p of prepared) {
    form.append('files', new Blob([p.buffer], { type: 'application/jsonl' }), p.name);
  }
  form.append('consent', 'true');
  form.append('submit_source', 'cli');
  // Field names differ per endpoint — keyed off the resolved path, not the flag.
  if (args.repo && !isPulse) form.append('repo_url', args.repo);
  if (args.note && isPulse) form.append('work_note', args.note);
  if (git) form.append('git_metadata', JSON.stringify(git));

  const url = `${apiBase}/api/${submitPath}/${token}/submit`;
  process.stdout.write('\nUploading… ');
  let res;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch (err) {
    console.error(`\nNetwork error: ${err.message}\nCheck your connection or pass --api <url>.`);
    process.exit(1);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body.detail) detail = body.detail; } catch { /* noop */ }
    console.error(`\nSubmission failed: ${detail}`);
    process.exit(1);
  }

  console.log('done.');
  console.log('\n✓ Assignment submitted. You can close this terminal — nothing more to do.');
}

main().catch((err) => {
  console.error(`\nUnexpected error: ${err.message}`);
  process.exit(1);
});
