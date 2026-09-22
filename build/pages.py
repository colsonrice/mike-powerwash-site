"""The site's pages. Each renderer returns a Page(path, html, images, indexed)."""
from collections import namedtuple

import seo
from layout import cta_band, crumbs, faq_list, footer, head, header
import markup
from markup import esc, icon, icon_for, img_url, picture, shot

Page = namedtuple("Page", "path html images indexed")

# FormSubmit activation is tied to the address, so this stays fixed even if the
# email shown on the site is edited in the admin panel.
FORM_ADDRESS = "sudsawayprowash@yahoo.com"
# Where FormSubmit sends people when JavaScript is off; demo builds point at the demo.
FORM_NEXT = markup.PRODUCTION_BASE + "/thanks.html"
# (media query, width of the photo's box, the box's aspect ratio) -- see markup.sizes_attr.
SLIDER_SIZES_3 = [("(max-width: 719px)", "92vw", 4 / 3), ("(max-width: 1079px)", "46vw", 4 / 3),
                  (None, "370px", 4 / 3)]
SLIDER_SIZES_2 = [("(max-width: 719px)", "92vw", 4 / 3), (None, "560px", 4 / 3)]
HERO_SIZES = [("(max-width: 959px)", "100vw", 4 / 3), (None, "50vw", 0.9)]
PHEAD_SIZES = [("(max-width: 959px)", "100vw", 4 / 3), (None, "50vw", 1.15)]


def _ld(m):
    return seo.business_ld(m, markup.BASE, m.og_default)


def _hero_acts(m, href="/contact.html", label=None):
    label = label or m.hero.cta
    call = (f'<a class="btn btn--ghost btn--lg" href="tel:{m.business.tel}">{icon("phone")} '
            f'{esc(m.business.phone)}</a>') if m.business.tel else ""
    return (f'<div class="acts"><a class="btn btn--primary btn--lg" href="{href}">{esc(label)} '
            f'{icon("arrow")}</a>{call}</div>')


def _svc_rows(services, compact=False):
    rows = []
    for i, s in enumerate(services, 1):
        rows.append(
            f'<a class="svc-row rv" href="/services/{s.id}.html">'
            f'<span class="svc-row__no">{i:02d}</span>'
            f'<span class="svc-row__ic">{icon(s.icon)}</span>'
            f'<span class="svc-row__txt"><span class="svc-row__nm">{esc(s.title)}</span>'
            f'<span class="svc-row__ds">{esc(s.summary)}</span></span>'
            f'<span class="svc-row__go">{icon("arrow")}</span></a>')
    cls = "svc-rows svc-rows--compact" if compact else "svc-rows"
    return f'<div class="{cls}">{"".join(rows)}</div>'


def _shead(eyebrow, title, lede="", split=False, level=2):
    lede_html = f'<p class="lede">{esc(lede)}</p>' if lede else ""
    head_html = f'<p class="eyebrow">{esc(eyebrow)}</p><h{level} class="h-1">{title}</h{level}>'
    if split and lede:
        return f'<div class="shead shead--split"><div>{head_html}</div>{lede_html}</div>'
    return f'<div class="shead">{head_html}{lede_html}</div>'


def _gallery_images(items):
    urls = []
    for g in items:
        for img in ([g.before, g.after] if g.kind == "pair" else [g.image]):
            u = img_url(img)
            if u and u not in urls:
                urls.append(u)
    return urls


def home(m):
    h = m.hero
    line2 = f'<br><span class="hero__accent">{esc(h.line2)}</span>' if h.line2 else ""
    trust = "".join(f'<li>{icon(icon_for(t))}<span>{esc(t)}</span></li>' for t in h.trust)
    trust_html = f'<ul class="hero__trust">{trust}</ul>' if trust else ""
    fig = ""
    if h.image and h.image.slug:
        fig = f'<div class="hero__fig">{picture(h.image, HERO_SIZES, eager=True)}</div>'

    stats = ""
    if m.stats:
        items = "".join(f'<li><b>{esc(s.number)}{esc(s.suffix)}</b><span>{esc(s.label)}</span></li>'
                        for s in m.stats)
        stats = f'<section class="stats" aria-label="At a glance"><ul class="wrap stats__list">{items}</ul></section>'

    results = ""
    showcase = m.pairs[:3]
    if showcase:
        results = f"""<section class="section section--mist" id="results">
  <div class="wrap">
    {_shead("Real results", "See the difference",
            "Drag the handle on any photo to compare before and after. Every one is a real job.", split=True)}
    <div class="shots shots--3">{"".join(shot(g, SLIDER_SIZES_3, "rv") for g in showcase)}</div>
    <p class="more"><a class="btn btn--line" href="/gallery.html">See all our work {icon("arrow")}</a></p>
  </div>
</section>"""

    about = m.about
    vals = "".join(f'<div class="val rv"><span class="val__ic">{icon(icon_for(v.title))}</span>'
                   f'<h3>{esc(v.title)}</h3><p>{esc(v.description)}</p></div>' for v in about.values)
    about_html = f"""<section class="section" id="about">
  <div class="wrap about">
    <div class="about__text rv">
      <p class="eyebrow">Why {esc(m.business.name.split(" ")[0])}</p>
      <h2 class="h-1">{esc(about.headline)}</h2>
      <p class="lede">{esc(about.description)}</p>
      <a class="btn btn--primary" href="/contact.html">Get a free estimate {icon("arrow")}</a>
    </div>
    <div class="about__vals">{vals}</div>
  </div>
</section>"""

    reviews = ""
    if m.testimonials:
        cards = "".join(
            f'<figure class="review rv"><div class="review__stars" aria-label="{t.rating} out of 5 stars">'
            f'{icon("star", "ic ic--star") * t.rating}</div><blockquote><p>{esc(t.text)}</p></blockquote>'
            f'<figcaption><b>{esc(t.name)}</b>{("<span>" + esc(t.service) + "</span>") if t.service else ""}'
            f'</figcaption></figure>' for t in m.testimonials)
        reviews = f"""<section class="section section--mist" id="reviews">
  <div class="wrap">{_shead("Reviews", "What customers say")}<div class="reviews">{cards}</div></div>
</section>"""

    towns = "".join(f"<li>{icon('pin')}<span>{esc(t)}</span></li>" for t in m.area)
    phone = (f" Call <a href=\"tel:{m.business.tel}\">{esc(m.business.phone)}</a> and ask."
             if m.business.tel else "")
    area = f"""<section class="section section--navy" id="area">
  <div class="wrap">
    <div class="shead shead--split">
      <div><p class="eyebrow">Service area</p><h2 class="h-1">Based in Whitestown.<br>Working across Greater Indianapolis.</h2></div>
      <p class="lede">Don't see your town?{phone}</p>
    </div>
    <ul class="towns rv">{towns}</ul>
  </div>
</section>"""

    faq = ""
    if m.faq:
        faq = f"""<section class="section" id="faq">
  <div class="wrap wrap--narrow">{_shead("Questions", "Frequently asked questions")}{faq_list(m.faq)}</div>
</section>"""

    title = f"Power & Soft Washing in Whitestown, IN | {m.business.name}"
    desc = ("House washing, roof cleaning, driveways, decks, and commercial power washing across "
            f"Greater Indianapolis. Based in Whitestown, IN. Free estimates.")
    body = f"""<main id="main">
<section class="hero">
  <div class="hero__grid">
    <div class="hero__body">
      <p class="hero__kicker"><span class="dot" aria-hidden="true"></span>Whitestown · Greater Indianapolis</p>
      <h1 class="hero__h">{esc(h.line1)}{line2}</h1>
      <p class="hero__sub">{esc(h.sub)}</p>
      {_hero_acts(m)}
      {trust_html}
    </div>
    {fig}
  </div>
</section>
{stats}
<section class="section" id="services">
  <div class="wrap">
    {_shead("What we clean", "The right wash for every surface",
            "Gentle soft washing for roofs and siding, high-pressure cleaning for concrete, and the judgment to know which is which.",
            split=True)}
    {_svc_rows(m.services)}
  </div>
</section>
{results}
{about_html}
{reviews}
{area}
{faq}
{cta_band(m)}
</main>
"""
    ld = [_ld(m), seo.faq_ld(m.faq)]
    images = [u for u in [img_url(h.image)] if u] + _gallery_images(showcase)
    return Page("/index.html", head(m, title, desc, "/", ld=ld) + header(m, "home") + body + footer(m),
                images, True)


def service(m, s):
    items = [g for g in m.gallery if g.category == s.id]
    fig = (f'<div class="phead__fig">{picture(s.image, PHEAD_SIZES, eager=True)}</div>'
           if s.image and s.image.slug else "")
    intro = s.intro or s.description
    steps = ""
    if s.steps:
        lis = "".join(f'<li><span class="steps__n" aria-hidden="true">{i}</span><p>{esc(t)}</p></li>'
                      for i, t in enumerate(s.steps, 1))
        steps = f'<div class="svc-detail__block rv"><h2 class="h-2">How we do it</h2><ol class="steps">{lis}</ol></div>'
    surfaces = ""
    if s.surfaces:
        lis = "".join(f"<li>{icon('check')}<span>{esc(t)}</span></li>" for t in s.surfaces)
        surfaces = f'<div class="svc-detail__block rv"><h2 class="h-2">What we clean</h2><ul class="chips">{lis}</ul></div>'
    results = ""
    if items:
        results = f"""<section class="section section--mist">
  <div class="wrap">
    {_shead("Real results", f"{esc(s.title)}: before and after", "Drag the handle to compare.", split=True)}
    <div class="shots shots--2">{"".join(shot(g, SLIDER_SIZES_2, "rv") for g in items)}</div>
    <p class="more"><a class="btn btn--line" href="/gallery.html">See all our work {icon("arrow")}</a></p>
  </div>
</section>"""
    faq = ""
    if s.faq:
        faq = f"""<section class="section">
  <div class="wrap wrap--narrow">{_shead("Questions", f"{esc(s.title)} questions")}{faq_list(s.faq)}</div>
</section>"""
    others = [o for o in m.services if o.id != s.id]
    related = ""
    if others:
        related = f"""<section class="section section--tight">
  <div class="wrap">{_shead("More services", "Other ways we can help")}{_svc_rows(others, compact=True)}</div>
</section>"""

    title = f"{s.title} in Whitestown, IN | {m.business.name}"
    desc = f"{s.summary} {m.business.name} serves Whitestown and Greater Indianapolis. Free estimates."
    path = f"/services/{s.id}.html"
    body = f"""<main id="main">
<section class="phead{'' if fig else ' phead--text'}">
  <div class="phead__grid">
    <div class="phead__body">
      {crumbs([("Home", "/"), (s.title, None)])}
      <p class="eyebrow">Service</p>
      <h1 class="phead__h">{esc(s.title)}</h1>
      <p class="phead__lede">{esc(s.summary)}</p>
      {_hero_acts(m, f"/contact.html?service={s.id}", "Get a free estimate")}
    </div>
    {fig}
  </div>
</section>
<section class="section">
  <div class="wrap svc-detail">
    <div class="svc-detail__intro rv"><p class="lede">{esc(intro)}</p></div>
    {steps}
    {surfaces}
  </div>
</section>
{results}
{faq}
{related}
{cta_band(m, f"Get a free {s.title.lower()} estimate", "Tell us what needs cleaning and we'll tell you what it takes. No pressure, no obligation.")}
</main>
"""
    og = img_url(s.image)
    ld = [_ld(m), seo.breadcrumb_ld([("Home", "/"), (s.title, path)], markup.BASE),
          seo.service_ld(s, m, markup.BASE, og), seo.faq_ld(s.faq)]
    images = [u for u in [og] if u] + _gallery_images(items)
    return Page(path, head(m, title, desc, path, og_image=og, ld=ld) + header(m, s.id) + body + footer(m),
                images, True)


def gallery(m):
    names = {s.id: s.title for s in m.services}
    cats = []
    for g in m.gallery:
        if g.category not in cats:
            cats.append(g.category)
    order = [s.id for s in m.services if s.id in cats] + (["general"] if "general" in cats else [])
    buttons = "".join(f'<button type="button" data-filter="{c}" aria-pressed="false">'
                      f'{esc(names.get(c, "Other jobs"))}</button>' for c in order)
    filt = ""
    if len(order) > 1:
        filt = (f'<div class="gal-filter" role="group" aria-label="Filter photos by service">'
                f'<button type="button" data-filter="all" aria-pressed="true">All</button>{buttons}</div>')
    shots = "".join(shot(g, SLIDER_SIZES_2, "rv") for g in m.gallery)
    empty = "" if m.gallery else '<p class="lede">Photos are on their way.</p>'
    title = f"Before & After Photos | {m.business.name}"
    desc = ("Drag-to-compare before and after photos from real SudsAway ProWash jobs: siding, roofs, "
            "driveways, patios, and more around Greater Indianapolis.")
    body = f"""<main id="main">
<section class="phead phead--text">
  <div class="phead__grid">
    <div class="phead__body">
      {crumbs([("Home", "/"), ("Our Work", None)])}
      <p class="eyebrow">Our work</p>
      <h1 class="phead__h">Before and after</h1>
      <p class="phead__lede">Real jobs, not stock photos. Drag the handle on any photo to compare.</p>
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    {filt}
    <div class="shots shots--2 gal">{shots}</div>
    {empty}
  </div>
</section>
{cta_band(m, "Want results like these?")}
</main>
"""
    ld = [_ld(m), seo.breadcrumb_ld([("Home", "/"), ("Our Work", "/gallery.html")], markup.BASE)]
    return Page("/gallery.html", head(m, title, desc, "/gallery.html", ld=ld) + header(m, "gallery") + body
                + footer(m), _gallery_images(m.gallery), True)


def contact(m):
    b = m.business
    checks = "".join(f'<label class="check"><input type="checkbox" name="services" value="{s.id}">'
                     f'<span>{esc(s.title)}</span></label>' for s in m.services)
    towns = "".join(f'<option value="{esc(t)}"></option>' for t in m.area)
    direct = []
    if b.tel:
        direct.append(f'<a class="direct__tel" href="tel:{b.tel}">{icon("phone")}<span>{esc(b.phone)}</span></a>')
    if b.email:
        direct.append(f'<a href="mailto:{esc(b.email)}">{icon("mail")}<span>{esc(b.email)}</span></a>')
    if b.hours:
        hours = "".join(f"<span>{esc(x.strip())}</span>" for x in b.hours.split("|") if x.strip())
        direct.append(f'<p>{icon("clock")}<span class="direct__hours">{hours}</span></p>')
    direct.append(f'<p>{icon("pin")}<span>{esc(", ".join(m.area))}</span></p>')
    call_err = (f' or call <a href="tel:{b.tel}">{esc(b.phone)}</a>' if b.tel else "")
    urgent = (f' If it\'s urgent, call <a href="tel:{b.tel}">{esc(b.phone)}</a>.' if b.tel else "")
    title = f"Free Estimate | {b.phone} | {b.name}" if b.phone else f"Free Estimate | {b.name}"
    desc = ("Request a free power washing or soft washing estimate in Whitestown and Greater "
            f"Indianapolis. Call {b.phone} or send the form.")
    body = f"""<main id="main">
<section class="phead phead--text">
  <div class="phead__grid">
    <div class="phead__body">
      {crumbs([("Home", "/"), ("Contact", None)])}
      <p class="eyebrow">Contact</p>
      <h1 class="phead__h">Get a free estimate</h1>
      <p class="phead__lede">Tell us what needs cleaning and where. Call for the fastest answer, or send the form and we'll get back to you.</p>
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap contact">
    <div class="contact__main">
      <h2 class="h-2">Request an estimate</h2>
      <div class="qok" role="status" tabindex="-1" hidden>
        <b>Thanks, your request is on its way.</b>
        <span>We'll get back to you soon.{urgent}</span>
      </div>
      <form class="qform" method="POST" action="https://formsubmit.co/{FORM_ADDRESS}">
        <input type="hidden" name="_subject" value="[SudsAway Web] New estimate request">
        <input type="hidden" name="_replyto" value="">
        <input type="hidden" name="_next" value="{FORM_NEXT}">
        <input type="hidden" name="_template" value="table">
        <input type="hidden" name="_captcha" value="false">
        <input type="hidden" name="Submitted from" value="/contact.html">
        <p class="vh" aria-hidden="true"><label>Leave this empty <input type="text" name="_honey" tabindex="-1" autocomplete="off"></label></p>
        <div class="qrow">
          <div class="field">
            <label for="f-name">Name <span class="req">(required)</span></label>
            <input id="f-name" name="name" required autocomplete="name">
            <span class="field__err">Please tell us your name.</span>
          </div>
          <div class="field">
            <label for="f-phone">Phone <span class="req">(required)</span></label>
            <input id="f-phone" name="phone" type="tel" required autocomplete="tel" inputmode="tel">
            <span class="field__err">Please enter a 10-digit phone number.</span>
          </div>
        </div>
        <div class="qrow">
          <div class="field">
            <label for="f-email">Email</label>
            <input id="f-email" name="email" type="email" autocomplete="email">
            <span class="field__err">That email address doesn't look right.</span>
          </div>
          <div class="field">
            <label for="f-town">Town</label>
            <input id="f-town" name="town" list="towns" autocomplete="address-level2">
            <datalist id="towns">{towns}</datalist>
          </div>
        </div>
        <div class="field">
          <label for="f-property">Property type</label>
          <select id="f-property" name="property">
            <option>Home</option>
            <option>Business</option>
          </select>
        </div>
        <fieldset class="field">
          <legend>What needs cleaning?</legend>
          <div class="checks">{checks}</div>
        </fieldset>
        <div class="field">
          <label for="f-msg">Anything else we should know?</label>
          <textarea id="f-msg" name="message" rows="4"></textarea>
        </div>
        <button class="btn btn--primary btn--lg" type="submit">Send request {icon("arrow")}</button>
        <p class="qsend-err" role="alert" hidden>That didn't send. Please try again{call_err}.</p>
        <p class="qnote">We only use this to get back to you about your estimate.</p>
      </form>
    </div>
    <aside class="contact__side">
      <div class="card card--navy direct">
        <h2 class="h-3">Reach us directly</h2>
        {"".join(direct)}
      </div>
    </aside>
  </div>
</section>
</main>
"""
    ld = [_ld(m), seo.breadcrumb_ld([("Home", "/"), ("Contact", "/contact.html")], markup.BASE)]
    return Page("/contact.html", head(m, title, desc, "/contact.html", ld=ld) + header(m, "contact") + body
                + footer(m), [], True)


def thanks(m):
    b = m.business
    call = (f' If it\'s urgent, call <a href="tel:{b.tel}">{esc(b.phone)}</a>.' if b.tel else "")
    body = f"""<main id="main">
<section class="phead phead--text phead--tall">
  <div class="phead__grid">
    <div class="phead__body">
      <p class="eyebrow">Request received</p>
      <h1 class="phead__h">Thanks, we've got it.</h1>
      <p class="phead__lede">We'll get back to you soon.{call}</p>
      <div class="acts">
        <a class="btn btn--primary btn--lg" href="/gallery.html">See our work {icon("arrow")}</a>
        <a class="btn btn--ghost btn--lg" href="/">Back to home</a>
      </div>
    </div>
  </div>
</section>
</main>
"""
    return Page("/thanks.html", head(m, f"Thanks | {b.name}", "Your estimate request has been sent.",
                                     "/thanks.html", ld=[_ld(m)], noindex=True)
                + header(m) + body + footer(m), [], False)


def not_found(m):
    links = "".join(f'<li><a href="/services/{s.id}.html">{esc(s.title)}</a></li>' for s in m.services)
    body = f"""<main id="main">
<section class="phead phead--text phead--tall">
  <div class="phead__grid">
    <div class="phead__body">
      <p class="eyebrow">Page not found</p>
      <h1 class="phead__h">That page washed away.</h1>
      <p class="phead__lede">The link may be old or mistyped. These should get you where you're going.</p>
      <div class="acts">
        <a class="btn btn--primary btn--lg" href="/">Go to the home page {icon("arrow")}</a>
        <a class="btn btn--ghost btn--lg" href="/contact.html">Get a free estimate</a>
      </div>
      <ul class="lost-links">{links}<li><a href="/gallery.html">Our work</a></li></ul>
    </div>
  </div>
</section>
</main>
"""
    return Page("/404.html", head(m, f"Page not found | {m.business.name}",
                                  "This page doesn't exist. Find SudsAway ProWash services, photos, and a free estimate here.",
                                  "/404.html", noindex=True)
                + header(m) + body + footer(m), [], False)


def render_all(m):
    pages = [home(m)] + [service(m, s) for s in m.services] + [gallery(m), contact(m), thanks(m), not_found(m)]
    return pages
