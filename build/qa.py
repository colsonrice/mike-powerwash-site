#!/usr/bin/env python3
"""Check a built site before it ships.

    python3 build/qa.py                                  # checks site/
    python3 build/qa.py --site /tmp/demo --base-path /sudsaway-demo

Problems fail the run (exit 1): broken local links or anchors, missing image
files, an <img> with no alt attribute, a page missing its title, description,
canonical, og:image, or exactly one h1, JSON-LD that doesn't parse, unlabelled
form fields, and colour tokens below WCAG AA. Warnings never fail: title and
description length, duplicates across pages, skipped heading levels, images
with no loading hint, and indexable pages missing from the sitemap.
site/admin/ is the CMS, not part of the public site, so it's skipped.
"""
import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (foreground, background, minimum ratio). Text pairs need 4.5:1, UI edges 3:1.
PAIRS = [
    ("--text", "--paper", 4.5), ("--muted", "--paper", 4.5), ("--muted", "--mist", 4.5),
    ("--ink", "--paper", 4.5), ("--blue-ink", "--paper", 4.5), ("--orange-ink", "--paper", 4.5),
    ("--orange-ink", "--mist", 4.5), ("--btn-ink", "--orange", 4.5), ("--btn-ink", "--orange-hover", 4.5),
    ("--on-dark", "--navy", 4.5), ("--on-dark-muted", "--navy", 4.5), ("--on-dark-muted", "--navy-deep", 4.5),
    ("--sky", "--navy", 4.5), ("--orange", "--navy", 4.5), ("--orange", "--navy-deep", 4.5),
    ("--error", "--paper", 4.5), ("--field-line", "--paper", 3.0),
]
TITLE_MAX, DESC_MIN, DESC_MAX = 60, 110, 165


def _luminance(hex_colour):
    h = hex_colour.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(int(h[i:i + 2], 16)) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    hi, lo = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def parse_tokens(css):
    block = re.search(r":root\s*\{(.*?)\}", css, re.S)
    return dict(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b", block.group(1))) if block else {}


def check_tokens(css, pairs=None):
    tokens = parse_tokens(css)
    out = []
    for fg, bg, need in (PAIRS if pairs is None else pairs):
        if fg not in tokens or bg not in tokens:
            out.append(f"css: colour token missing for {fg} on {bg}")
            continue
        ratio = contrast(tokens[fg], tokens[bg])
        if ratio < need:
            out.append(f"css: {fg} on {bg} is {ratio:.2f}:1, needs {need}:1")
    return out


class _Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.desc, self.canonical, self.og_image, self.robots = None, None, None, None, ""
        self.headings, self.imgs, self.urls, self.ids, self.ld = [], [], [], set(), []
        self.controls, self.label_for = [], set()
        self._in_title = self._in_ld = False
        self._ld_buf, self._label_depth = [], 0

    def handle_starttag(self, tag, attrs):
        a = {k: (v if v is not None else "") for k, v in attrs}
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "title":
            self._in_title, self.title = True, ""
        elif tag == "meta":
            key = (a.get("name") or a.get("property") or "").lower()
            if key == "description":
                self.desc = a.get("content", "")
            elif key == "og:image":
                self.og_image = a.get("content", "")
            elif key == "robots":
                self.robots = a.get("content", "")
        elif tag == "link" and a.get("rel", "").lower() == "canonical":
            self.canonical = a.get("href")
        elif re.fullmatch(r"h[1-6]", tag):
            self.headings.append(int(tag[1]))
        elif tag == "img":
            self.imgs.append(a)
        elif tag == "label":
            self._label_depth += 1
            if a.get("for"):
                self.label_for.add(a["for"])
        elif tag in ("input", "select", "textarea"):
            if a.get("type", "").lower() not in ("hidden", "submit", "button", "reset", "image"):
                self.controls.append((a, self._label_depth > 0))
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld, self._ld_buf = True, []

        if tag in ("a", "link", "img", "script", "source", "iframe"):
            for key in ("href", "src"):
                if a.get(key) and not (tag == "link" and a.get("rel", "").lower() in ("canonical", "preconnect")):
                    self.urls.append(a[key])
        if tag == "form" and a.get("action"):
            self.urls.append(a["action"])
        if a.get("srcset"):
            self.urls += [p.split()[0] for p in a["srcset"].split(",") if p.strip()]

    def handle_startendtag(self, tag, attrs):
        if tag != "label":
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "label":
            self._label_depth = max(0, self._label_depth - 1)
        elif tag == "script" and self._in_ld:
            self.ld.append("".join(self._ld_buf))
            self._in_ld = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_ld:
            self._ld_buf.append(data)


_parsed = {}


def _parse(path):
    if path not in _parsed:
        p = _Page()
        with open(path, encoding="utf-8") as f:
            p.feed(f.read())
        _parsed[path] = p
    return _parsed[path]


def _resolve(url, page_path, site_dir, prefix):
    """(file, fragment) for a local URL, None for external ones, or an error string."""
    u = urlparse(url)
    if u.scheme or u.netloc:
        return None
    path, frag = unquote(u.path), u.fragment
    if not path:
        return page_path, frag
    if path.startswith("/"):
        if prefix:
            if path != prefix and not path.startswith(prefix + "/"):
                return f"points outside {prefix}/"
            path = path[len(prefix):] or "/"
        target = os.path.join(site_dir, path.lstrip("/"))
    else:
        target = os.path.normpath(os.path.join(os.path.dirname(page_path), path))
    if path.endswith("/") or os.path.isdir(target):
        target = os.path.join(target, "index.html")
    return target, frag


def check_page(path, site_dir, prefix=""):
    rel = os.path.relpath(path, site_dir)
    p = _parse(path)
    probs, warns = [], []

    def prob(msg):
        probs.append(f"{rel}: {msg}")

    def warn(msg):
        warns.append(f"{rel}: {msg}")

    if not (p.title or "").strip():
        prob("missing <title>")
    elif len(p.title) > TITLE_MAX:
        warn(f"title is {len(p.title)} characters (over {TITLE_MAX} may be cut off)")
    if not (p.desc or "").strip():
        prob("missing meta description")
    elif not DESC_MIN <= len(p.desc) <= DESC_MAX:
        warn(f"meta description is {len(p.desc)} characters (ideal {DESC_MIN}-{DESC_MAX})")
    if not p.canonical:
        prob("missing canonical link")
    if not p.og_image:
        prob("missing og:image")
    h1s = p.headings.count(1)
    if h1s != 1:
        prob(f"has {h1s} <h1> elements, needs exactly one")
    for prev, cur in zip(p.headings, p.headings[1:]):
        if cur > prev + 1:
            warn(f"heading level jumps from h{prev} to h{cur}")
            break

    for img in p.imgs:
        if "alt" not in img:
            prob(f"<img> without alt: {img.get('src', '?')}")
        if "loading" not in img:
            warn(f"<img> without a loading hint: {img.get('src', '?')}")

    for url in p.urls:
        if url.startswith(("mailto:", "tel:", "data:", "javascript:")):
            continue
        res = _resolve(url, path, site_dir, prefix)
        if res is None:
            continue
        if isinstance(res, str):
            prob(f"link {res}: {url}")
            continue
        target, frag = res
        if not os.path.isfile(target):
            prob(f"broken link: {url}")
        elif frag and target.endswith(".html") and frag not in _parse(target).ids:
            prob(f"missing anchor #{frag}: {url}")

    for block in p.ld:
        try:
            json.loads(block)
        except ValueError as e:
            prob(f"JSON-LD does not parse ({e})")

    for attrs, wrapped in p.controls:
        if not (wrapped or attrs.get("aria-label") or attrs.get("aria-labelledby")
                or (attrs.get("id") and attrs["id"] in p.label_for)):
            prob(f"form field without a label: {attrs.get('name') or attrs.get('id') or '?'}")
    return probs, warns


def check_site(site_dir, prefix=""):
    _parsed.clear()
    site_dir = os.path.abspath(site_dir)
    pages = []
    for dirpath, dirnames, files in os.walk(site_dir):
        if os.path.relpath(dirpath, site_dir) == ".":
            dirnames[:] = [d for d in dirnames if d != "admin"]
        pages += [os.path.join(dirpath, f) for f in files if f.endswith(".html")]
    pages.sort()

    probs, warns = [], []
    titles, descs = {}, {}
    for page in pages:
        pp, ww = check_page(page, site_dir, prefix)
        probs += pp
        warns += ww
        parsed = _parse(page)
        rel = os.path.relpath(page, site_dir)
        if "noindex" not in parsed.robots.lower():
            titles.setdefault((parsed.title or "").strip(), []).append(rel)
            descs.setdefault((parsed.desc or "").strip(), []).append(rel)
    for text, where in titles.items():
        if text and len(where) > 1:
            warns.append(f"duplicate title on {', '.join(where)}: {text}")
    for text, where in descs.items():
        if text and len(where) > 1:
            warns.append(f"duplicate description on {', '.join(where)}")

    sitemap = os.path.join(site_dir, "sitemap.xml")
    if os.path.exists(sitemap):
        with open(sitemap, encoding="utf-8") as f:
            listed = {urlparse(u).path for u in re.findall(r"<loc>([^<]+)</loc>", f.read())}
        for page in pages:
            if "noindex" in _parse(page).robots.lower():
                continue
            rel = "/" + os.path.relpath(page, site_dir).replace(os.sep, "/")
            if (rel if rel != "/index.html" else "/") not in listed:
                warns.append(f"sitemap: {rel} is indexable but not listed")

    css = os.path.join(site_dir, "assets", "css", "site.css")
    if os.path.exists(css):
        with open(css, encoding="utf-8") as f:
            probs += check_tokens(f.read())
    else:
        probs.append("assets/css/site.css is missing")
    return probs, warns


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", default=os.path.join(ROOT, "site"))
    ap.add_argument("--base-path", default="", help="URL prefix the site is served under, e.g. /sudsaway-demo")
    args = ap.parse_args(argv)
    probs, warns = check_site(args.site, args.base_path.rstrip("/"))
    for w in warns:
        print("warning:", w)
    for p in probs:
        print("PROBLEM:", p)
    print(f"{len(probs)} problems, {len(warns)} warnings")
    return 1 if probs else 0


if __name__ == "__main__":
    sys.exit(main())
