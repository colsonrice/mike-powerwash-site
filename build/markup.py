"""Small HTML building blocks shared by every page."""
import json
import re
from html import escape

PRODUCTION_BASE = "https://sudsawayprowash.com"
# Absolute URLs (canonical, Open Graph, structured data) start here; build.py points it at
# the demo URL for demo builds so link previews resolve there.
BASE = PRODUCTION_BASE


def esc(text):
    return escape(str(text or ""), quote=True)


def json_ld(data):
    # Admin text like "</script>" or "<!--<script" can end or derail the script element,
    # so markup characters are written as JSON unicode escapes, which parse back unchanged.
    text = json.dumps(data, ensure_ascii=False)
    text = text.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    return f'<script type="application/ld+json">{text}</script>'


ICON_PATHS = {
    "home": '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>',
    "roof": '<path d="M2 13l10-8 10 8"/><path d="M15 7.4V4h2.5v5.4"/><path d="M8 16l-1.2 4M12.5 16l-1.2 4M17 16l-1.2 4"/>',
    "road": '<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M2 12h20M9 3v18M15 3v18"/>',
    "fence": '<path d="M5 4v17M12 4v17M19 4v17M2 9h20M2 16h20"/>',
    "building": ('<rect x="2" y="7" width="20" height="14" rx="2"/>'
                 '<path d="M7 7V5a2 2 0 012-2h6a2 2 0 012 2v2M10 13h4"/>'),
    "droplet": '<path d="M12 2.7l5.7 5.6a8 8 0 11-11.3 0z"/>',
    "star": ('<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
    "phone": ('<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 '
              '012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 '
              '006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.9.6 2.8.7a2 2 0 011.7 2z"/>'),
    "mail": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
    "pin": '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "arrow": '<path d="M5 12h14M12 5l7 7-7 7"/>',
    "check": '<path d="M20 6L9 17l-5-5"/>',
    "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    "badge": '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>',
    "tool": ('<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.8-3.8a6 6 0 01-7.9 7.9l-6.9 '
             '6.9a2.1 2.1 0 01-3-3l6.9-6.9a6 6 0 017.9-7.9z"/>'),
    "dollar": '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    "chevron": '<path d="M6 9l6 6 6-6"/>',
    "grip": '<path d="M9 6l-5 6 5 6M15 6l5 6-5 6"/>',
}


def icon(name, cls="ic"):
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
            f'{ICON_PATHS[name]}</svg>')


def icon_for(text):
    """Pick an icon for a trust badge or value card from its wording."""
    t = (text or "").lower()
    for words, name in ((("insur", "licens"), "shield"), (("guarant", "satisf"), "badge"),
                        (("estimate", "free", "price"), "dollar"), (("equipment", "grade", "tool"), "tool"),
                        (("fast", "reliab", "time", "schedul"), "clock")):
        if any(w in t for w in words):
            return name
    return "check"


def _scaled(length, factor):
    if factor <= 1.005:
        return length
    px = re.fullmatch(r"(\d+(?:\.\d+)?)px", length)
    if px:
        return f"{round(float(px.group(1)) * factor)}px"
    return f"calc({length} * {factor:.2f})"


def sizes_attr(img, sizes):
    """Build a sizes attribute from [(media, box width, box aspect)].

    Photos fill their box with object-fit: cover, so one wider than its box is
    drawn wider than the box itself. Scaling each width by that overflow makes
    the browser pick a rendition with enough pixels instead of stretching one.
    """
    ratio = img.w / img.h if img.h else 1
    out = []
    for media, length, box in sizes:
        value = _scaled(length, max(1.0, ratio / box) if box else 1.0)
        out.append(f"{media} {value}" if media else value)
    return ", ".join(out)


def picture(img, sizes, cls="", eager=False):
    """Responsive <picture>; empty string when the image has no renditions."""
    if not img or not getattr(img, "slug", None) or not getattr(img, "widths", None):
        return ""
    src = f"/assets/img/{img.slug}"
    webp = ", ".join(f"{src}-{name}.webp {actual}w" for name, actual in img.widths)
    jpg = ", ".join(f"{src}-{name}.jpg {actual}w" for name, actual in img.widths)
    fallback = 800 if any(name == 800 for name, _ in img.widths) else img.widths[-1][0]
    s = sizes_attr(img, sizes)
    load = 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy"'
    c = f' class="{cls}"' if cls else ""
    return (f'<picture{c}><source type="image/webp" srcset="{webp}" sizes="{s}">'
            f'<img src="{src}-{fallback}.jpg" srcset="{jpg}" sizes="{s}" alt="{esc(img.alt)}" '
            f'width="{img.w}" height="{img.h}" {load} decoding="async"></picture>')


def img_url(img):
    """Absolute URL of a ~1280px JPEG, for Open Graph tags and the sitemap."""
    if not img or not getattr(img, "slug", None) or not getattr(img, "widths", None):
        return None
    names = [name for name, _ in img.widths]
    return f"{BASE}/assets/img/{img.slug}-{1280 if 1280 in names else names[-1]}.jpg"


def shot(item, sizes, extra_cls=""):
    """A gallery item: a before/after slider for pairs, a plain photo for singles."""
    cap = f'<figcaption class="shot__cap"><b>{esc(item.title)}</b>'
    cap += f'<span>{esc(item.note)}</span></figcaption>' if item.note else "</figcaption>"
    cls = f"shot {extra_cls}".strip()
    if item.kind == "pair":
        body = (
            f'<div class="ba" role="slider" tabindex="0" aria-label="{esc(item.title)}: before and after, '
            f'drag or use arrow keys to compare" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" '
            f'aria-valuetext="Half before, half after">'
            f'{picture(item.before, sizes)}{picture(item.after, sizes, cls="ba__after")}'
            f'<span class="ba__tag ba__tag--b" aria-hidden="true">Before</span>'
            f'<span class="ba__tag ba__tag--a" aria-hidden="true">After</span>'
            f'<span class="ba__handle" aria-hidden="true"><span class="ba__grip">{icon("grip", "")}</span></span>'
            f'</div>')
    else:
        body = f'<div class="shot__photo">{picture(item.image, sizes)}</div>'
    return f'<figure class="{cls}" data-cat="{esc(item.category)}">{body}{cap}</figure>'
