#!/usr/bin/env node
// nideknil-submit — submit Claude Code transcripts for a take-home assignment.
//
// Usage:
//   npx nideknil-submit <token> [options]
//
// Options:
//   --project <slug|path>   Which Claude Code project to submit (default: the
//                           project matching the current directory).
//   --repo <url>            Link to the repo you built (optional).
//   --api <url>             API base URL (default: $NIDEKNIL_API_URL or prod).
//   --yes                   Skip the confirmation prompt.
//   --dry-run               Show what would be sent; upload nothing.
//   --help                  Show this help.
//
// The command runs entirely on YOUR machine. It reads only the one project's
// transcripts, redacts secrets locally, shows you exactly what will be sent,
// and asks before uploading. Nothing is transmitted without your confirmation.

import fs from 'node:fs';
import readline from 'node:readline';
import { captureGit, listProjects, resolveProject, sessionFiles } from '../src/discover.js';
import { scrubBuffer } from '../src/scrub.js';

const DEFAULT_API = process.env.NIDEKNIL_API_URL || 'https://nideknil.in';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--project') args.project = argv[++i];
    else if (a === '--repo') args.repo = argv[++i];
    else if (a === '--api') args.api = argv[++i];
    else args._.push(a);
  }
  return args;
}

const HELP = `
nideknil-submit — submit your Claude Code transcripts for a take-home assignment

  npx nideknil-submit <token> [--project <slug|path>] [--repo <url>]
                              [--api <url>] [--yes] [--dry-run]

The <token> is in your invitation email/link (…/assignment/<token>).
Run this from inside the project folder you built the assignment in.
`;

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

  const files = sessionFiles(project);
  if (!files.length) {
    console.error(`No .jsonl transcripts in ${project.dir}`);
    process.exit(1);
  }

  // 2. Scrub locally + measure.
  console.log(`\nProject:  ${project.slug}`);
  console.log(`Sessions: ${files.length} file(s)`);
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
  console.log(`Endpoint: ${apiBase}/api/assignments/portal/${token.slice(0, 8)}…/submit`);
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
  if (args.repo) form.append('repo_url', args.repo);
  if (git) form.append('git_metadata', JSON.stringify(git));

  const url = `${apiBase}/api/assignments/portal/${token}/submit`;
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
