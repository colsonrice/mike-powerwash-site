# SudsAway ProWash rebuild — design

- **Date:** 2026-09-21
- **Status:** approved in chat by the user
- **Branch:** `rebuild`, local only. `main` equals the live site; tag `backup/pre-rebuild` marks it.

## Goal

Bring sudsawayprowash.com up to the standard of Mike's Cline Property Management site
(`/Users/Web Projects/mike-property-management-site`, live at clinepropertymgmt.com):
real HTML instead of JavaScript-filled pages, a page per service, fast responsive images,
drag-to-compare before/after sliders, a better estimate form, and only claims Mike can
stand behind. SudsAway keeps its own brand so the two sites look related, not identical.

## Constraints

1. **Local until approved.** No push, merge, or deploy until the user has reviewed the
   result locally and said yes. Any push to `main` deploys the live site.
2. **The `/admin` panel keeps working.** Nobody knows yet whether Mike uses it. It reads and
   writes `data/content.json` through the GitHub API, uploads photos into `images/`, and
   round-trips fields it doesn't know about (it re-serialises the whole object), so new
   optional fields are safe. Its editors only show the fields it already knows.
3. **No framework.** Python 3 + Pillow, like the Cline build. Port Cline code where it fits
   rather than inventing new patterns.

## Architecture

| Piece | Responsibility |
|---|---|
| `data/content.json` | Single source of truth for all copy and lists. Existing keys keep their meaning; new keys are optional. |
| `build/build.py` | Reads `content.json`, writes the complete site to `site/` (git-ignored): all pages, `sitemap.xml`, `robots.txt`, `llms.txt`. Copies `admin/`, `data/`, and static assets across so `/admin` still works. |
| `build/images.py` | Every photo in `images/` becomes upright, EXIF-stripped JPG + WebP at 480/800/1280 px in `site/assets/img/`. A crop map splits the stacked before/after composites into separate before and after images. Unchanged sources are skipped so CI stays fast. |
| `build/qa.py` | Fails the build on broken links, missing images or alt text, bad titles or descriptions, JSON-LD that doesn't parse, heading problems, unlabelled form fields, or colour pairs below WCAG AA. |
| `build/devserver.py` | Local preview of `site/` with caching disabled; `.claude/launch.json` points at it. |
| `assets/` | Hand-written `css/site.css`, `js/site.js`, logo, favicon. Replaces the old root `index.html`, `css/`, `js/` (preserved in the backup tag). |
| `.github/workflows/deploy.yml` | Adds Python + Pillow, runs images → build → QA, and publishes `site/` instead of the repo root. Inert until merged. |

Data flow: admin save or local edit → `content.json` / `images/` → push to `main` → Action
runs images, build, QA → Pages publishes `site/`. The admin's "updates in about 30 seconds"
message changes to "a minute or two"; that is the only admin change.

## Content model additions

All optional. The admin preserves them but can't edit them yet.

- `business.serviceArea`: list of towns. Starts with the ten Cline lists for washing
  (Whitestown, Zionsville, Indianapolis, Carmel, Westfield, Brownsburg, Lebanon, Avon,
  Plainfield, Fishers) and is flagged for Mike to confirm.
- `services[]`: the existing `id` becomes the URL slug. Adds `summary`, `intro`, `steps[]`,
  `surfaces[]`, and `faq[]` for the service page.
- `gallery[]`: an item has either `image` (as today) or `before` + `after`, plus `caption`,
  optional `note`, and `category` (a service `id`, or `general`). Pairs render as sliders,
  single images as plain figures, so photos uploaded through the admin still appear.
- **`hidden: true` on any list item** (testimonials, stats, gallery) means the build skips it.
  A section with nothing visible isn't rendered. The four existing testimonials and the four
  stats start hidden until Mike confirms them; anything added through the admin shows by default.

## Pages

- **Home** (`index.html`, same URL as today): split hero with a real job photo, headline,
  estimate button and phone; trust badges from `hero.trustBadges`; the six services as
  numbered rows linking to their pages; three before/after sliders linking to the gallery;
  "Why SudsAway" from `about`; reviews (only if any are visible); service area; FAQ;
  estimate call-to-action band; footer with name, phone, email, hours, and area.
- **Six service pages** (`services/<id>.html`): breadcrumb, H1, summary and intro, how it's
  done, surfaces cleaned, that service's before/after pairs, its FAQs, related services, and
  an estimate button linking to `contact.html?service=<id>`. Pages without a real photo use
  a text-led header rather than a stand-in.
- **Gallery** (`gallery.html`): every visible gallery item, filterable by service, with the
  filter kept in `?filter=`.
- **Contact** (`contact.html`): the estimate form plus phone, email, hours, and area.
- **Thanks** (`thanks.html`) and **404** (`404.html`).

Old in-page anchors (`/#services`, `/#contact`, …) still land on the home page, so no redirects are needed.

## Estimate form

FormSubmit to the existing address. Fields: name*, phone*, email, town, services
(checkboxes from `services`), property type (home or business), message. Hidden fields:
`_subject`, `_replyto`, `_next` (absolute URL of `thanks.html`), `_template=table`,
`_captcha=false`, the `_honey` honeypot, and "Submitted from".

With JavaScript: inline field errors instead of `alert()`; phone auto-formatting; a subject like
`[SudsAway Web] House Washing + Roof Cleaning · Zionsville — Dana W.`; reply-to set to the
customer's email; the originating page recorded; submission over FormSubmit's `/ajax/`
endpoint with an inline success message and an inline error message; the `?service=`
pre-tick. Without JavaScript the form posts normally and lands on `thanks.html`.

## Look and feel

- **Keep:** the mascot logo, the navy and orange palette, and the Outfit (display) and DM Sans (body) fonts.
- **Borrow from Cline:** split hero, numbered service rows, before/after sliders, calmer
  surfaces (fewer glows, gradients, and floating animations), and a consistent section rhythm.
- **Accessibility:** white text on the current orange (#ff6b35) is about 2.8:1, which fails
  AA, so buttons and other text-bearing orange use a deeper orange that passes 4.5:1. Bright
  orange stays for accents. Scroll-reveal has a no-JS fallback and respects `prefers-reduced-motion`.
- Mobile-first; checked at 375 px and 1280 px.

## Search (SEO)

- Canonical base `https://sudsawayprowash.com/`. Every page gets a unique title and meta
  description, a canonical URL, and Open Graph and Twitter tags with a real photo.
- JSON-LD: a `HomeAndConstructionBusiness` with an `@id` and `areaServed` towns, and no
  `aggregateRating`. The home page gets `FAQPage`; service pages get `Service`,
  `BreadcrumbList`, and `FAQPage`. FAQ markup only covers FAQs visible on that page.
- `sitemap.xml` with `lastmod` and image entries, plus `robots.txt` and `llms.txt`.

## Images

- **Real photos for anything that represents the work.** Sources are the five SudsAway
  before/after composites, split into pairs, plus seven washing pairs and one fence composite
  copied from the Cline repo's 1280 px renditions. The user approved the reuse; it's flagged
  for Mike.
- **Stock photos are dropped.** `logo-2.png` (the hero) and `logo-1.png` are stock; references
  to them are replaced with real photos. The files stay in `images/` in case the admin still
  points at them.
- **Generated images** (headless Codex; user-approved) are only for clearly illustrative
  material, such as a soft-wash vs pressure-wash explainer, and are captioned "Illustration".
  Never before/after pairs, and never a photoreal scene presented as a SudsAway job.

## NOTES-FOR-MIKE.md

A new file for this site, in the same format as Cline's:
- **Claims to confirm:** licensed and insured; the 100% satisfaction guarantee; replies
  "within a few hours"; the Mon–Sat 7–7 hours; the hidden stats and testimonials; the town list.
- **Photos wanted:** Mike, the crew, or a truck; commercial jobs, decks, roofs; short washing clips.
- **Setup:** FormSubmit activation for the Yahoo address, plus an email filter on `[SudsAway Web]`.
- **Also:** a Google Business Profile, and the fact that Cline also sells washing in the same towns.

## Checkpoints

1. **Foundation:** build, images, QA skeleton, home, contact, thanks, 404, and the workflow
   change. The user reviews on localhost.
2. **Depth:** service pages, gallery, sitemap, robots, and llms.txt; QA reports zero problems.
   The user reviews again.
3. **Ship, only on an explicit OK:** merge to `main`, push, verify the live site, and walk
   Mike through form activation.

## Testing

- `build/qa.py` reports zero problems.
- In the browser at 375 px and 1280 px: every page renders with no console errors; sliders
  work by mouse, touch, and keyboard; the drawer menu opens and closes; form validation and
  the subject builder work with `fetch` stubbed, so nothing is sent to Mike's inbox. Content
  is visible with JavaScript disabled.
- `/admin` still loads from `site/`. Admin saves are not tested, because they write to the real
  GitHub `main` and would deploy it.

## Out of scope

A video section (Mike's clips are all landscaping), per-town pages (Cline tried them and folded
them back into the home page), an About page (no owner photo or story yet), admin editors for
the new fields, and any change to the Cline site.
