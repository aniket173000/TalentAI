// Local secret scrubbing — a JS port of the server's backend scrubber so
// credentials are redacted on the candidate's machine BEFORE upload. The server
// scrubs again as defense in depth; this is the trust story ("nothing secret
// leaves your laptop").

const REDACTED = '[REDACTED_SECRET]';

const SIMPLE = [
  /sk-ant-[A-Za-z0-9_\-]{20,}/g, // must run before generic sk-
  /sk-[A-Za-z0-9_\-]{20,}/g,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /xox[baprs]-[A-Za-z0-9\-]{10,}/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
  /AKIA[0-9A-Z]{16}/g,
  /rzp_(?:live|test)_[A-Za-z0-9]{10,}/g,
  /pk_(?:live|test)_[A-Za-z0-9]{20,}/g,
  /whsec_[A-Za-z0-9]{20,}/g,
  /ntn_[A-Za-z0-9]{30,}/g,
  /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

const CONN = /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/[^\s:/@"']+):([^\s@"']+)@/gi;

const ENV = /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|ACCESS_KEY|AUTH_TOKEN|PRIVATE_KEY|CLIENT_SECRET|SIGNING_KEY)[A-Z0-9_]*)(\s*[=:]\s*)(["']?)([^\s"',;]{8,})(\3)/gi;

const IMAGE_DATA = /("data"\s*:\s*")[A-Za-z0-9+/=]{512,}(")/g;
const LONG_BASE64 = /[A-Za-z0-9+/]{2048,}={0,2}/g;

export function scrubLine(line) {
  let n = 0;
  let out = line;

  out = out.replace(IMAGE_DATA, '$1[IMAGE_STRIPPED]$2');
  out = out.replace(LONG_BASE64, '[BINARY_STRIPPED]');

  for (const re of SIMPLE) {
    out = out.replace(re, () => { n++; return REDACTED; });
  }
  out = out.replace(CONN, (_m, proto) => { n++; return `${proto}:${REDACTED}@`; });
  out = out.replace(ENV, (_m, key, sep, q, _val, q2) => { n++; return `${key}${sep}${q}${REDACTED}${q2}`; });

  return { line: out, redactions: n };
}

// Scrub a whole transcript buffer, line by line (JSONL is one record per line).
export function scrubBuffer(buf) {
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  let secrets = 0;
  const scrubbed = lines.map((l) => {
    const { line, redactions } = scrubLine(l);
    secrets += redactions;
    return line;
  });
  return { buffer: Buffer.from(scrubbed.join('\n'), 'utf8'), secrets };
}
