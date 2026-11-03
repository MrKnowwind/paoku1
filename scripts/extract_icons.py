"""Extract this project's icon atlas by alpha connectivity, without grid cropping."""

import argparse
from array import array
from collections import deque
from pathlib import Path
from statistics import median

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps


NAMES = [
    "coin", "magnet", "shield", "rocket", "hourglass", "shop",
    "trophy", "settings", "sound", "mute", "pause", "play",
    "home", "restart", "compass", "leaf", "language", "quality",
    "close", "check", "chevron", "arrow", "jump", "slide",
    "help", "sun", "lock", "bolt", "clock", "protection",
]


def components(alpha):
    width, height = alpha.size
    pixels = alpha.tobytes()
    labels = array("I", [0]) * (width * height)
    found = []
    next_label = 0
    for offset, opacity in enumerate(pixels):
        if opacity < 64 or labels[offset]:
            continue
        next_label += 1
        labels[offset] = next_label
        queue = deque([offset])
        area = sx = sy = 0
        left, top, right, bottom = width, height, 0, 0
        while queue:
            position = queue.popleft()
            x, y = position % width, position // width
            area += 1
            sx += x
            sy += y
            left, top = min(left, x), min(top, y)
            right, bottom = max(right, x + 1), max(bottom, y + 1)
            for yy in range(max(0, y - 1), min(height, y + 2)):
                for xx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = yy * width + xx
                    if not labels[neighbor] and pixels[neighbor] >= 64:
                        labels[neighbor] = next_label
                        queue.append(neighbor)
        if area >= 40:
            found.append({"label": next_label, "area": area,
                          "bounds": (left, top, right, bottom),
                          "center": (sx / area, sy / area)})
    return labels, found


def centers(values, count, extent):
    anchors = [(i + 0.5) * extent / count for i in range(count)]
    for _ in range(12):
        clusters = [[] for _ in anchors]
        for value in values:
            index = min(range(count), key=lambda i: abs(value - anchors[i]))
            clusters[index].append(value)
        updated = [median(group) if group else anchors[i]
                   for i, group in enumerate(clusters)]
        if updated == anchors:
            break
        anchors = updated
    return anchors


def extract(source, output):
    atlas = Image.open(source).convert("RGBA")
    width, height = atlas.size
    alpha = atlas.getchannel("A")
    labels, parts = components(alpha)
    bodies = [part for part in parts if part["area"] >= 6000]
    columns = centers([part["center"][0] for part in bodies], 6, width)
    rows = centers([part["center"][1] for part in bodies], 5, height)
    groups = [[] for _ in NAMES]
    for part in parts:
        x, y = part["center"]
        col = min(range(6), key=lambda i: abs(x - columns[i]))
        row = min(range(5), key=lambda i: abs(y - rows[i]))
        groups[row * 6 + col].append(part)

    output.mkdir(parents=True, exist_ok=True)
    for name, group in zip(NAMES, groups):
        if not group:
            raise ValueError(f"No alpha component found for {name}")
        # Layout only associates separated parts; no pixel is cut at a cell boundary.
        left = max(0, min(part["bounds"][0] for part in group) - 4)
        top = max(0, min(part["bounds"][1] for part in group) - 4)
        right = min(width, max(part["bounds"][2] for part in group) + 4)
        bottom = min(height, max(part["bounds"][3] for part in group) + 4)
        selected = {part["label"] for part in group}
        box = (left, top, right, bottom)
        crop = atlas.crop(box)
        mask = Image.new("L", crop.size)
        mask_pixels = mask.load()
        for y in range(top, bottom):
            for x in range(left, right):
                if labels[y * width + x] in selected:
                    mask_pixels[x - left, y - top] = 255
        # Keep original glass/translucent pixels enclosed by the icon's opaque body.
        exterior = mask.copy()
        ImageDraw.floodfill(exterior, (0, 0), 255)
        mask = ImageChops.lighter(mask, ImageOps.invert(exterior))
        support = crop.getchannel("A").point(lambda a: 255 if a > 2 else 0)
        for _ in range(3):
            mask = ImageChops.multiply(mask.filter(ImageFilter.MaxFilter(3)), support)
        crop.putalpha(ImageChops.multiply(crop.getchannel("A"), mask))
        bounds = crop.getbbox()
        if bounds is None:
            raise ValueError(f"Empty icon after alpha extraction: {name}")
        crop = crop.crop(bounds)
        crop.thumbnail((224, 224), Image.Resampling.LANCZOS)
        icon = Image.new("RGBA", (256, 256))
        icon.alpha_composite(crop, ((256 - crop.width) // 2, (256 - crop.height) // 2))
        icon.save(output / f"{name}.png", optimize=True)
        print(f"{name}: {len(group)} connected part(s), source bounds {box}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    extract(arguments.source, arguments.output)
