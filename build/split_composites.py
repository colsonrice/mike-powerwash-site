#!/usr/bin/env python3
"""Split the before/after composites into separate before and after photos.

The composites came out of a before/after phone app: two photos in a white frame
with "Before", "After", and the app's badge printed on them. The site's sliders
add their own labels, so the printed ones are cropped off. Both halves get the
same crop box so the two photos line up in the slider.

Run once; it overwrites its outputs. The composites themselves stay in images/.
"""
import os

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, "images")

# output name: (composite, before rect, after rect, crop (l, t, r, b) as fractions of a half)
# Rects are the photo areas inside the white frame, measured from the files.
JOBS = {
    "siding-soft-wash": ("work-1.png", (37, 37, 2008, 1004), (37, 1042, 2008, 2009), (0, 0, .96, 1)),
    "roof-soft-wash": ("work-2.jpg", (37, 37, 1960, 1480), (37, 1517, 1960, 2959), (0, .11, 1, .89)),
    "driveway-wash": ("gallery-2-1773761738204.jpeg", (38, 38, 1960, 1480), (38, 1517, 1960, 2959),
                      (0, .11, 1, .89)),
    "gutter-cleanout": ("gallery-3-1773761945026.jpeg", (29, 29, 1208, 1570), (1210, 29, 2370, 1570),
                        (0, 0, 1, .9)),
    "patio-wash": ("gallery-4-1773762051608.jpeg", (38, 38, 1960, 1480), (38, 1517, 1960, 2959),
                   (0, .11, 1, .89)),
}

INSET = 2  # px, keeps anti-aliased frame edges out of the photo


def cut(im, rect, frac):
    x0, y0, x1, y1 = rect
    x0, y0, x1, y1 = x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET
    w, h = x1 - x0, y1 - y0
    l, t, r, b = frac
    return im.crop((x0 + round(w * l), y0 + round(h * t), x0 + round(w * r), y0 + round(h * b)))


def centre_crop(im, w, h):
    left = (im.width - w) // 2
    top = (im.height - h) // 2
    return im.crop((left, top, left + w, top + h))


def main():
    for name, (src, before_rect, after_rect, frac) in JOBS.items():
        im = ImageOps.exif_transpose(Image.open(os.path.join(IMAGES, src))).convert("RGB")
        before, after = cut(im, before_rect, frac), cut(im, after_rect, frac)
        w, h = min(before.width, after.width), min(before.height, after.height)
        for label, half in (("before", before), ("after", after)):
            out = os.path.join(IMAGES, f"{name}-{label}.jpg")
            centre_crop(half, w, h).save(out, "JPEG", quality=88, optimize=True, progressive=True)
            print(f"  {os.path.relpath(out, ROOT)}  {w}x{h}")


if __name__ == "__main__":
    main()
