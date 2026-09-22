"""Nothing the admin panel can save may break the build or fail QA.

Builds the real content plus exactly what the admin's "Add" buttons and edits
produce, then requires QA to report zero problems.
"""
import copy
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "build"))
import build  # noqa: E402
import qa  # noqa: E402


def admin_edge_content():
    with open(os.path.join(ROOT, "data", "content.json"), encoding="utf-8") as f:
        c = json.load(f)
    c = copy.deepcopy(c)
    new_service = {"id": "new-service", "title": "New Service", "description": "", "icon": "star",
                   "image": "images/placeholder.png"}
    c["services"] += [dict(new_service), dict(new_service)]
    c["services"][0]["id"] = "house-wash"  # an edited id orphans gallery categories that used the old one
    c["gallery"] += [
        {"image": "", "caption": "New Project", "category": "general"},
        {"image": "images/driveway-wash-after.jpg", "caption": " ", "category": "decks"},
        {"before": "images/patio-wash-before.jpg", "after": "images/patio-wash-after.jpg",
         "image": "images/gutter-cleanout-after.jpg", "caption": "Replaced photo", "category": "driveway-concrete"},
    ]
    c["testimonials"].append({"name": "New Customer", "rating": 5, "text": "", "service": "House Washing"})
    c["faq"].append({"question": "New Question?", "answer": ""})
    c["stats"].append({"number": 0, "suffix": "+", "label": "New Stat"})
    return c


class AdminEdgeCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.out = os.path.join(cls.tmp, "site")
        fixture = os.path.join(cls.tmp, "content.json")
        with open(fixture, "w", encoding="utf-8") as f:
            json.dump(admin_edge_content(), f, ensure_ascii=False, indent=2)
        with redirect_stdout(io.StringIO()) as log:
            cls.build_status = build.main(["--content", fixture, "--out", cls.out])
        cls.build_log = log.getvalue()

    def test_build_succeeds_and_warns(self):
        self.assertEqual(self.build_status, 0)
        self.assertIn("placeholder.png", self.build_log)

    def test_qa_has_no_problems(self):
        with redirect_stdout(io.StringIO()) as log:
            status = qa.main(["--site", self.out])
        self.assertEqual(status, 0, log.getvalue())

    def test_duplicate_and_edited_services_get_pages(self):
        for name in ("new-service", "new-service-2", "house-wash"):
            self.assertTrue(os.path.exists(os.path.join(self.out, "services", f"{name}.html")), name)

    def test_half_finished_entries_do_not_appear(self):
        with open(os.path.join(self.out, "index.html"), encoding="utf-8") as f:
            home = f.read()
        for text in ("New Stat", "New Customer", "New Question?"):
            self.assertNotIn(text, home)

    def test_replaced_pair_photo_shows(self):
        with open(os.path.join(self.out, "gallery.html"), encoding="utf-8") as f:
            gallery = f.read()
        self.assertIn("gutter-cleanout-after", gallery)
        self.assertIn("Replaced photo", gallery)


if __name__ == "__main__":
    unittest.main()
