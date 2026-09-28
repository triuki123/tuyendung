from __future__ import annotations

import json
import math
from pathlib import Path
from typing import List

from PIL import Image, ImageDraw, ImageFont, ImageFilter


DOCS_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = DOCS_ROOT.parent
MANIFEST_PATH = DOCS_ROOT / "video-guides" / "manifest.json"
OUT_DIR = DOCS_ROOT / "public" / "videos"
POSTER_DIR = OUT_DIR / "posters"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def pick_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates += [
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/segoeuib.ttf"),
        ]
    candidates += [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


FONT_BRAND = pick_font(24, bold=True)
FONT_EYEBROW = pick_font(21, bold=True)
FONT_TITLE = pick_font(46, bold=True)
FONT_SUMMARY = pick_font(24, bold=False)
FONT_STEP = pick_font(24, bold=True)
FONT_CAPTION = pick_font(28, bold=False)
FONT_FOOTER = pick_font(18, bold=False)


def ensure_dirs() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    POSTER_DIR.mkdir(parents=True, exist_ok=True)


def rounded_box(draw: ImageDraw.ImageDraw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> List[str]:
    words = text.split()
    lines: List[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        width = draw.textbbox((0, 0), candidate, font=font)[2]
        if width <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def fit_image(img: Image.Image, box_w: int, box_h: int, zoom: float) -> Image.Image:
    source = img.convert("RGB")
    scale = max(box_w / source.width, box_h / source.height) * zoom
    new_size = (max(1, int(source.width * scale)), max(1, int(source.height * scale)))
    resized = source.resize(new_size, Image.LANCZOS)
    left = max(0, (resized.width - box_w) // 2)
    top = max(0, (resized.height - box_h) // 2)
    return resized.crop((left, top, left + box_w, top + box_h))


def build_background(width: int, height: int) -> Image.Image:
    bg = Image.new("RGB", (width, height), "#09182e")
    px = bg.load()
    for y in range(height):
        ratio = y / max(1, height - 1)
        r = int(7 + (16 - 7) * ratio)
        g = int(26 + (44 - 26) * ratio)
        b = int(52 + (87 - 52) * ratio)
        for x in range(width):
            wave = math.sin((x / width) * math.pi * 1.4) * 8
            px[x, y] = (min(255, r + int(wave)), min(255, g + int(wave)), min(255, b + int(wave * 1.3)))
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((width - 360, -40, width + 20, 330), fill=(124, 155, 255, 36))
    od.ellipse((-120, height - 280, 300, height + 120), fill=(71, 115, 255, 28))
    return Image.alpha_composite(bg.convert("RGBA"), overlay).convert("RGBA")


def render_frame(config: dict, guide: dict, slide: dict, slide_index: int, progress: float) -> Image.Image:
    width = config["width"]
    height = config["height"]
    frame = build_background(width, height)
    draw = ImageDraw.Draw(frame)

    rounded_box(draw, (60, 42, 280, 84), 22, (255, 255, 255, 18))
    draw.text((84, 53), config["brand"], font=FONT_BRAND, fill="#dce7ff")
    draw.text((width - 200, 52), guide["eyebrow"], font=FONT_EYEBROW, fill="#8fb0ff")

    draw.text((60, 120), guide["title"], font=FONT_TITLE, fill="#ffffff")
    summary_lines = wrap_text(draw, guide["summary"], FONT_SUMMARY, width - 140)
    for i, line in enumerate(summary_lines[:2]):
        draw.text((60, 180 + i * 30), line, font=FONT_SUMMARY, fill="#d5ddf3")

    img = None
    if slide.get("image"):
        img_path = REPO_ROOT / slide["image"]
        if img_path.exists():
            img = Image.open(img_path)

    image_box = (60, 240, 1220, 580)
    if img is not None:
        shadow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle((image_box[0] + 8, image_box[1] + 12, image_box[2] + 8, image_box[3] + 12), radius=28, fill=(0, 0, 0, 90))
        shadow = shadow.filter(ImageFilter.GaussianBlur(16))
        frame = Image.alpha_composite(frame, shadow)

        box_w = image_box[2] - image_box[0]
        box_h = image_box[3] - image_box[1]
        zoom = 1.02 + progress * 0.05
        fitted = fit_image(img, box_w, box_h, zoom=zoom).convert("RGBA")
        mask = Image.new("L", (box_w, box_h), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, box_w, box_h), radius=28, fill=255)
        glass = Image.new("RGBA", (box_w, box_h), (7, 13, 24, 28))
        frame.alpha_composite(glass, (image_box[0], image_box[1]))
        frame.paste(fitted, (image_box[0], image_box[1]), mask)

    card = (88, 598, 1192, 690)
    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle(card, radius=24, fill=(6, 15, 28, 214))
    od.rounded_rectangle((106, 616, 162, 672), radius=18, fill=(66, 95, 255, 255))
    od.text((121, 629), f"{slide_index + 1:02d}", font=FONT_STEP, fill="#ffffff")
    caption_lines = wrap_text(od, slide["caption"], FONT_CAPTION, 930)
    for i, line in enumerate(caption_lines[:2]):
        od.text((188, 620 + i * 31), line, font=FONT_CAPTION, fill="#ffffff")
    frame = Image.alpha_composite(frame, overlay)

    draw = ImageDraw.Draw(frame)
    draw.text((60, 698), "Hướng dẫn nhanh cho người dùng", font=FONT_FOOTER, fill="#b1bfdc")
    return frame.convert("RGB")


def generate_frames(manifest: dict, guide: dict) -> List[Image.Image]:
    config = {
        "brand": manifest["brand"],
        "width": manifest["canvas"]["width"],
        "height": manifest["canvas"]["height"],
    }
    frames: List[Image.Image] = []
    frames_per_slide = 12
    for idx, slide in enumerate(guide["slides"]):
        for frame_idx in range(frames_per_slide):
            progress = frame_idx / max(1, frames_per_slide - 1)
            frames.append(render_frame(config, guide, slide, idx, progress))
    return frames


def save_guide(manifest: dict, guide: dict) -> None:
    frames = generate_frames(manifest, guide)
    if not frames:
        return
    webp_path = OUT_DIR / f"{guide['slug']}.webp"
    poster_path = POSTER_DIR / f"{guide['slug']}.png"
    frames[0].save(poster_path, format="PNG")
    frames[0].save(
        webp_path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=140,
        loop=0,
        quality=84,
        method=6,
    )
    print(f"Generated {webp_path.relative_to(REPO_ROOT)}")


def main():
    ensure_dirs()
    manifest = load_manifest()
    for guide in manifest["guides"]:
        save_guide(manifest, guide)


if __name__ == "__main__":
    main()
