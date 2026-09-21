"""Page chrome: <head>, header, mobile drawer, footer, and shared sections."""
from markup import BASE, esc, icon, json_ld

FONTS = ("https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;"
         "9..40,600;9..40,700&family=Outfit:wght@500;600;700;800&display=swap")

# Set by build.py once the assets are copied, so edits bust browser caches.
VERSIONS = {"css": "1", "js": "1"}
# Demo builds keep every page out of search results.
NOINDEX_ALL = False

# If site.js never runs, drop the "js" class after a few seconds so hidden
# scroll-reveal content becomes visible anyway.
BOOT = ("<script>document.documentElement.className='js';"
        "setTimeout(function(){if(!window.SW_READY)document.documentElement.className='no-js'},4000)"
        "</script>")


def brand_parts(name):
    first, _, rest = name.partition(" ")
    return first, rest


def head(m, title, desc, path, og_image=None, ld=(), noindex=False):
    og = og_image or m.og_default
    robots = ("noindex,nofollow" if NOINDEX_ALL else "noindex,follow" if noindex
              else "index,follow,max-image-preview:large")
    lds = "\n".join(json_ld(x) for x in ld if x)
    og_tags = (f'<meta property="og:image" content="{esc(og)}">\n'
               f'<meta name="twitter:image" content="{esc(og)}">') if og else ""
    return f"""<!doctype html>
<html lang="en-US" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}{path}">
<meta name="robots" content="{robots}">
<meta name="theme-color" content="#0a2463">
<meta name="format-detection" content="telephone=yes">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{esc(m.business.name)}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{BASE}{path}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
{og_tags}
{BOOT}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="/assets/css/site.css?v={VERSIONS['css']}">
<link rel="icon" href="/images/favicon.ico" sizes="any">
{lds}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
"""


def _brand(m):
    a, b = brand_parts(m.business.name)
    sub = f'<span class="brand__sub">{esc(b)}</span>' if b else ""
    return (f'<a class="brand" href="/" aria-label="{esc(m.business.name)}, home">'
            f'<img class="brand__mark" src="/images/logo.svg" alt="" width="44" height="44" loading="eager">'
            f'<span class="brand__txt"><span class="brand__name">{esc(a)}</span>{sub}</span></a>')


def header(m, active=""):
    def cur(key):
        return ' aria-current="page"' if key == active else ""

    subs = "".join(f'<a href="/services/{s.id}.html"{cur(s.id)}>{esc(s.title)}</a>' for s in m.services)
    drawer_svcs = "".join(f'<a href="/services/{s.id}.html">{esc(s.title)}</a>' for s in m.services)
    tel = m.business.tel
    phone_link = (f'<a class="tel" href="tel:{tel}">{icon("phone")}<span>{esc(m.business.phone)}</span></a>'
                  if tel else "")
    call = (f'<a class="btn btn--primary drawer__call" href="tel:{tel}">{icon("phone")} '
            f'Call {esc(m.business.phone)}</a>') if tel else ""
    svc_active = ' class="is-active"' if active in {s.id for s in m.services} else ""
    return f"""<header class="hdr">
<div class="hdr__in">
  {_brand(m)}
  <nav class="nav" aria-label="Primary">
    <div class="has-sub">
      <a href="/#services"{svc_active}>Services {icon("chevron", "ic ic--chev")}</a>
      <div class="sub">{subs}</div>
    </div>
    <a href="/gallery.html"{cur("gallery")}>Our Work</a>
    <a href="/#faq">FAQ</a>
    <a href="/contact.html"{cur("contact")}>Contact</a>
  </nav>
  <div class="hdr__cta">
    {phone_link}
    <a class="btn btn--primary btn--sm" href="/contact.html">Free estimate</a>
    <button class="burger" type="button" aria-expanded="false" aria-controls="drawer" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</div>
</header>
<div class="drawer" id="drawer" hidden>
  <p class="drawer__grp">Services</p>
  {drawer_svcs}
  <p class="drawer__grp">Company</p>
  <a href="/gallery.html">Our Work</a>
  <a href="/#faq">FAQ</a>
  <a href="/contact.html">Get a free estimate</a>
  {call}
</div>
"""


def footer(m):
    b = m.business
    svcs = "".join(f'<li><a href="/services/{s.id}.html">{esc(s.title)}</a></li>' for s in m.services)
    hours = "".join(f"<span>{esc(h.strip())}</span>" for h in b.hours.split("|") if h.strip())
    nap = []
    if b.tel:
        nap.append(f'<li><a href="tel:{b.tel}">{icon("phone")}<span>{esc(b.phone)}</span></a></li>')
    if b.email:
        nap.append(f'<li><a href="mailto:{esc(b.email)}">{icon("mail")}<span>{esc(b.email)}</span></a></li>')
    if hours:
        nap.append(f'<li>{icon("clock")}<span class="ftr__hours">{hours}</span></li>')
    nap.append(f'<li>{icon("pin")}<span>Based in Whitestown, serving Greater Indianapolis</span></li>')
    blurb = b.tagline or "Power washing and soft washing"
    callbar = ""
    if b.tel:
        callbar = (f'<div class="callbar"><a class="btn btn--dark" href="tel:{b.tel}">{icon("phone")} Call</a>'
                   f'<a class="btn btn--primary" href="/contact.html">Free estimate</a></div>')
    return f"""<footer class="ftr">
<div class="wrap">
  <div class="ftr__top">
    <div class="ftr__brand">
      {_brand(m)}
      <p class="ftr__blurb">{esc(blurb)}. Power washing and soft washing for homes and businesses across Greater Indianapolis.</p>
    </div>
    <div>
      <h2 class="ftr__h">Services</h2>
      <ul class="ftr__list">{svcs}</ul>
    </div>
    <div>
      <h2 class="ftr__h">Company</h2>
      <ul class="ftr__list">
        <li><a href="/gallery.html">Our Work</a></li>
        <li><a href="/#faq">FAQ</a></li>
        <li><a href="/contact.html">Free estimate</a></li>
      </ul>
    </div>
    <div>
      <h2 class="ftr__h">Get in touch</h2>
      <ul class="ftr__nap">{"".join(nap)}</ul>
    </div>
  </div>
  <div class="ftr__bot">
    <span>&copy; <span data-year>{m.year}</span> {esc(b.name)}. All rights reserved.</span>
    <span>Free estimates across Greater Indianapolis</span>
  </div>
</div>
</footer>
{callbar}
<script src="/assets/js/site.js?v={VERSIONS['js']}" defer></script>
</body>
</html>
"""


def crumbs(items):
    out = []
    for i, (name, href) in enumerate(items):
        if href:
            out.append(f'<a href="{href}">{esc(name)}</a>')
        else:
            out.append(f'<span aria-current="page">{esc(name)}</span>')
        if i < len(items) - 1:
            out.append('<span class="crumbs__sep" aria-hidden="true">/</span>')
    return f'<nav class="crumbs" aria-label="Breadcrumb">{"".join(out)}</nav>'


def faq_list(faqs):
    items = "".join(f'<details class="faq__item"><summary>{esc(f.q)}<span class="faq__pm" aria-hidden="true"></span>'
                    f'</summary><div class="faq__a"><p>{esc(f.a)}</p></div></details>' for f in faqs)
    return f'<div class="faq">{items}</div>'


def cta_band(m, heading="Ready to see the difference?",
             sub="Free estimates, straight answers, and a clean result you can see from the street."):
    tel = m.business.tel
    call = (f'<a class="btn btn--ghost btn--lg" href="tel:{tel}">{icon("phone")} {esc(m.business.phone)}</a>'
            if tel else "")
    return f"""<section class="cta-band">
  <div class="wrap cta-band__in">
    <h2 class="h-1">{esc(heading)}</h2>
    <p>{esc(sub)}</p>
    <div class="acts">
      <a class="btn btn--primary btn--lg" href="/contact.html">Get a free estimate {icon("arrow")}</a>
      {call}
    </div>
  </div>
</section>"""
