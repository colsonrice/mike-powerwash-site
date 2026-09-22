import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import content as C  # noqa: E402


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
    raw = dict(BASE)
    raw.update(over)
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

    def test_summary_falls_back_to_first_sentence(self):
        root = repo_with()
        m = model(root, services=[{"id": "x", "title": "X",
                                   "description": "First bit. Second bit."}])
        self.assertEqual(m.services[0].summary, "First bit.")


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
        self.assertEqual(m.hero.image.path, "images/a.jpg")

    def test_hero_alt_only_used_for_the_photo_it_describes(self):
        root = repo_with("images/b.jpg", "images/a.jpg", "images/new.jpg")
        hero = {"headline": "X", "heroImage": "images/a.jpg", "heroAlt": "A clean driveway",
                "heroAltFor": "images/a.jpg"}
        self.assertEqual(model(root, hero=hero).hero.image.alt, "A clean driveway")
        hero["heroImage"] = "images/new.jpg"  # replaced in the admin; the alt no longer fits
        self.assertEqual(model(root, hero=hero).hero.image.alt, "A recent SudsAway ProWash job")

    def test_phone_href(self):
        m = model(repo_with())
        self.assertEqual(m.business.tel, "+17083342685")


class References(unittest.TestCase):
    def test_referenced_images(self):
        raw = {"hero": {"heroImage": "images/h.jpg"},
               "services": [{"image": "images/s.jpg"}],
               "gallery": [{"image": "images/a.jpg", "before": "images/b.jpg",
                            "after": "images/a.jpg"}]}
        self.assertEqual(sorted(C.referenced_images(raw)),
                         ["images/a.jpg", "images/b.jpg", "images/h.jpg", "images/s.jpg"])


if __name__ == "__main__":
    unittest.main()
