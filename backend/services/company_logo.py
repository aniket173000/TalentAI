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

import json
import logging
import re
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

_UA = "Mozilla/5.0 (compatible; TalentAI-LogoBot/1.0)"
_CLEARBIT = "https://logo.clearbit.com/{}"
# Keyless name→domain+logo providers
_CLEARBIT_SUGGEST = "https://autocomplete.clearbit.com/v1/companies/suggest?query={}"
_HIPOLABS = "https://universities.hipolabs.com/search?name={}"
# Keyless, always-on fallback: returns the site's favicon at the requested size.
_S2_FAVICON = "https://www.google.com/s2/favicons?sz=128&domain={}"
# Optional premium provider (used first only when a client id is configured)
_BRANDFETCH_SEARCH = "https://api.brandfetch.io/v2/search/{}?c={}"
_BRANDFETCH_CDN = "https://cdn.brandfetch.io/{}/w/256/h/256?c={}"


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


def _get_json(url: str, timeout: float = 4.0):
    """GET a JSON document. Returns parsed value or None on any error."""
    try:
        req = Request(url)
        req.add_header("User-Agent", _UA)
        req.add_header("Accept", "application/json")
        with urlopen(req, timeout=timeout) as r:
            return json.loads(r.read(200_000).decode("utf-8", errors="ignore"))
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

    # 1. Brandfetch CDN (highest quality) — only when a client id is configured.
    bf = _brandfetch_cdn_for(hostname)
    if bf:
        logger.info("Logo resolved via Brandfetch: %s", bf)
        return bf

    # 2. Clearbit (legacy; may be unavailable since HubSpot's sunset — fast-fails)
    clearbit = _CLEARBIT.format(hostname)
    if _head_ok(clearbit):
        logger.info("Logo resolved via Clearbit: %s", clearbit)
        return clearbit

    # 3. Scrape homepage for apple-touch-icon / og:image (real, crisp logo)
    html = _get_html(origin)
    if html:
        icon = _extract_icon(html, origin)
        if icon and _head_ok(icon, timeout=3.0):
            logger.info("Logo resolved via HTML scrape: %s", icon)
            return icon

    # 4. favicon.ico
    favicon = f"{origin}/favicon.ico"
    if _head_ok(favicon):
        logger.info("Logo resolved via favicon.ico: %s", favicon)
        return favicon

    # 5. Google's favicon service — keyless, always returns a clean icon for any
    #    reachable domain. Guarantees a logo shows rather than a blank fallback.
    s2 = _S2_FAVICON.format(hostname)
    if _head_ok(s2):
        logger.info("Logo resolved via Google S2 favicon: %s", s2)
        return s2

    return None


# ── Name → brand (logo + official website) ────────────────────────────────────

def _domain_to_site(domain: str) -> str:
    d = domain.strip()
    d = re.sub(r"^https?://", "", d, flags=re.IGNORECASE).strip("/")
    return f"https://{d}"


def _brandfetch_client_id() -> str:
    try:
        from config import settings
        return settings.BRANDFETCH_CLIENT_ID or ""
    except Exception:
        return ""


def _brandfetch_cdn_for(hostname: str) -> str | None:
    """Brandfetch logo-link CDN for a hostname — only when a client id is set."""
    cid = _brandfetch_client_id()
    if not cid or not hostname:
        return None
    url = _BRANDFETCH_CDN.format(re.sub(r"^www\.", "", hostname), cid)
    return url if _head_ok(url) else None


def _brandfetch(name: str) -> dict | None:
    """Premium path: Brandfetch search → {logo_url, website_url}. Keyed; opt-in."""
    try:
        from config import settings
        cid = settings.BRANDFETCH_CLIENT_ID
    except Exception:
        cid = ""
    if not cid:
        return None
    data = _get_json(_BRANDFETCH_SEARCH.format(quote(name), cid))
    if not isinstance(data, list) or not data:
        return None
    top = data[0]
    domain = (top.get("domain") or "").strip()
    if not domain:
        return None
    logo = top.get("icon") or _BRANDFETCH_CDN.format(domain, cid)
    return {"logo_url": logo, "website_url": _domain_to_site(domain)}


def _resolve_company_by_name(name: str) -> dict | None:
    """Keyless: Clearbit autocomplete → {logo_url, website_url} for a company."""
    data = _get_json(_CLEARBIT_SUGGEST.format(quote(name)))
    if not isinstance(data, list) or not data:
        return None
    # Prefer an exact (case-insensitive) name match, else the first suggestion.
    low = name.strip().lower()
    top = next((d for d in data if (d.get("name") or "").strip().lower() == low), data[0])
    domain = (top.get("domain") or "").strip()
    if not domain:
        return None
    # Clearbit's autocomplete dropped its `logo` field post-sunset, so resolve a
    # working logo from the domain (Brandfetch → favicon → Google S2).
    logo = top.get("logo") or resolve_company_logo(_domain_to_site(domain))
    return {"logo_url": logo, "website_url": _domain_to_site(domain)}


def _resolve_university_by_name(name: str) -> dict | None:
    """Keyless: Hipolabs Universities API → official domain, then logo chain."""
    data = _get_json(_HIPOLABS.format(quote(name)))
    if not isinstance(data, list) or not data:
        return None
    low = name.strip().lower()
    top = next(
        (d for d in data if (d.get("name") or "").strip().lower() == low),
        data[0],
    )
    web_pages = top.get("web_pages") or []
    domains = top.get("domains") or []
    website = web_pages[0] if web_pages else (_domain_to_site(domains[0]) if domains else None)
    if not website:
        return None
    logo = resolve_company_logo(website)
    return {"logo_url": logo, "website_url": website}


def resolve_brand_by_name(name: str, kind: str = "company") -> dict:
    """
    Resolve a logo + official website from just a NAME (no URL needed) — the
    "type a name, get the right logo and link" behaviour.

    kind="company"   → Brandfetch (if keyed) → Clearbit autocomplete
    kind="college"   → Brandfetch (if keyed) → Hipolabs universities → logo chain

    Always returns a dict: {"logo_url": str|None, "website_url": str|None}.
    Best-effort and network-tolerant — never raises.
    """
    out = {"logo_url": None, "website_url": None}
    if not name or not name.strip():
        return out

    try:
        result = _brandfetch(name)
        if not result:
            if kind in ("college", "university", "school"):
                result = _resolve_university_by_name(name) or _resolve_company_by_name(name)
            else:
                result = _resolve_company_by_name(name)
        if result:
            # Confirm the logo is actually reachable before trusting it.
            logo = result.get("logo_url")
            if logo and _head_ok(logo):
                out["logo_url"] = logo
            out["website_url"] = result.get("website_url")
            logger.info("Brand resolved by name %r (%s): %s", name, kind, out)
    except Exception as exc:  # noqa: BLE001
        logger.warning("resolve_brand_by_name failed for %r: %s", name, exc)
    return out
