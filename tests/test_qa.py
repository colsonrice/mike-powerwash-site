import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import qa  # noqa: E402

GOOD_HEAD = """<!doctype html><html><head><title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://example.com/x">
<meta property="og:image" content="https://example.com/a.jpg">
{extra}</head><body><main id="main">{body}</main></body></html>"""

DESC = "A description that is long enough to sit inside the ideal range for search results snippets, about here."


def page(body="<h1>Hi</h1>", title="A fine title", desc=DESC, extra=""):
    return GOOD_HEAD.format(title=title, desc=desc, extra=extra, body=body)


def site(**pages):
    d = tempfile.mkdtemp()
    for name, html in pages.items():
        path = os.path.join(d, name.replace("__", "/") + ".html")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
    return d


class Contrast(unittest.TestCase):
    def test_known_ratios(self):
        self.assertEqual(round(qa.contrast("#ffffff", "#ff6b35"), 1), 2.8)
        self.assertEqual(round(qa.contrast("#061539", "#ff6b35"), 1), 6.3)

    def test_token_pair_below_aa_is_a_problem(self):
        probs = qa.check_tokens(":root{--muted:#999999; --paper:#ffffff}", [("--muted", "--paper", 4.5)])
        self.assertTrue(probs)
        self.assertFalse(qa.check_tokens(":root{--muted:#586379; --paper:#ffffff}", [("--muted", "--paper", 4.5)]))


class Pages(unittest.TestCase):
    def check(self, html, **more):
        d = site(index=html, **more)
        return qa.check_page(os.path.join(d, "index.html"), d)

    def test_clean_page(self):
        self.assertEqual(self.check(page())[0], [])

    def test_missing_h1_is_a_problem(self):
        self.assertTrue(self.check(page(body="<h2>No h1</h2>"))[0])

    def test_img_alt(self):
        probs, _ = self.check(page(body='<h1>x</h1><img src="/index.html" loading="lazy">'))
        self.assertTrue(any("alt" in p for p in probs))
        probs, _ = self.check(page(body='<h1>x</h1><img src="/index.html" alt="" loading="lazy">'))
        self.assertEqual(probs, [])

    def test_broken_local_link_and_anchor(self):
        probs, _ = self.check(page(body='<h1>x</h1><a href="/missing.html">m</a>'))
        self.assertTrue(any("missing.html" in p for p in probs))
        probs, _ = self.check(page(body='<h1>x</h1><a href="/#nowhere">m</a>'))
        self.assertTrue(any("nowhere" in p for p in probs))
        probs, _ = self.check(page(body='<h1>x</h1><a href="/#main">m</a> <a href="tel:+15551234567">t</a>'))
        self.assertEqual(probs, [])

    def test_prefix_is_stripped(self):
        d = site(index=page(body='<h1>x</h1><a href="/demo/index.html">home</a>'))
        self.assertEqual(qa.check_page(os.path.join(d, "index.html"), d, prefix="/demo")[0], [])

    def test_long_title_is_only_a_warning(self):
        probs, warns = self.check(page(title="T" * 70))
        self.assertEqual(probs, [])
        self.assertTrue(warns)

    def test_bad_json_ld_is_a_problem(self):
        probs, _ = self.check(page(extra='<script type="application/ld+json">{nope</script>'))
        self.assertTrue(any("JSON-LD" in p for p in probs))

    def test_unlabelled_input(self):
        probs, _ = self.check(page(body='<h1>x</h1><input name="q"><input type="hidden" name="h">'))
        self.assertEqual(len(probs), 1)
        probs, _ = self.check(page(body='<h1>x</h1><label for="q">Q</label><input id="q" name="q">'
                                        '<label>Wrapped <input name="w"></label>'))
        self.assertEqual(probs, [])


class Site(unittest.TestCase):
    def test_duplicate_titles_warn_only_and_admin_skipped(self):
        d = site(a=page(), b=page(), admin__index="<html><h1>1</h1><h1>2</h1></html>")
        css = os.path.join(os.path.dirname(__file__), "..", "assets", "css", "site.css")
        os.makedirs(os.path.join(d, "assets", "css"))
        with open(css, encoding="utf-8") as src, open(os.path.join(d, "assets", "css", "site.css"), "w") as dst:
            dst.write(src.read())
        probs, warns = qa.check_site(d)
        self.assertEqual(probs, [])
        self.assertTrue(any("duplicate title" in w for w in warns))


if __name__ == "__main__":
    unittest.main()
