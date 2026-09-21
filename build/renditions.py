"""Responsive renditions of the photos the site uses.

Each source under images/ becomes upright, EXIF-free JPG and WebP files 480, 800,
and 1280 px wide in <out>/assets/img/. A source narrower than a width is emitted
at its native size under that width's name, so templates can always list all
three. Renditions newer than their source are left alone, which makes local
rebuilds fast; CI starts from a clean checkout and renders everything.
"""
import os

from PIL import Image, ImageOps

from content import slugify

WIDTHS = (480, 800, 1280)
JPG_Q = {480: 74, 800: 70, 1280: 64}
WEBP_Q = {480: 72, 800: 66, 1280: 58}
SWAPS_AXES = {5, 6, 7, 8}  # EXIF orientations that rotate by 90 degrees


def assign_slugs(paths):
    slugs, taken = {}, set()
    for p in sorted(paths):
        stem, ext = os.path.splitext(os.path.basename(p))
        base = slugify(stem) or "photo"
        slug, n = base, 2
        if slug in taken:
            slug = f"{base}-{slugify(ext)}" if slugify(ext) else f"{base}-{n}"
        while slug in taken:
            slug, n = f"{base}-{n}", n + 1
        taken.add(slug)
        slugs[p] = slug
    return slugs


def oriented_size(path):
    with Image.open(path) as im:
        w, h = im.size
        try:
            orientation = im.getexif().get(0x0112, 1)
        except Exception:
            orientation = 1
    return (h, w) if orientation in SWAPS_AXES else (w, h)


def _flatten(im):
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return im.convert("RGB")


def render(paths, root, out_dir):
    """Write renditions for every existing source; return {path: {slug, w, h}}."""
    dest = os.path.join(out_dir, "assets", "img")
    os.makedirs(dest, exist_ok=True)
    existing = [p for p in paths if os.path.isfile(os.path.join(root, p))]
    manifest = {}
    for path, slug in assign_slugs(existing).items():
        src = os.path.join(root, path)
        w0, h0 = oriented_size(src)
        src_mtime = os.path.getmtime(src)
        outputs = {(w, ext): os.path.join(dest, f"{slug}-{w}.{ext}")
                   for w in WIDTHS for ext in ("jpg", "webp")}
        stale = {k for k, f in outputs.items()
                 if not os.path.exists(f) or os.path.getmtime(f) < src_mtime}
        if stale:
            with Image.open(src) as raw:
                im = _flatten(raw)
            for w in WIDTHS:
                if (w, "jpg") not in stale and (w, "webp") not in stale:
                    continue
                tw = min(w, im.width)
                r = im if tw == im.width else im.resize((tw, max(1, round(im.height * tw / im.width))),
                                                        Image.LANCZOS)
                if (w, "jpg") in stale:
                    r.save(outputs[(w, "jpg")], "JPEG", quality=JPG_Q[w], optimize=True, progressive=True)
                if (w, "webp") in stale:
                    r.save(outputs[(w, "webp")], "WEBP", quality=WEBP_Q[w], method=6)
        manifest[path] = {"slug": slug, "w": w0, "h": h0}
    return manifest
