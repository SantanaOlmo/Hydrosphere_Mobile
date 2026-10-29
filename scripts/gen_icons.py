"""Genera iconos Android/PWA desde assets/icons/app/sphr.svg (logo escritorio)."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "assets" / "icons" / "app" / "sphr-1024.png"
BG = (13, 15, 18, 255)


def main() -> None:
    if not MASTER.exists():
        raise SystemExit(
            "Falta sphr-1024.png. Ejecuta antes: node scripts/render_sphr_icon.js"
        )

    src = Image.open(MASTER).convert("RGBA")

    def make_icon(size: int, pad: float = 0.10) -> Image.Image:
        canvas = Image.new("RGBA", (size, size), BG)
        inner = int(size * (1 - 2 * pad))
        icon = src.resize((inner, inner), Image.Resampling.LANCZOS)
        off = (size - inner) // 2
        canvas.paste(icon, (off, off), icon)
        return canvas

    def make_fg(size: int) -> Image.Image:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = int(size * 0.66)
        icon = src.resize((inner, inner), Image.Resampling.LANCZOS)
        off = (size - inner) // 2
        canvas.paste(icon, (off, off), icon)
        return canvas

    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    fg = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }

    res = ROOT / "android" / "app" / "src" / "main" / "res"
    (res / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#0D0F12</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )

    for folder, size in sizes.items():
        d = res / folder
        make_icon(size).save(d / "ic_launcher.png")
        make_icon(size).save(d / "ic_launcher_round.png")
        make_fg(fg[folder]).save(d / "ic_launcher_foreground.png")
        print("ok", folder)

    for size in (192, 512):
        make_icon(size).save(ROOT / "assets" / "icons" / f"app-icon-{size}.png")
        print("pwa", size)


if __name__ == "__main__":
    main()
