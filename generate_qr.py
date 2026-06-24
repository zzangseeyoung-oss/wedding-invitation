from __future__ import annotations

from pathlib import Path

import qrcode


BASE = Path(__file__).resolve().parent
URL_FILE = BASE / "mobile-url.txt"
OUT_FILE = BASE / "assets" / "mobile_qr.png"


def read_url() -> str:
    if not URL_FILE.exists():
        raise SystemExit(f"URL file not found: {URL_FILE}")
    url = URL_FILE.read_text(encoding="utf-8-sig").strip()
    if not url.startswith(("https://", "http://")) or "YOUR_" in url:
        raise SystemExit("mobile-url.txt must contain the final deployed URL.")
    return url


def main() -> None:
    url = read_url()
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=12,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#111111", back_color="#ffffff").convert("RGBA")
    image.save(OUT_FILE)
    print(OUT_FILE)


if __name__ == "__main__":
    main()
