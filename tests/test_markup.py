import os
import re
import sys
import unittest
from types import SimpleNamespace as NS

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import markup  # noqa: E402

WIDE = NS(slug="wide", w=1888, h=963, alt="Siding",
          widths=[(480, 480), (800, 800), (1280, 1280), (1920, 1888)])
TALL = NS(slug="tall", w=1280, h=1707, alt="Driveway", widths=[(480, 480), (800, 800), (1280, 1280)])
BOX_4_3 = [("(max-width: 719px)", "92vw", 4 / 3), (None, "370px", 4 / 3)]


def sizes_of(html):
    return re.search(r'<img[^>]* sizes="([^"]*)"', html).group(1)


class Picture(unittest.TestCase):
    def test_wide_photo_in_4_3_box_asks_for_more_pixels(self):
        # 1888x963 is about 1.96:1; covering a 4:3 box scales it about 1.47x wider than the box.
        s = sizes_of(markup.picture(WIDE, BOX_4_3))
        self.assertEqual(s, "(max-width: 719px) calc(92vw * 1.47), 544px")

    def test_tall_photo_needs_no_scaling(self):
        self.assertEqual(sizes_of(markup.picture(TALL, BOX_4_3)), "(max-width: 719px) 92vw, 370px")

    def test_srcset_lists_real_widths_only(self):
        html = markup.picture(WIDE, BOX_4_3)
        self.assertIn("/assets/img/wide-1920.webp 1888w", html)
        self.assertNotIn("tall-1920", markup.picture(TALL, BOX_4_3))

    def test_missing_renditions_render_nothing(self):
        self.assertEqual(markup.picture(NS(slug=None, w=0, h=0, alt="", widths=[]), BOX_4_3), "")


if __name__ == "__main__":
    unittest.main()
