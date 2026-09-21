# SudsAway Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JavaScript-filled one-page site with a generated multi-page static site built from `data/content.json`, as specified in `docs/superpowers/specs/2026-09-21-sudsaway-rebuild-design.md`.

**Architecture:** `build/build.py` normalises `content.json` through `build/content.py` (every rule for admin-produced data lives there), renders images through `build/images.py`, renders pages from small template modules, and writes everything to the git-ignored `site/`. `build/qa.py` checks the output and exits non-zero only on *problems*. The admin panel keeps editing `content.json` and `images/` via GitHub; CI runs the same build.

**Tech Stack:** Python 3 (stdlib + Pillow), vanilla HTML/CSS/JS, `unittest`, GitHub Actions + Pages.

**Ground rules:** Work only on the local `rebuild` branch. Never push, merge, or deploy. Commit after each task.

**On visual code:** Tasks 6 and 7 (templates, CSS, JS) are specified by the markup contract and tokens below rather than full listings. Their correctness is verified in the browser (Task 11) and by QA, not by unit tests. All logic with branching rules (Tasks 2–5, 8, 9) is test-first with complete tests below.

---

## File structure

```
build/
  split_composites.py  one-time: composites -> images/<name>-before.jpg / -after.jpg
  content.py           load + normalise content.json into a render-ready model (pure)
  images.py            renditions (480/800/1280 JPG+WebP), mtime skip, dimensions
  html.py              esc(), rel(), picture(), icon(), slider()
  layout.py            head(), header(), drawer(), footer(), crumbs(), cta_band(), faq_block()
  seo.py               JSON-LD builders, sitemap.xml, robots.txt, llms.txt
  pages.py             home, service, gallery, contact, thanks, 404
  build.py             CLI: --content PATH --out DIR; orchestrates everything
  qa.py                CLI: --site DIR; problems vs warnings
  devserver.py         no-cache static server for site/
assets/css/site.css    design tokens + components
assets/js/site.js      header, drawer, reveal, sliders, gallery filter, form
tests/
  test_content.py      unit tests for content.py
  test_images.py       unit tests for slug/collision/dimension helpers
  test_qa.py           unit tests for contrast + problem/warning classification
  test_robustness.py   builds tests/fixtures/admin-edge.json into a temp dir, runs QA
  fixtures/admin-edge.json
NOTES-FOR-MIKE.md
```

Removed at the end (kept in tag `backup/pre-rebuild`): root `index.html`, `css/`, `js/`, `sitemap.xml`, `robots.txt`.

Run all tests with: `python3 -m unittest discover -s tests -v`

---

## Markup contract (templates, CSS and JS must agree on these)

| Component | Markup |
|---|---|
| Page shell | `<html lang="en-US" class="no-js">` (JS swaps to `js`); `<a class="skip" href="#main">`; `<header class="hdr">…</header>`; `<div class="drawer" id="drawer" hidden>` as a **sibling after** the header; `<main id="main">`; `<footer class="ftr">`; `<div class="callbar">` (mobile only) |
| Header | `.hdr__in` > `a.brand` (`img.brand__mark` + `.brand__txt` > `.brand__name` "SudsAway" + `.brand__sub` "ProWash"), `nav.nav` (`.has-sub` > link + `.sub` list of services; "Our Work"; "FAQ"; "Contact"; current page link has `aria-current="page"`), `.hdr__cta` (`a.tel`, `a.btn.btn--primary` "Free estimate", `button.burger[aria-expanded][aria-controls=drawer]`) |
| Buttons | `.btn` + one of `.btn--primary` (orange bg, dark text), `.btn--ghost` (outline, for dark backgrounds), `.btn--line` (outline, for light backgrounds) |
| Section | `section.section` (+ `.section--mist`, `.section--navy`) > `.wrap` > `.shead` (`.eyebrow`, `h2.h-1`, optional `p.lede`) |
| Reveal | `.rv` elements start hidden only under `html.js`; JS adds `.in` |
| Slider | `.ba[role=slider][tabindex=0][aria-valuemin=0][aria-valuemax=100][aria-valuenow=50]` containing before `<picture>`, `<picture class="ba__after">`, `.ba__tag.ba__tag--b`, `.ba__tag.ba__tag--a`, `.ba__handle > .ba__grip`; followed by `.ba-cap` (`b` + `span`). CSS: `.ba__after{clip-path:inset(0 0 0 var(--pos,50%))}` |
| Gallery | `.gal-filter` with `button[data-filter][aria-pressed]`; items `.gal__item[data-cat]` |
| Form | `form.qform[novalidate]`; each field `.field` > `label` + control + `.field__err`; `.field--err` shows the error; `.checks > label.check > input[name=services] + span`; success box `.qok[role=status]`; send error `p.qsend-err[role=alert][hidden]` |
| FAQ | `.faq > details > summary + .faq__a > p` (works without JS) |

## Design tokens (`:root` in `assets/css/site.css`; QA reads these names)

```
--navy #0a2463  --navy-deep #061539  --ink #0f1b33  --text #2e3a4f  --muted #586379
--paper #ffffff --mist #f2f5fa       --rule #dfe5ee --blue-ink #1565c0 --sky #9fd0ff
--orange #ff6b35 --orange-ink #c2410c --btn-ink #061539 --on-dark #ffffff --on-dark-muted #b9c6de
```

Contrast pairs QA must hold at ≥ 4.5:1 (all verified by hand at planning time):
`text/paper 11.5`, `muted/paper 6.0`, `muted/mist 5.5`, `ink/paper 17+`, `blue-ink/paper 5.7`, `orange-ink/paper 5.2`, `btn-ink/orange 6.3`, `on-dark/navy 14.5`, `on-dark-muted/navy 8.4`, `on-dark-muted/navy-deep 10.4`, `sky/navy 8.9`, `orange/navy 5.1`.

Bright `--orange` is used only for fills, bars, and text on navy. It is never used for text on light backgrounds.

---

### Task 1: Photos: import real washing pairs and split the composites

**Files:**
- Create: `build/split_composites.py`
- Create (generated, committed): `images/*-before.jpg`, `images/*-after.jpg`, plus the Cline copies

- [ ] **Step 1: Copy the Cline washing photos.** From `/Users/Web Projects/mike-property-management-site/site/assets/img/{pressure-washing,soft-washing}/`, copy each `<slug>-1280.jpg` to `images/<slug>.jpg` for: `awning-pressure-washing-{before,after}`, `driveway-pressure-washing-{before,after}`, `pressure-wash-front-walk-{before,after}`, `pressure-wash-outdoor-counter-{before,after}`, `soft-wash-gray-siding-{before,after}`, `soft-wash-siding-{before,after}`, `soft-wash-two-story-siding-{before,after}`, `fence-wash-before-after`, `concrete-pressure-washing-in-progress`.
- [ ] **Step 2: Measure the composites.** For each of `work-1.png`, `work-2.jpg`, `gallery-2-1773761738204.jpeg`, `gallery-3-1773761945026.jpeg`, `gallery-4-1773762051608.jpeg`, find the seam (half height, or half width for gallery-3, adjusted for any white gutter) and the extent of the printed labels and badge, by viewing crops at full size.
- [ ] **Step 3: Write `split_composites.py`.** A `JOBS` table maps each source to `(output_name, axis, seam, gutter, crop_box_fraction)`. The same crop box, relative to each half, applies to both halves so the slider aligns. Output names: `siding-soft-wash`, `roof-soft-wash`, `driveway-wash`, `gutter-cleanout`, `patio-wash`. Save JPEG at quality 88 with EXIF stripped. The script is idempotent: it overwrites its outputs.
- [ ] **Step 4: Run it and inspect every pair side by side.** The halves have equal size, no labels or badge remain, and the framing matches.

Run: `python3 build/split_composites.py`
Expected: 10 files written. A contact sheet saved to the scratchpad shows clean pairs.

- [ ] **Step 5: Commit.** `git add build/split_composites.py images/ && git commit -m "Split the before/after composites and import the washing pairs"`

### Task 2: `content.py`: normalisation rules (test-first)

**Files:**
- Create: `tests/test_content.py`, `build/content.py`

Interface:
```python
load(path) -> dict                                  # raw JSON
normalise(raw, root) -> Model                       # root = repo dir used to check image existence
slugify(text) -> str
referenced_images(raw) -> list[str]                 # every images/... path the content names
# Model is a SimpleNamespace with: business, hero, stats, services, gallery, testimonials,
# faq, about, area, warnings (list[str]); services and gallery items are SimpleNamespaces too.
```

- [ ] **Step 1: Write the failing tests** (`tests/test_content.py`):

```python
import os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import content as C

def repo_with(*files):
    d = tempfile.mkdtemp()
    os.makedirs(os.path.join(d, "images"))
    for f in files:
        open(os.path.join(d, f), "wb").close()
    return d

BASE = {"business": {"name": "SudsAway ProWash", "phone": "(708) 334-2685",
                     "email": "a@b.co", "hours": "Mon-Sat"},
        "hero": {"headline": "Your property\ndeserves to shine.", "heroImage": ""}}

def model(root, **over):
    raw = dict(BASE); raw.update(over)
    return C.normalise(raw, root)

class Slugs(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(C.slugify("Deck & Fence Restoration!"), "deck-fence-restoration")
        self.assertEqual(C.slugify("   "), "")

    def test_service_ids_deduped_and_blank_falls_back(self):
        root = repo_with()
        m = model(root, services=[{"id": "new-service", "title": "New Service"},
                                  {"id": "new-service", "title": "New Service"},
                                  {"id": "", "title": "Roof Cleaning"},
                                  {"id": "", "title": ""}])
        self.assertEqual([s.id for s in m.services],
                         ["new-service", "new-service-2", "roof-cleaning", "service"])

class Hidden(unittest.TestCase):
    def test_hidden_items_skipped_everywhere(self):
        root = repo_with()
        m = model(root,
                  services=[{"id": "a", "title": "A", "hidden": True}, {"id": "b", "title": "B"}],
                  testimonials=[{"name": "X", "text": "t", "hidden": True}],
                  stats=[{"number": 5, "suffix": "", "label": "L", "hidden": True}],
                  faq=[{"question": "q", "answer": "a", "hidden": True}])
        self.assertEqual([s.id for s in m.services], ["b"])
        self.assertEqual((m.testimonials, m.stats, m.faq), ([], [], []))

class HalfFinished(unittest.TestCase):
    def test_blank_entries_and_new_stat_skipped(self):
        root = repo_with()
        m = model(root,
                  testimonials=[{"name": "", "text": "", "rating": 5, "service": ""},
                                {"name": "Ann", "text": "Great", "rating": 5, "service": ""}],
                  faq=[{"question": "", "answer": ""}, {"question": "Q?", "answer": "A."}],
                  stats=[{"number": 0, "suffix": "+", "label": "New Stat"},
                         {"number": 12, "suffix": "", "label": ""},
                         {"number": 40, "suffix": "+", "label": "Driveways"}])
        self.assertEqual([t.name for t in m.testimonials], ["Ann"])
        self.assertEqual([f.q for f in m.faq], ["Q?"])
        self.assertEqual([s.label for s in m.stats], ["Driveways"])

class ServiceFallbacks(unittest.TestCase):
    def test_empty_description_and_missing_image(self):
        root = repo_with()
        m = model(root, services=[{"id": "x", "title": "New Service", "description": "",
                                   "icon": "nope", "image": "images/placeholder.png"}])
        s = m.services[0]
        self.assertTrue(s.description.startswith("New Service"))
        self.assertIsNone(s.image)
        self.assertEqual(s.icon, "star")
        self.assertTrue(any("placeholder.png" in w for w in m.warnings))

class Gallery(unittest.TestCase):
    def setUp(self):
        self.root = repo_with("images/b.jpg", "images/a.jpg", "images/new.jpg")
        self.svc = [{"id": "house-washing", "title": "House Washing"}]

    def g(self, items):
        return model(self.root, services=self.svc, gallery=items).gallery

    def test_pair_when_image_empty_or_equals_after(self):
        for image in ("", "images/a.jpg"):
            item = self.g([{"before": "images/b.jpg", "after": "images/a.jpg", "image": image,
                            "caption": "Siding", "category": "house-washing"}])[0]
            self.assertEqual(item.kind, "pair")

    def test_replaced_image_wins_as_single(self):
        item = self.g([{"before": "images/b.jpg", "after": "images/a.jpg",
                        "image": "images/new.jpg", "caption": "Siding"}])[0]
        self.assertEqual((item.kind, item.image.path), ("single", "images/new.jpg"))

    def test_missing_files_skipped_with_warning(self):
        m = model(self.root, services=self.svc,
                  gallery=[{"image": ""}, {"before": "images/b.jpg", "after": "images/gone.jpg"}])
        self.assertEqual(m.gallery, [])
        self.assertTrue(m.warnings)

    def test_unknown_category_is_general(self):
        item = self.g([{"image": "images/a.jpg", "caption": "x", "category": "decks"}])[0]
        self.assertEqual(item.category, "general")

    def test_blank_caption_gets_alt_from_category(self):
        pair = self.g([{"before": "images/b.jpg", "after": "images/a.jpg", "caption": "",
                        "category": "house-washing"}])[0]
        self.assertEqual(pair.alt, "House Washing before and after")
        single = self.g([{"image": "images/a.jpg", "caption": " "}])[0]
        self.assertEqual(single.alt, "SudsAway ProWash job photo")

class Hero(unittest.TestCase):
    def test_headline_split_and_image_fallback(self):
        root = repo_with("images/b.jpg", "images/a.jpg")
        m = model(root, gallery=[{"before": "images/b.jpg", "after": "images/a.jpg"}])
        self.assertEqual((m.hero.line1, m.hero.line2), ("Your property", "deserves to shine."))
        self.assertEqual(m.hero.image.path, "images/a.jpg")   # falls back to first pair's after

    def test_phone_href(self):
        m = model(repo_with())
        self.assertEqual(m.business.tel, "+17083342685")

class References(unittest.TestCase):
    def test_referenced_images(self):
        raw = {"hero": {"heroImage": "images/h.jpg"},
               "services": [{"image": "images/s.jpg"}],
               "gallery": [{"image": "images/a.jpg", "before": "images/b.jpg", "after": "images/a.jpg"}]}
        self.assertEqual(sorted(C.referenced_images(raw)),
                         ["images/a.jpg", "images/b.jpg", "images/h.jpg", "images/s.jpg"])

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and confirm they fail.** `python3 -m unittest tests.test_content -v`. Expected: an ImportError, or failures because `content` doesn't exist yet.
- [ ] **Step 3: Implement `build/content.py`** until every test passes. Rules:
  - A service's `summary` falls back to the first sentence of its description, and `steps`, `surfaces`, `faq` default to `[]`.
  - Service icons are one of `home`, `roof`, `road`, `fence`, `building`, `droplet`, `star`; anything else becomes `star`.
  - `area` is `business.serviceArea` with blanks removed, falling back to `["Whitestown"]`.
  - `trust` is `hero.trustBadges` with blanks removed.
  - `hero.image` is `heroImage` if the file exists, otherwise the first pair's after photo, otherwise `None`.
  - Every image object has `path`, `slug` (set later by `images.py`), and `alt`.
- [ ] **Step 4: Run the tests and confirm they pass.** `python3 -m unittest tests.test_content -v`. Expected: all OK.
- [ ] **Step 5: Commit.** `git commit -m "Add content normalisation with admin edge-case rules"`

### Task 3: Migrate `data/content.json`

**Files:** Modify `data/content.json`

- [ ] **Step 1:** Using a Python script that loads the file and dumps it with `indent=2, ensure_ascii=False` plus a trailing newline:
  - Add `business.serviceArea`: the 10 towns.
  - Set the hero `headline` to `"Your property\ndeserves to shine."`, fix the subheadline grammar ("protect"), and set `heroImage` to a real after photo.
  - Give each of the 6 services `summary`, `intro`, `steps`, `surfaces`, and `faq`. Copy stays plain and specific, with no new unverifiable claims; process claims are listed in NOTES. Set `image` to a real single photo, or `""` for deck-fence and commercial.
  - Rewrite `gallery` as pairs in this order: SudsAway's own five first, then the Cline pairs. Each has a `category`, and the fence composite is a single image.
  - Add `"hidden": true` to the 4 testimonials and 4 stats.
- [ ] **Step 2: Verify.** `python3 -c "import sys; sys.path.insert(0,'build'); import content as C; m=C.normalise(C.load('data/content.json'),'.'); print(len(m.services), len(m.gallery), m.warnings)"`. Expected: `6 <n> []`, where n is 13.
- [ ] **Step 3: Commit.** `git commit -m "Migrate content.json to the rebuild content model"`

### Task 4: `images.py`: renditions (test-first for the helpers)

**Files:** Create `tests/test_images.py`, `build/images.py`

Interface: `assign_slugs(paths) -> dict[path, slug]` (collisions get `-<ext>`), `oriented_size(path) -> (w, h)` (swaps for EXIF orientation 5–8), `render(paths, root, out_dir) -> dict[slug, {"w","h","widths"}]`. It writes `out_dir/assets/img/<slug>-<w>.{jpg,webp}` for w in (480, 800, 1280), never upscaling beyond the native width but still emitting that file name. It skips a rendition whose mtime is ≥ the source's, and returns only sources that exist.

- [ ] **Step 1: Write the failing tests**:

```python
import os, sys, tempfile, unittest
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import images as I

class Slugs(unittest.TestCase):
    def test_collision_gets_extension(self):
        s = I.assign_slugs(["images/Foo Bar.jpg", "images/foo-bar.png", "images/x.jpeg"])
        self.assertEqual(s["images/Foo Bar.jpg"], "foo-bar")
        self.assertEqual(s["images/foo-bar.png"], "foo-bar-png")
        self.assertEqual(s["images/x.jpeg"], "x")

class Render(unittest.TestCase):
    def test_render_and_skip(self):
        root = tempfile.mkdtemp(); out = tempfile.mkdtemp()
        os.makedirs(os.path.join(root, "images"))
        im = Image.new("RGB", (1000, 600), "white")
        exif = Image.Exif(); exif[0x0112] = 6            # rotated 90° on display
        im.save(os.path.join(root, "images", "p.jpg"), exif=exif)
        man = I.render(["images/p.jpg", "images/missing.jpg"], root, out)
        self.assertEqual(man["p"]["w"], 600)             # orientation applied
        self.assertEqual(man["p"]["h"], 1000)
        for w in (480, 800, 1280):
            for ext in ("jpg", "webp"):
                self.assertTrue(os.path.exists(os.path.join(out, "assets", "img", f"p-{w}.{ext}")))
        self.assertNotIn("missing", man)
        t = os.path.getmtime(os.path.join(out, "assets", "img", "p-800.jpg"))
        I.render(["images/p.jpg"], root, out)
        self.assertEqual(t, os.path.getmtime(os.path.join(out, "assets", "img", "p-800.jpg")))
```

- [ ] **Step 2: Run the tests and confirm they fail.** `python3 -m unittest tests.test_images -v`
- [ ] **Step 3: Implement.** Qualities: JPG 74/70/64 and WebP 72/66/58 for 480/800/1280. Use `ImageOps.exif_transpose`, convert to RGB, `LANCZOS` resampling, save the JPG progressive and optimised, and the WebP with `method=6`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -m "Add the Pillow image pipeline"`

### Task 5: `seo.py`: structured data and site files (test-first)

**Files:** Create `build/seo.py`; add tests in `tests/test_content.py` or a new `tests/test_seo.py`

Interface: `business_ld(model, base) -> dict`, `breadcrumb_ld(items, base)`, `faq_ld(pairs)`, `service_ld(service, model, base)`, `sitemap(pages, base, today) -> str` (each page has `loc`, `images` list), `robots(base) -> str` (`Disallow: /admin/`), `llms(model, base) -> str`.

- [ ] **Step 1: Write failing tests.** Check that:
  - `business_ld` has no `aggregateRating` and includes the `areaServed` towns.
  - `faq_ld([])` returns `None`, so no empty FAQPage is ever emitted.
  - The sitemap is valid XML (`xml.dom.minidom.parseString`), contains every page, and contains no `/admin/`.
  - `robots` contains `Disallow: /admin/` and the sitemap URL.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.**

### Task 6: Templates and `build.py`

**Files:** Create `build/html.py`, `build/layout.py`, `build/pages.py`, `build/build.py`

- [ ] **Step 1:** `html.py`:
  - `picture(img, depth, sizes, cls, eager)` uses the images manifest for `width`/`height`, and returns `""` when the image isn't in the manifest.
  - `slider(item, depth)` implements the markup contract.
  - `icon(name)` provides the old site's service icons plus phone, mail, pin, clock, arrow, check, shield and star.
- [ ] **Step 2:** `layout.py`: follow the markup contract.
  - `head()` emits the title, description, canonical, robots, Open Graph and Twitter tags (image falling back to the hero), the fonts, CSS with a content-hash `?v=`, the `no-js` class, JSON-LD, and the favicon (`images/favicon.ico`).
  - The footer has name, phone, email, hours, area and services, followed by the callbar and `site.js`.
- [ ] **Step 3:** `pages.py`, following the spec's **Pages** section:
  - Home, with the stats and reviews sections omitted when empty.
  - Service pages (text-led header when there's no image), with related services and `contact.html?service=<id>`.
  - Gallery with filter chips only for categories that have items.
  - Contact with the form fields and hidden fields from the spec (`_next` = `https://sudsawayprowash.com/thanks.html`).
  - Thanks and 404 pages; the 404 uses root-absolute asset paths so it works at any depth.
- [ ] **Step 4:** `build.py` takes `--content`, `--out` (default `site`) and `--root` (default the repo). It:
  - normalises the content, prints the warnings, and renders images;
  - wipes and recreates `out`, except for `assets/img`, which the mtime skip relies on;
  - copies `assets/`, `admin/` and `images/`;
  - writes all pages, `sitemap.xml`, `robots.txt`, `llms.txt`, `.nojekyll` and `404.html`.
- [ ] **Step 5: Smoke test.** `python3 build/build.py`. Expected: it lists the written pages, and `site/index.html`, `site/services/house-washing.html` and `site/gallery.html` exist.
- [ ] **Step 6: Commit.**

### Task 7: CSS and JS

**Files:** Create `assets/css/site.css`, `assets/js/site.js`

- [ ] **Step 1: CSS**, mobile-first.
  - Tokens exactly as above; Outfit 700/800 for display, DM Sans for body.
  - Split hero: navy panel and photo at ≥ 960px, stacked below that.
  - Numbered service rows in 2 columns at ≥ 820px.
  - Slider styles, adapted from Cline `site.css:775-838`.
  - Gallery grid, form, FAQ `details`, CTA band, footer, and the callbar (< 900px).
  - `prefers-reduced-motion` disables reveal and transitions.
- [ ] **Step 2: JS**, one IIFE with no dependencies:
  - Swap the html class from `no-js` to `js`.
  - Sticky header shadow.
  - Drawer: toggles `hidden` and `aria-expanded`, closes on Escape and on link click, and locks body scroll.
  - Reveal via IntersectionObserver; with reduced motion, show everything.
  - Sliders: pointer drag with capture, plus keyboard ←/→ ±5, Home and End.
  - Gallery filter with `?filter=`.
  - Form: validation (name, and a phone with 10 digits), phone formatting, subject `[SudsAway Web] <services> · <town> — <name>`, `_replyto` from the email, "Submitted from", AJAX to `/ajax/`, success and error states, and the `?service=` pre-tick.
  - Footer year.
- [ ] **Step 3:** Rebuild, open in the browser, and confirm there are no console errors.
- [ ] **Step 4: Commit.**

### Task 8: `qa.py` (test-first for the rules)

**Files:** Create `tests/test_qa.py`, `build/qa.py`

Interface: `contrast(hex1, hex2) -> float`; `check_page(path, site_dir) -> (problems, warnings)`; `check_tokens(css_text) -> problems`; `main(site_dir) -> exit code`. It skips `site/admin/`.

- [ ] **Step 1: Failing tests.**
  - `round(contrast("#ffffff", "#ff6b35"), 1) == 2.8` and `round(contrast("#061539", "#ff6b35"), 1) == 6.3`.
  - A temp page missing an H1 → a problem.
  - An `<img>` with no `alt` → a problem; `alt=""` → not a problem.
  - A link to a missing local file → a problem.
  - A title over 60 characters → a warning only.
  - Duplicate titles across two pages → a warning only.
  - Invalid JSON-LD → a problem.
  - An input with no label → a problem; hidden inputs are ignored.
  - `check_tokens` with `--muted:#999999; --paper:#ffffff` → a problem.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement** with `html.parser`. Problems and warnings are exactly as in the spec's **QA levels**, plus a missing `og:image` as a problem. Print a summary; exit 1 only on problems.
- [ ] **Step 4: Run the tests and confirm they pass**, then run `python3 build/qa.py`. Expected: `0 problems`.
- [ ] **Step 5: Commit.**

### Task 9: Robustness test

**Files:** Create `tests/fixtures/admin-edge.json`, `tests/test_robustness.py`

- [ ] **Step 1:** Build the fixture from the real `content.json`. Add two `{"id":"new-service","title":"New Service","description":"","icon":"star","image":"images/placeholder.png"}` services. Add gallery items with `image: ""`, with a blank caption, and with `category:"decks"`. Add a pair whose `image` is another existing file. Add a blank testimonial and a blank FAQ, a `New Stat`, and an edited service id (`house-washing` becomes `house-wash`).
- [ ] **Step 2:** The test builds the fixture into a temp dir using `build.main(["--content", fixture, "--out", tmp])`, then asserts that `qa.main(tmp) == 0` and that `services/new-service-2.html` exists.
- [ ] **Step 3:** Run it, fix any failure in `content.py` or the templates (never in the fixture), and commit.

### Task 10: Tooling, deploy workflow, admin copy, cleanup, notes

**Files:**
- Create `build/devserver.py` and `NOTES-FOR-MIKE.md`
- Modify `.claude/launch.json`, `.github/workflows/deploy.yml`, `admin/admin.js` (the save toast at around line 594, and the hero hint at around line 1042)
- Create `.gitignore` (`site/`, `.DS_Store`, `__pycache__/`)
- Delete the root `index.html`, `css/`, `js/`, `sitemap.xml` and `robots.txt`

- [ ] **Step 1:** Write `devserver.py`: `http.server` rooted at `site/` with `Cache-Control: no-store`, port from argv (default 8080). Point `launch.json` at `python3 build/devserver.py 8080`.
- [ ] **Step 2: Update `deploy.yml`.** Add `actions/setup-python@v5` (3.12), `pip install pillow`, and `python build/build.py && python build/qa.py`, then upload `site`.
- [ ] **Step 3: Admin copy.** The save toast should say the site "will update in a minute or two". The hero hint should describe a portrait-friendly finished-job photo.
- [ ] **Step 4:** Delete the old root files, rebuild, and run QA and all tests.
- [ ] **Step 5: Write `NOTES-FOR-MIKE.md`** with the sections from the spec. Every claim that stayed on the site, and every hidden item, gets a question.
- [ ] **Step 6: Commit.**

### Task 11: Browser verification

- [ ] **Step 1:** Run `preview_start main-site`. At 1280px and at 375px, visit home, all 6 service pages, the gallery, contact, thanks and 404.
  - There are no console errors and no horizontal scroll.
  - The drawer opens and closes, and the dropdown works by keyboard.
  - Each slider works by drag and by the arrow keys.
  - The gallery filter works and updates `?filter=`.
  - The form:
    - An empty submit shows inline errors.
    - With `fetch` stubbed, a submission shows the success state and the computed `_subject`.
    - `?service=roof-cleaning` pre-ticks that box.
- [ ] **Step 2:** With JavaScript disabled, reload home and a service page. All content is visible.
- [ ] **Step 3:** Fix what's broken, then rebuild, QA and re-verify.
- [ ] **Step 4:** Take final screenshots for the user. Leave the preview running.
