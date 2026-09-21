"""Structured data and the plain-text site files (sitemap, robots, llms.txt)."""
from xml.sax.saxutils import escape


def business_ld(m, base, image_url=None):
    ld = {
        "@context": "https://schema.org",
        "@type": "HomeAndConstructionBusiness",
        "@id": base + "/#business",
        "name": m.business.name,
        "url": base + "/",
        "telephone": m.business.tel or m.business.phone,
        "email": m.business.email,
        "address": {"@type": "PostalAddress", "addressLocality": "Whitestown",
                    "addressRegion": "IN", "addressCountry": "US"},
        "areaServed": [{"@type": "City", "name": f"{town}, IN"} for town in m.area],
        "priceRange": "$$",
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Exterior cleaning services",
            "itemListElement": [
                {"@type": "Offer", "itemOffered": {
                    "@type": "Service", "name": s.title, "description": s.summary,
                    "url": f"{base}/services/{s.id}.html"}}
                for s in m.services
            ],
        },
    }
    if image_url:
        ld["image"] = image_url
    return ld


def breadcrumb_ld(items, base):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i, "name": name, "item": base + path}
            for i, (name, path) in enumerate(items, 1)
        ],
    }


def faq_ld(faqs):
    if not faqs:
        return None
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": f.q,
                        "acceptedAnswer": {"@type": "Answer", "text": f.a}} for f in faqs],
    }


def service_ld(service, m, base, image_url=None):
    ld = {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": service.title,
        "serviceType": service.title,
        "description": service.description,
        "url": f"{base}/services/{service.id}.html",
        "provider": {"@id": base + "/#business"},
        "areaServed": [{"@type": "City", "name": f"{town}, IN"} for town in m.area],
    }
    if image_url:
        ld["image"] = image_url
    return ld


def sitemap(pages, base, today):
    rows = []
    for p in pages:
        imgs = "".join(f"\n    <image:image><image:loc>{escape(u)}</image:loc></image:image>"
                       for u in p.get("images", []))
        rows.append(f"  <url>\n    <loc>{escape(base + p['loc'])}</loc>\n"
                    f"    <lastmod>{today}</lastmod>{imgs}\n  </url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
            + "\n".join(rows) + "\n</urlset>\n")


def robots(base):
    return f"User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: {base}/sitemap.xml\n"


def llms(m, base):
    b = m.business
    services = "\n".join(f"- [{s.title}]({base}/services/{s.id}.html): {s.summary}" for s in m.services)
    return f"""# {b.name}

> Power washing and soft washing based in Whitestown, Indiana, serving Greater Indianapolis: house washing, roof cleaning, driveways and concrete, decks and fences, and commercial properties.

## Contact

- Phone: {b.phone}
- Email: {b.email}
- Hours: {b.hours}
- Estimates: free, requested at {base}/contact.html

## Service area

{", ".join(m.area)}, Indiana.

## Services

{services}

## Pages

- [Home]({base}/): services, before and after photos, service area, FAQ
- [Our work]({base}/gallery.html): before and after photos by service
- [Contact]({base}/contact.html): estimate request form

## Notes for assistants

- Estimates are free. The fastest way to reach a person is the phone number above.
- Photos show real jobs. Don't attribute any photo to a named customer or address.
"""
