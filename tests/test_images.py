import os
import sys
import tempfile
import unittest

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import renditions as I  # noqa: E402


class Slugs(unittest.TestCase):
    def test_collision_gets_extension(self):
        s = I.assign_slugs(["images/Foo Bar.jpg", "images/foo-bar.png", "images/x.jpeg"])
        self.assertEqual(s["images/Foo Bar.jpg"], "foo-bar")
        self.assertEqual(s["images/foo-bar.png"], "foo-bar-png")
        self.assertEqual(s["images/x.jpeg"], "x")


class Widths(unittest.TestCase):
    def test_stops_at_native_width(self):
        self.assertEqual(I.widths_for(2000), [(480, 480), (800, 800), (1280, 1280), (1920, 1920)])
        self.assertEqual(I.widths_for(1179), [(480, 480), (800, 800), (1280, 1179)])
        self.assertEqual(I.widths_for(800), [(480, 480), (800, 800)])
        self.assertEqual(I.widths_for(300), [(480, 300)])


class Render(unittest.TestCase):
    def test_render_and_skip(self):
        root, out = tempfile.mkdtemp(), tempfile.mkdtemp()
        os.makedirs(os.path.join(root, "images"))
        im = Image.new("RGB", (1000, 600), "white")
        exif = Image.Exif()
        exif[0x0112] = 6  # displayed rotated 90 degrees
        im.save(os.path.join(root, "images", "p.jpg"), exif=exif)

        man = I.render(["images/p.jpg", "images/missing.jpg"], root, out)
        info = man["images/p.jpg"]
        self.assertEqual((info["w"], info["h"], info["slug"]), (600, 1000, "p"))
        self.assertEqual(info["widths"], [(480, 480), (800, 600)])
        for name in (480, 800):
            for ext in ("jpg", "webp"):
                self.assertTrue(os.path.exists(os.path.join(out, "assets", "img", f"p-{name}.{ext}")))
        self.assertFalse(os.path.exists(os.path.join(out, "assets", "img", "p-1280.jpg")))
        self.assertNotIn("images/missing.jpg", man)

        rendition = os.path.join(out, "assets", "img", "p-800.jpg")
        before = os.path.getmtime(rendition)
        I.render(["images/p.jpg"], root, out)
        self.assertEqual(before, os.path.getmtime(rendition))

    def test_never_upscales(self):
        root, out = tempfile.mkdtemp(), tempfile.mkdtemp()
        os.makedirs(os.path.join(root, "images"))
        Image.new("RGB", (300, 200), "white").save(os.path.join(root, "images", "s.png"))
        I.render(["images/s.png"], root, out)
        with Image.open(os.path.join(out, "assets", "img", "s-480.jpg")) as largest:
            self.assertEqual(largest.size, (300, 200))


if __name__ == "__main__":
    unittest.main()
