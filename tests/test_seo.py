import os
import sys
import unittest
from types import SimpleNamespace as NS
from xml.dom import minidom

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import seo  # noqa: E402

BASE = "https://sudsawayprowash.com"


def model():
    return NS(
        business=NS(name="SudsAway ProWash", phone="(708) 334-2685", tel="+17083342685",
                    email="a@b.co", hours="Mon-Sat"),
        area=["Whitestown", "Zionsville"],
        services=[NS(id="roof-cleaning", title="Roof Cleaning", summary="Streaks gone.",
                     description="Roof cleaning.")],
        faq=[NS(q="Q?", a="A.")],
    )


class StructuredData(unittest.TestCase):
    def test_business_has_area_and_no_rating(self):
        ld = seo.business_ld(model(), BASE, BASE + "/assets/img/hero-1280.jpg")
        self.assertNotIn("aggregateRating", ld)
        self.assertIn({"@type": "City", "name": "Zionsville, IN"}, ld["areaServed"])
        offer = ld["hasOfferCatalog"]["itemListElement"][0]["itemOffered"]
        self.assertEqual(offer["url"], BASE + "/services/roof-cleaning.html")

    def test_empty_faq_emits_nothing(self):
        self.assertIsNone(seo.faq_ld([]))
        self.assertEqual(len(seo.faq_ld([NS(q="Q?", a="A.")])["mainEntity"]), 1)


class SiteFiles(unittest.TestCase):
    def test_sitemap(self):
        pages = [{"loc": "/", "images": [BASE + "/assets/img/a-1280.jpg"]},
                 {"loc": "/gallery.html", "images": []}]
        xml = seo.sitemap(pages, BASE, "2026-09-21")
        doc = minidom.parseString(xml)
        locs = [n.firstChild.data for n in doc.getElementsByTagName("loc")]
        self.assertEqual(locs, [BASE + "/", BASE + "/gallery.html"])
        self.assertEqual(len(doc.getElementsByTagName("image:loc")), 1)
        self.assertNotIn("/admin/", xml)

    def test_robots(self):
        txt = seo.robots(BASE)
        self.assertIn("Disallow: /admin/", txt)
        self.assertIn(f"Sitemap: {BASE}/sitemap.xml", txt)

    def test_llms_mentions_phone_and_services(self):
        txt = seo.llms(model(), BASE)
        self.assertIn("(708) 334-2685", txt)
        self.assertIn(BASE + "/services/roof-cleaning.html", txt)


if __name__ == "__main__":
    unittest.main()
