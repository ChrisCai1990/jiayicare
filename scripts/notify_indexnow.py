#!/usr/bin/env python3
"""Notify IndexNow-compatible search engines after public GEO content changes."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree


SITE_ROOT = Path(__file__).resolve().parents[1] / "geo-knowledge-center"
KEY = "b9e35782f58b460aaaf4e786641fd950"
HOST = "jiaycare.com"
KEY_LOCATION = f"https://{HOST}/knowledge/{KEY}.txt"


def main() -> None:
    sitemap = ElementTree.parse(SITE_ROOT / "sitemap.xml")
    urls = [node.text for node in sitemap.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    payload = json.dumps({"host": HOST, "key": KEY, "keyLocation": KEY_LOCATION, "urlList": urls}).encode("utf-8")
    request = Request("https://api.indexnow.org/indexnow", data=payload, headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
    with urlopen(request, timeout=20) as response:
        print(f"IndexNow accepted {len(urls)} URLs (HTTP {response.status}).")


if __name__ == "__main__":
    main()
