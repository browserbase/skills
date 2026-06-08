#!/usr/bin/env python3
"""Make an HTML brief self-contained and portable.

Finds every <img src="local-file"> in the input HTML, compresses the image
(downscale to a sane width + JPEG, via `sips` on macOS when available), and
rewrites the src to a base64 data URI. Remote (http/https) and existing
data: srcs are left untouched.

Usage:
    python3 embed_images.py input.html [output.html] [--no-open]

If output.html is omitted, writes alongside input as <name>-portable.html.
By default the result is opened in the user's browser (macOS `open`, Linux
`xdg-open`, Windows `os.startfile`). Pass --no-open to suppress.
Why this exists: a markdown/HTML brief that references screenshots by relative
path shows broken images the moment it's moved or sent. Inlining guarantees the
brief renders anywhere. Keep screenshots as VIEWPORT captures of the specific
hook (see SKILL.md Step 3) — full-page captures embed blurry.
"""
import base64, mimetypes, pathlib, re, shutil, subprocess, sys, tempfile

MAX_WIDTH = 1300      # plenty sharp for a brief; keeps the file small
JPEG_QUALITY = 88

def compress(src: pathlib.Path) -> tuple[bytes, str]:
    """Return (bytes, mime). Compress raster images via sips if present."""
    mime, _ = mimetypes.guess_type(src.name)
    raw = src.read_bytes()
    if not shutil.which("sips") or (mime or "").endswith(("svg+xml", "gif")):
        return raw, (mime or "application/octet-stream")
    try:
        with tempfile.TemporaryDirectory() as td:
            out = pathlib.Path(td) / "out.jpg"
            subprocess.run(
                ["sips", "-s", "format", "jpeg", "-s", "formatOptions",
                 str(JPEG_QUALITY), "--resampleWidth", str(MAX_WIDTH),
                 str(src), "--out", str(out)],
                check=True, capture_output=True,
            )
            # only use the compressed version if it actually shrank things
            data = out.read_bytes()
            return (data, "image/jpeg") if len(data) < len(raw) else (raw, mime or "image/png")
    except Exception:
        return raw, (mime or "image/png")

def open_in_browser(path: pathlib.Path) -> None:
    """Open the file in the default browser, cross-platform. Best-effort."""
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", str(path)], check=False)
        elif sys.platform.startswith("win"):
            import os
            os.startfile(str(path))  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", str(path)], check=False)
    except Exception as e:
        print(f"  (could not auto-open: {e})")

def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if not args:
        print(__doc__); return 1
    inp = pathlib.Path(args[0]).resolve()
    out = pathlib.Path(args[1]).resolve() if len(args) > 1 \
        else inp.with_name(inp.stem + "-portable.html")
    html = inp.read_text()
    base = inp.parent

    def repl(m: re.Match) -> str:
        src = m.group("src")
        if src.startswith(("http://", "https://", "data:")):
            return m.group(0)
        img = (base / src).resolve()
        if not img.exists():
            print(f"  ! missing image, left as-is: {src}")
            return m.group(0)
        data, mime = compress(img)
        b64 = base64.b64encode(data).decode()
        print(f"  embedded {src} ({len(data)//1024} KB, {mime})")
        return m.group(0).replace(src, f"data:{mime};base64,{b64}")

    html = re.sub(r'<img\b[^>]*?\bsrc=["\'](?P<src>[^"\']+)["\']', repl, html)
    out.write_text(html)
    print(f"wrote {out} ({len(html.encode())//1024} KB)")
    if "--no-open" not in flags:
        open_in_browser(out)
        print(f"  opened {out.name} in browser")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
