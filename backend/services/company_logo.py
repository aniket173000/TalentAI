"""
Resolve the best publicly-accessible logo URL for a company given its website
or LinkedIn URL.

Resolution chain (stops at first success):
  1. Clearbit Logo API  — high-quality, covers thousands of companies
  2. apple-touch-icon / og:image scraped from the homepage HTML
  3. /favicon.ico

LinkedIn URLs are handled specially: the company slug is extracted and tried
against Clearbit with common TLDs (.com, .io, .co, .net, .org, .app).

Returns None if nothing is found or the URL is unreachable.
"""

import logging
import re
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

_UA = "Mozilla/5.0 (compatible; TalentAI-LogoBot/1.0)"
_CLEARBIT = "https://logo.clearbit.com/{}"


def _head_ok(url: str, timeout: float = 3.0) -> bool:
    """Return True if a HEAD request to `url` succeeds (status < 400)."""
    try:
        req = Request(url, method="HEAD")
        req.add_header("User-Agent", _UA)
        with urlopen(req, timeout=timeout) as r:
            return r.status < 400
    except Exception:
        return False


def _get_html(url: str, max_bytes: int = 60_000, timeout: float = 5.0) -> str | None:
    """Fetch up to `max_bytes` of HTML from `url`. Returns None on any error."""
    try:
        req = Request(url)
        req.add_header("User-Agent", _UA)
        with urlopen(req, timeout=timeout) as r:
            return r.read(max_bytes).decode("utf-8", errors="ignore")
    except Exception:
        return None


# Ordered by quality: apple-touch-icon (usually 180×180+) > og:image > high-res icon
_ICON_PATTERNS = [
    r'<link[^>]+rel=["\']apple-touch-icon(?:-precomposed)?["\'][^>]+href=["\']([^"\']+)["\']',
    r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']apple-touch-icon(?:-precomposed)?["\']',
    r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
    r'<link[^>]+rel=["\']icon["\'][^>]+sizes=["\'](?:192|180|128|96|64)[^"\']*["\'][^>]+href=["\']([^"\']+)["\']',
    r'<link[^>]+sizes=["\'](?:192|180|128|96|64)[^"\']*["\'][^>]+rel=["\']icon["\'][^>]+href=["\']([^"\']+)["\']',
]


def _extract_icon(html: str, base_url: str) -> str | None:
    for pat in _ICON_PATTERNS:
        m = re.search(pat, html, re.IGNORECASE)
        if m:
            href = m.group(1).strip()
            if href and not href.startswith("data:"):
                return urljoin(base_url, href)
    return None


def resolve_company_logo(company_url: str) -> str | None:
    """
    Given a company website or LinkedIn URL, return the best logo URL we can
    find, or None if nothing is accessible.
    """
    if not company_url or not company_url.strip():
        return None

    url = company_url.strip()
    if not url.startswith("http"):
        url = f"https://{url}"

    try:
        parsed = urlparse(url)
    except Exception:
        return None

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return None

    # ── LinkedIn: extract company or school slug, try common TLDs on Clearbit ──
    if "linkedin.com" in hostname:
        # Matches both /company/<slug> and /school/<slug>
        m = re.search(r"linkedin\.com/(?:company|school)/([^/?#]+)", url)
        if not m:
            return None
        slug = m.group(1).rstrip("/")
        for tld in (".com", ".edu", ".ac.in", ".io", ".co", ".net", ".org", ".app"):
            candidate = _CLEARBIT.format(f"{slug}{tld}")
            if _head_ok(candidate):
                logger.info("LinkedIn logo resolved via Clearbit: %s", candidate)
                return candidate
        return None

    # ── Regular website ─────────────────────────────────────────────────────
    origin = f"{parsed.scheme}://{hostname}"

    # 1. Clearbit (best quality; HEAD is fast)
    clearbit = _CLEARBIT.format(hostname)
    if _head_ok(clearbit):
        logger.info("Logo resolved via Clearbit: %s", clearbit)
        return clearbit

    # 2. Scrape homepage for apple-touch-icon / og:image
    html = _get_html(origin)
    if html:
        icon = _extract_icon(html, origin)
        if icon and _head_ok(icon, timeout=3.0):
            logger.info("Logo resolved via HTML scrape: %s", icon)
            return icon

    # 3. favicon.ico
    favicon = f"{origin}/favicon.ico"
    if _head_ok(favicon):
        logger.info("Logo resolved via favicon.ico: %s", favicon)
        return favicon

    return None
