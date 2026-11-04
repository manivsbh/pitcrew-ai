"""Compose the YouTube / X thumbnail from the Muse Image background.

Usage: .venv\\Scripts\\python.exe submission/video/thumbnail.py
Reads broll/thumbnail.png (run `broll/gen.py thumbnail` first) and writes
submission/thumbnail.jpg at 1280x720, under YouTube's 2 MB limit.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
SRC = HERE / "broll" / "thumbnail.png"
OUT = HERE.parent / "thumbnail.jpg"

W, H = 1280, 720
LEFT = 64
TEXT_MAX_W = 560
LIME = (197, 242, 146)
CYAN = (103, 212, 255)
WHITE = (245, 247, 242)
INK = (10, 12, 13)
BLACK = "C:/Windows/Fonts/seguibl.ttf"
BOLD = "C:/Windows/Fonts/segoeuib.ttf"


def cover(img: Image.Image) -> Image.Image:
    scale = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    x, y = (img.width - W) // 2, (img.height - H) // 2
    return img.crop((x, y, x + W, y + H))


def left_shade(img: Image.Image) -> Image.Image:
    ramp = Image.linear_gradient("L").rotate(90).resize((W, H))
    mask = ramp.point(lambda v: int(max(0.0, 1.0 - (255 - v) / 255 / 0.55) * 200))
    return Image.composite(Image.new("RGB", (W, H), INK), img, mask)


def fit(text: str, path: str, size: int) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(path, size)
    while font.getlength(text) > TEXT_MAX_W and size > 20:
        size -= 2
        font = ImageFont.truetype(path, size)
    return font


def glow_text(base: Image.Image, xy, text, font, fill, glow) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(xy, text, font=font, fill=glow + (255,))
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(14)))
    ImageDraw.Draw(base).text(xy, text, font=font, fill=fill,
                              stroke_width=2, stroke_fill=INK)


def main() -> None:
    img = left_shade(cover(Image.open(SRC).convert("RGB"))).convert("RGBA")
    d = ImageDraw.Draw(img)

    mark = ImageFont.truetype(BLACK, 34)
    d.text((LEFT, 52), "PITCREW", font=mark, fill=WHITE)
    d.text((LEFT + mark.getlength("PITCREW"), 52), ".ai", font=mark, fill=LIME)

    head = fit("1968 PATENT", BLACK, 104)
    y = 180
    glow_text(img, (LEFT, y), "1968 PATENT", head, WHITE, (40, 50, 40))

    y += head.size + 14
    to = ImageFont.truetype(BOLD, 60)
    d.text((LEFT, y + 38), "to", font=to, fill=CYAN)
    twin = fit("3D TWIN", BLACK, 132)
    glow_text(img, (LEFT + 84, y), "3D TWIN", twin, LIME, LIME)

    y += twin.size + 40
    d.text((LEFT, y), "in 40 seconds, with Meta AI", font=ImageFont.truetype(BOLD, 34), fill=WHITE)

    pill = ImageFont.truetype(BLACK, 26)
    label = "BUILT ON META MUSE"
    top = H - 96
    d.rounded_rectangle((LEFT, top, LEFT + pill.getlength(label) + 44, top + 50), radius=25, fill=LIME)
    d.text((LEFT + 22, top + 8), label, font=pill, fill=INK)

    img.convert("RGB").save(OUT, "JPEG", quality=90, optimize=True)
    print("wrote", OUT.name, OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
