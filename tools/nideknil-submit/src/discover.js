// Locate Claude Code transcripts and capture git metadata — all from the
// candidate's machine, scoped to ONE project.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// Claude Code encodes a project's working directory as a folder name by
// replacing '/' and '.' with '-'. e.g. /Users/x/proj/.claude → -Users-x-proj--claude
export function slugForCwd(cwd) {
  return cwd.replace(/[/.]/g, '-');
}

export function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(PROJECTS_DIR, d.name);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
      let mtime = 0;
      for (const f of files) {
        const st = fs.statSync(path.join(dir, f));
        if (st.mtimeMs > mtime) mtime = st.mtimeMs;
      }
      return { slug: d.name, dir, sessionCount: files.length, mtime };
    })
    .filter((p) => p.sessionCount > 0)
    .sort((a, b) => b.mtime - a.mtime);
}

// Resolve which project to submit: explicit --project wins; else the cwd's
// slug; else null (caller prompts to pick from listProjects()).
export function resolveProject(cwd, override) {
  const projects = listProjects();
  if (override) {
    const match = projects.find((p) => p.slug === override || p.dir === override);
    if (match) return match;
    // Allow passing a raw directory path too.
    if (fs.existsSync(override)) {
      const files = fs.readdirSync(override).filter((f) => f.endsWith('.jsonl'));
      if (files.length) return { slug: path.basename(override), dir: override, sessionCount: files.length };
    }
    return null;
  }
  const slug = slugForCwd(cwd);
  return projects.find((p) => p.slug === slug) || null;
}

export function sessionFiles(project) {
  return fs.readdirSync(project.dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = path.join(project.dir, f);
      const st = fs.statSync(full);
      return { name: f, path: full, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime);
}

// Keep only sessions last modified within [since, until] (either bound
// optional, both inclusive, values in ms since epoch).
export function filterSessionsByDate(files, since, until) {
  return files.filter((f) => {
    if (since != null && f.mtime < since) return false;
    if (until != null && f.mtime > until) return false;
    return true;
  });
}

// Bounded git snapshot from the current repo. No file contents — only history
// shape, used server-side for the git↔transcript integrity correlation.
export function captureGit(cwd) {
  const git = (args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
  }).trim();

  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return null; // not a git repo — fine, just no git signal
  }

  try {
    const log = git(['log', '--pretty=format:%H|%at|%s', '-n', '200']);
    const lines = log ? log.split('\n') : [];
    const commits = lines.map((l) => {
      const [hash, at, ...rest] = l.split('|');
      return { hash: (hash || '').slice(0, 10), at: Number(at) || 0, subject: rest.join('|').slice(0, 120) };
    }).filter((c) => c.at);

    // Count tracked files across the whole repo, not just cwd — ls-files is
    // cwd-scoped, so run it from the repository toplevel.
    let fileCount = 0;
    try {
      const top = git(['rev-parse', '--show-toplevel']);
      fileCount = execFileSync('git', ['-C', top, 'ls-files'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
      }).split('\n').filter(Boolean).length;
    } catch { /* empty */ }

    const times = commits.map((c) => c.at).filter(Boolean);
    return {
      commit_count: commits.length,
      first_commit_ts: times.length ? Math.min(...times) : null,
      last_commit_ts: times.length ? Math.max(...times) : null,
      file_count: fileCount,
      recent_subjects: commits.slice(0, 15).map((c) => c.subject),
      branch: (() => { try { return git(['rev-parse', '--abbrev-ref', 'HEAD']); } catch { return null; } })(),
    };
  } catch {
    return null;
  }
}
