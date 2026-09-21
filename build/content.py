"""Turn data/content.json into a render-ready model.

Every rule for data the admin panel can produce lives here, so templates can
assume clean input: hidden and half-finished items are gone, service ids are
unique slugs, and every image points at a file that exists. Anything dropped
is reported in model.warnings instead of failing the build, because a failed
deploy is invisible from the admin panel.
"""
import json
import os
import re
from types import SimpleNamespace as NS

ICONS = {"home", "roof", "road", "fence", "building", "droplet", "star"}
ICON_ALIASES = {"concrete": "road", "commercial": "building", "soft": "droplet"}
DEFAULT_AREA = ["Whitestown"]
DEFAULT_NAME = "SudsAway ProWash"
ADMIN_NEW_STAT = "New Stat"


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")


def _s(value):
    if value is None:
        return ""
    return value.strip() if isinstance(value, str) else str(value).strip()


def _visible(items):
    return [x for x in (items or []) if isinstance(x, dict) and not x.get("hidden")]


def _strings(items):
    return [_s(x) for x in (items or []) if isinstance(x, (str, int, float)) and _s(x)]


def _first_sentence(text):
    m = re.match(r"(.+?[.!?])(\s|$)", text)
    return m.group(1) if m else text


def _clean_path(path):
    p = _s(path).replace("\\", "/").lstrip("./")
    if not p.startswith("images/") or ".." in p.split("/"):
        return None
    return p


class _Images:
    def __init__(self, root, warnings):
        self.root = root
        self.warnings = warnings

    def get(self, path, alt, where):
        raw = _s(path)
        if not raw:
            return None
        clean = _clean_path(raw)
        if not clean or not os.path.isfile(os.path.join(self.root, clean)):
            self.warnings.append(f"{where}: image not found, skipped: {raw}")
            return None
        return NS(path=clean, alt=alt, slug=None)


def _faq(items):
    out = []
    for f in _visible(items):
        q, a = _s(f.get("question")), _s(f.get("answer"))
        if q and a:
            out.append(NS(q=q, a=a))
    return out


def normalise(raw, root):
    raw = raw or {}
    warnings = []
    imgs = _Images(root, warnings)

    b = raw.get("business") or {}
    name = _s(b.get("name")) or DEFAULT_NAME
    phone = _s(b.get("phone"))
    digits = re.sub(r"\D", "", phone)
    tel = ("+1" + digits if len(digits) == 10
           else "+" + digits if len(digits) == 11 and digits.startswith("1") else "")
    area = _strings(b.get("serviceArea")) or list(DEFAULT_AREA)
    business = NS(name=name, tagline=_s(b.get("tagline")), phone=phone, tel=tel,
                  email=_s(b.get("email")), address=_s(b.get("address")),
                  hours=_s(b.get("hours")), license=_s(b.get("license")),
                  founded=b.get("yearEstablished"))

    services, used = [], set()
    for s in _visible(raw.get("services")):
        title = _s(s.get("title")) or "Service"
        base = slugify(s.get("id")) or slugify(s.get("title")) or "service"
        sid, n = base, 2
        while sid in used:
            sid, n = f"{base}-{n}", n + 1
        used.add(sid)
        desc = (_s(s.get("description"))
                or f"{title} for homes and businesses around Whitestown and Greater Indianapolis.")
        icon = _s(s.get("icon"))
        icon = ICON_ALIASES.get(icon, icon)
        services.append(NS(
            id=sid, title=title, description=desc,
            summary=_s(s.get("summary")) or _first_sentence(desc),
            intro=_s(s.get("intro")),
            steps=_strings(s.get("steps")),
            surfaces=_strings(s.get("surfaces")),
            faq=_faq(s.get("faq")),
            icon=icon if icon in ICONS else "star",
            image=imgs.get(s.get("image"), f"{title} by {name}", f"service '{sid}'"),
        ))
    titles = {s.id: s.title for s in services}

    gallery = []
    for i, g in enumerate(_visible(raw.get("gallery")), 1):
        caption, note = _s(g.get("caption")), _s(g.get("note"))
        category = _s(g.get("category"))
        category = category if category in titles else "general"
        topic = titles.get(category)
        label = caption or topic or "Recent job"
        where = f"gallery item {i}" + (f" ('{caption}')" if caption else "")
        before, after, image = _s(g.get("before")), _s(g.get("after")), _s(g.get("image"))

        if before and after and (not image or image == after):
            alt = caption or (f"{topic} before and after" if topic else f"{name} before and after")
            bi = imgs.get(before, f"{label}, before cleaning", where)
            ai = imgs.get(after, f"{label}, after cleaning", where)
            if bi and ai:
                gallery.append(NS(kind="pair", before=bi, after=ai, caption=caption, note=note,
                                  category=category, title=label, alt=alt))
                continue
            image = "" if image == after else image

        if image:
            alt = caption or (f"{topic} job photo" if topic else f"{name} job photo")
            si = imgs.get(image, alt, where)
            if si:
                gallery.append(NS(kind="single", image=si, caption=caption, note=note,
                                  category=category, title=label, alt=alt))
                continue
        warnings.append(f"{where}: skipped, no usable photo")

    afters = {g.after.path: g.after.alt for g in gallery if g.kind == "pair"}
    for s in services:
        if s.image and s.image.path in afters:
            s.image.alt = afters[s.image.path]

    testimonials = []
    for t in _visible(raw.get("testimonials")):
        who, text = _s(t.get("name")), _s(t.get("text"))
        if who and text:
            try:
                rating = max(1, min(5, int(t.get("rating") or 5)))
            except (TypeError, ValueError):
                rating = 5
            testimonials.append(NS(name=who, text=text, rating=rating, service=_s(t.get("service"))))

    stats = []
    for st in _visible(raw.get("stats")):
        label = _s(st.get("label"))
        if label and label != ADMIN_NEW_STAT:
            stats.append(NS(number=_s(st.get("number")), suffix=_s(st.get("suffix")), label=label))

    a = raw.get("about") or {}
    about = NS(headline=_s(a.get("headline")) or f"Why choose {name}?",
               description=_s(a.get("description")),
               values=[NS(title=_s(v.get("title")), description=_s(v.get("description")))
                       for v in _visible(a.get("values")) if _s(v.get("title"))])

    h = raw.get("hero") or {}
    parts = [p.strip() for p in str(h.get("headline") or "").split("\n") if p.strip()] or [name]
    hero_alt = _s(h.get("heroAlt")) or f"A recent {name} job"
    hero_img = imgs.get(h.get("heroImage"), hero_alt, "hero")
    if not hero_img:
        first_pair = next((g for g in gallery if g.kind == "pair"), None)
        if first_pair:
            hero_img = NS(path=first_pair.after.path, alt=first_pair.after.alt, slug=None)
    hero = NS(line1=parts[0], line2=" ".join(parts[1:]), sub=_s(h.get("subheadline")),
              cta=_s(h.get("cta")) or "Get your free estimate",
              trust=_strings(h.get("trustBadges")), image=hero_img)

    return NS(business=business, area=area, hero=hero, stats=stats, services=services,
              gallery=gallery, pairs=[g for g in gallery if g.kind == "pair"],
              testimonials=testimonials, faq=_faq(raw.get("faq")), about=about,
              warnings=warnings)


def referenced_images(raw):
    """Every images/ path the visible content names, for the image pipeline."""
    raw = raw or {}
    refs = [(raw.get("hero") or {}).get("heroImage")]
    refs += [s.get("image") for s in _visible(raw.get("services"))]
    for g in _visible(raw.get("gallery")):
        refs += [g.get("image"), g.get("before"), g.get("after")]
    out = []
    for r in refs:
        p = _clean_path(r)
        if p and p not in out:
            out.append(p)
    return out
