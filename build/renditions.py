"""Responsive renditions of the photos the site uses.

Each source under images/ becomes upright, EXIF-free JPG and WebP files at the
standard widths up to its own width, in <out>/assets/img/<slug>-<width>.<ext>.
The largest file is the native size under the next width name, so nothing is
upscaled. Renditions newer than their source are left alone, which makes local
rebuilds fast; a settings stamp forces a full redo when widths or qualities
change. CI starts from a clean checkout and renders everything.
"""
import os

from PIL import Image, ImageOps

from content import slugify

WIDTHS = (480, 800, 1280, 1920)
JPG_Q = {480: 76, 800: 74, 1280: 70, 1920: 66}
WEBP_Q = {480: 74, 800: 72, 1280: 68, 1920: 62}
SWAPS_AXES = {5, 6, 7, 8}  # EXIF orientations that rotate by 90 degrees
SETTINGS = f"{WIDTHS}{JPG_Q}{WEBP_Q}"


def widths_for(native):
    """[(file width name, actual pixel width)], stopping at the source's own width."""
    out = []
    for name in WIDTHS:
        out.append((name, min(name, native)))
        if name >= native:
            break
    return out


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
    """Write renditions for every existing source; return {path: {slug, w, h, widths}}."""
    dest = os.path.join(out_dir, "assets", "img")
    os.makedirs(dest, exist_ok=True)
    stamp = os.path.join(dest, ".settings")
    try:
        with open(stamp, encoding="utf-8") as f:
            redo_all = f.read() != SETTINGS
    except OSError:
        redo_all = True
    existing = [p for p in paths if os.path.isfile(os.path.join(root, p))]
    manifest = {}
    for path, slug in assign_slugs(existing).items():
        src = os.path.join(root, path)
        w0, h0 = oriented_size(src)
        widths = widths_for(w0)
        src_mtime = os.path.getmtime(src)
        outputs = {(name, ext): os.path.join(dest, f"{slug}-{name}.{ext}")
                   for name, _ in widths for ext in ("jpg", "webp")}
        stale = {k for k, f in outputs.items()
                 if redo_all or not os.path.exists(f) or os.path.getmtime(f) < src_mtime}
        if stale:
            with Image.open(src) as raw:
                im = _flatten(raw)
            for name, actual in widths:
                if (name, "jpg") not in stale and (name, "webp") not in stale:
                    continue
                r = im if actual == im.width else im.resize(
                    (actual, max(1, round(im.height * actual / im.width))), Image.LANCZOS)
                if (name, "jpg") in stale:
                    r.save(outputs[(name, "jpg")], "JPEG", quality=JPG_Q[name], optimize=True, progressive=True)
                if (name, "webp") in stale:
                    r.save(outputs[(name, "webp")], "WEBP", quality=WEBP_Q[name], method=6)
        manifest[path] = {"slug": slug, "w": w0, "h": h0, "widths": widths}
    with open(stamp, "w", encoding="utf-8") as f:
        f.write(SETTINGS)
    return manifest
