"""Encode the max-tier in-game warehouse capture as the shared b-roll loop."""

from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
FRAME_DIR = ROOT / "design-qa-evidence" / "cinematic-capture-frames"
OUTPUT_DIR = ROOT / "public" / "media"
WIDTH, HEIGHT = 960, 540
FRAME_MS = 125


def grade_frame(path: Path) -> Image.Image:
    with Image.open(path) as source:
        frame = source.convert("RGB")
    # The desktop preview overlays a small north marker in its bottom strip.
    # Crop that capture-only region, then restore the 16:9 delivery frame.
    crop_bottom = min(frame.height, 480)
    frame = frame.crop((0, 0, frame.width, crop_bottom)).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    frame = ImageEnhance.Color(frame).enhance(0.88)
    frame = ImageEnhance.Contrast(frame).enhance(1.08)
    return frame.filter(ImageFilter.GaussianBlur(radius=0.55))


def main() -> None:
    paths = sorted(FRAME_DIR.glob("frame-*.png"))
    if len(paths) < 24:
        raise SystemExit(f"Expected a recorded game sequence in {FRAME_DIR}; found {len(paths)} frames")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    frames = [grade_frame(path) for path in paths]
    poster = OUTPUT_DIR / "gpu-fab-broll-poster.webp"
    animation = OUTPUT_DIR / "gpu-fab-broll.webp"
    frames[0].save(poster, "WEBP", quality=80, method=6)
    frames[0].save(
        animation,
        "WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_MS,
        loop=0,
        quality=56,
        method=4,
    )
    print(f"Encoded {len(frames)} in-game frames to {animation.relative_to(ROOT)} ({animation.stat().st_size / 1024 / 1024:.2f} MiB)")


if __name__ == "__main__":
    main()
