#!/usr/bin/env python3
"""Build the SudsAway ProWash site from data/content.json into site/.

    python3 build/build.py                  # repo content -> site/
    python3 build/build.py --out /tmp/x     # anywhere else
    python3 build/build.py --demo-url https://example.com/sudsaway-demo --out /tmp/demo
                                            # noindex demo copy for a subfolder, without /admin
"""
import argparse
import datetime
import hashlib
import os
import re
import shutil
import sys
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import content  # noqa: E402
import layout  # noqa: E402
import pages  # noqa: E402
import renditions  # noqa: E402
import seo  # noqa: E402
import markup  # noqa: E402
from markup import img_url  # noqa: E402


def _short_hash(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def _clean(out):
    """Empty the output folder but keep image renditions, which are slow to redo."""
    os.makedirs(out, exist_ok=True)
    for entry in os.listdir(out):
        p = os.path.join(out, entry)
        if entry == "assets":
            for sub in os.listdir(p):
                if sub != "img":
                    q = os.path.join(p, sub)
                    shutil.rmtree(q) if os.path.isdir(q) else os.remove(q)
        elif os.path.isdir(p):
            shutil.rmtree(p)
        else:
            os.remove(p)


def _images_in(m):
    yield m.hero.image
    for s in m.services:
        yield s.image
    for g in m.gallery:
        yield from ((g.before, g.after) if g.kind == "pair" else (g.image,))


_ROOTED_ATTR = re.compile(r'(\s(?:href|src|action)=")/(?!/)')
_SRCSET = re.compile(r'(\ssrcset=")([^"]*)(")')


def rebase(html, prefix):
    """Prefix root-relative URLs so a build works from a subfolder like /sudsaway-demo/."""
    html = _ROOTED_ATTR.sub(lambda m: m.group(1) + prefix + "/", html)

    def fix(m):
        parts = [p.strip() for p in m.group(2).split(",")]
        return m.group(1) + ", ".join(prefix + p if p.startswith("/") else p for p in parts) + m.group(3)
    return _SRCSET.sub(fix, html)


def _write(out, path, text):
    dest = os.path.join(out, path.lstrip("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(text)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--content", default=os.path.join(ROOT, "data", "content.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "site"))
    ap.add_argument("--root", default=ROOT, help="repo folder that holds images/, admin/, assets/")
    ap.add_argument("--demo-url", help="public URL of a noindex demo copy, e.g. https://example.com/sudsaway-demo")
    args = ap.parse_args(argv)
    demo = args.demo_url.rstrip("/") if args.demo_url else None
    prefix = urlparse(demo).path.rstrip("/") if demo else ""
    layout.NOINDEX_ALL = bool(demo)
    markup.BASE = demo or markup.PRODUCTION_BASE
    pages.FORM_NEXT = markup.BASE + "/thanks.html"

    raw = content.load(args.content)
    m = content.normalise(raw, args.root)
    for w in m.warnings:
        print("warning:", w)

    _clean(args.out)
    manifest = renditions.render(content.referenced_images(raw), args.root, args.out)
    for img in _images_in(m):
        if img and img.path in manifest:
            info = manifest[img.path]
            img.slug, img.w, img.h, img.widths = info["slug"], info["w"], info["h"], info["widths"]

    shutil.copytree(os.path.join(args.root, "assets"), os.path.join(args.out, "assets"), dirs_exist_ok=True)
    if demo:
        # The admin writes to the real repo, so a demo leaves it out, along with the full-size originals.
        os.makedirs(os.path.join(args.out, "images"))
        for name in ("logo.svg", "favicon.ico"):
            shutil.copy2(os.path.join(args.root, "images", name), os.path.join(args.out, "images", name))
    else:
        # The admin's photo previews load ../images/<file> from the published site.
        shutil.copytree(os.path.join(args.root, "admin"), os.path.join(args.out, "admin"))
        shutil.copytree(os.path.join(args.root, "images"), os.path.join(args.out, "images"))
    layout.VERSIONS["css"] = _short_hash(os.path.join(args.out, "assets", "css", "site.css"))
    layout.VERSIONS["js"] = _short_hash(os.path.join(args.out, "assets", "js", "site.js"))

    m.year = datetime.date.today().year
    m.og_default = img_url(m.hero.image)

    built = pages.render_all(m)
    for p in built:
        _write(args.out, p.path, rebase(p.html, prefix) if prefix else p.html)

    _write(args.out, "/.nojekyll", "")
    if demo:
        _write(args.out, "/robots.txt", "User-agent: *\nDisallow: /\n")
    else:
        indexed = [{"loc": "/" if p.path == "/index.html" else p.path, "images": p.images}
                   for p in built if p.indexed]
        _write(args.out, "/sitemap.xml", seo.sitemap(indexed, markup.BASE, datetime.date.today().isoformat()))
        _write(args.out, "/robots.txt", seo.robots(markup.BASE))
        _write(args.out, "/llms.txt", seo.llms(m, markup.BASE))

    print(f"built {len(built)} pages, {len(manifest)} photos -> {os.path.relpath(args.out, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
