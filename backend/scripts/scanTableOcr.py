"""Offline OCR for a dense two-column scanned lab page; JSON on stdout only."""
import contextlib
import json
import re
import sys
import time


def boxes(result, side, offset=0):
    if result.boxes is None:
        return []
    return [
        {
            "side": side,
            "box": [[float(p[0]) + offset, float(p[1])] for p in box],
            "text": str(text),
            "score": float(score),
        }
        for box, text, score in zip(result.boxes.tolist(), result.txts, result.scores)
    ]


def is_number(text):
    return bool(re.fullmatch(r"[<>]?[+-]?\d+(?:\.\d+)?", text.strip()))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: scanTableOcr.py image-file")
    import cv2
    from rapidocr import RapidOCR

    image = cv2.imread(sys.argv[1])
    if image is None or image.shape[0] < 400 or image.shape[1] < 400:
        raise RuntimeError("invalid scan image")
    height, width = image.shape[:2]
    if width * height > 18_000_000:
        raise RuntimeError("scan image exceeds OCR pixel limit")
    started = time.monotonic()
    with contextlib.redirect_stdout(sys.stderr):
        engine = RapidOCR()
        full = boxes(engine(image), "full")
        left_values = sum(is_number(row["text"]) and width * 0.20 < row["box"][0][0] < width * 0.33 for row in full)
        right_values = sum(is_number(row["text"]) and width * 0.66 < row["box"][0][0] < width * 0.78 for row in full)
        if min(left_values, right_values) >= 5:
            split = round(width * 0.475)
            rows = boxes(engine(image[:, :split]), "left")
            rows.extend(boxes(engine(image[:, split:]), "right", split))
        else:
            rows = []
    if not rows:
        print(json.dumps({"layout": "unsupported", "width": width, "height": height,
                          "leftValues": left_values, "rightValues": right_values}))
        return
    # Full-page heading recognition completes titles cut at the column split.
    rows.extend(row for row in full if re.match(r"^[『【].{3,}", row["text"]))
    print(json.dumps({"layout": "two_column", "width": width, "height": height,
                      "leftValues": left_values, "rightValues": right_values,
                      "seconds": round(time.monotonic() - started, 1), "rows": rows}, ensure_ascii=False))


if __name__ == "__main__":
    main()
