"""Generate dark.css: dark-theme overrides for every rule in the site's stylesheets that sets a colour.

  python3 scripts/build_dark_css.py          # writes dark.css
  python3 scripts/build_dark_css.py --check  # fails if dark.css is out of date

Each rule that sets a colour gets an override under html[data-theme="dark"]:
  - light backgrounds -> dark surfaces in the same hue (white -> the card colour),
  - dark text -> light text in the same hue,
  - light borders -> dim borders,
  - saturated or mid-tone colours (brand, data, warnings used as accents) are kept.
Text on a light-on-dark button (white text on var(--green)) is switched to dark text,
because the dark theme's green is light. Hand-written rules (maps, tiles, controls)
are in MANUAL below. Run again after changing any stylesheet.
"""
from __future__ import annotations

import colorsys
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ["styles.css", "atlas.css", "accessibility.css", "analysis.css", "statistics.css", "charts.css",
           "vendor/leaflet/leaflet.css", "vendor/markercluster/MarkerCluster.css", "vendor/markercluster/MarkerCluster.Default.css"]
OUT = ROOT / "dark.css"
DARK = 'html[data-theme="dark"]'

VARS = {"--ink": "#e3ece8", "--green": "#62c79e", "--muted": "#a3b7af", "--line": "#2c3f39", "--paper": "#0f1a17",
        "--light": "#1a2a25", "--white": "#16231f",
        # used by charts.js / statistics-charts.js / maps
        "--chart-bg": "#16231f", "--chart-text": "#c9d8d2", "--chart-muted": "#93aaa1", "--chart-grid": "#2c3f39",
        "--chart-track": "#22332e", "--chart-bar": "#4fb38a", "--chart-title": "#e3ece8",
        "--chart-ref": "#e6a46c"}
ON_ACCENT = "#0b1512"
SURFACE = "#16231f"                      # cards and panels (light theme: white)
THEME_HUE = 0.44                        # green-grey           # text on light-green buttons in the dark theme

NAMED = {"white": "#ffffff", "black": "#000000"}
COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b")
PROPS = {"color", "background", "background-color", "border", "border-color", "border-top", "border-bottom", "border-left",
         "border-right", "border-top-color", "border-bottom-color", "border-left-color", "border-right-color", "fill", "stroke",
         "outline-color", "box-shadow", "text-shadow"}


def parse_colour(token):
    token = NAMED.get(token, token)
    if token.startswith("#"):
        h = token[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return r, g, b, a
    nums = [float(x) for x in re.findall(r"[\d.]+%?", token.replace("%", ""))]
    r, g, b = (v / 255 for v in nums[:3])
    return r, g, b, (nums[3] if len(nums) > 3 else 1.0)


def fmt(r, g, b, a):
    hx = "#" + "".join(f"{round(max(0, min(1, v)) * 255):02x}" for v in (r, g, b))
    return hx if a >= 0.999 else f"rgba({round(r * 255)},{round(g * 255)},{round(b * 255)},{a:.2f})".replace("0.", ".", 1) if a < 1 else hx


def recolour(token, kind):
    r, g, b, a = parse_colour(token)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if kind == "bg":
        if l >= 0.985 and s < 0.5:
            return fmt(*parse_colour(SURFACE)[:3], a)
        if l >= 0.92:
            if s < 0.4:                       # near-neutral tints take the site's green-grey hue
                h, s = THEME_HUE, 0.2
            l, s = 0.11 + (1 - l) * 0.9, min(s, 0.3)
        elif l >= 0.72:
            l, s = 0.18 + (0.92 - l) * 0.5, s * 0.6
        else:
            return token
    elif kind == "text":
        if l >= 0.55:
            return token
        l = min(0.9, 1 - l * 0.8)
    elif kind == "border":
        if l >= 0.7:
            l, s = 0.22 + (1 - l) * 0.6, s * 0.4
        else:
            return token
    elif kind == "shadow":
        return fmt(0, 0, 0, min(0.6, a * 2.5))
    return fmt(*colorsys.hls_to_rgb(h, l, s), a)


def kind_of(prop):
    if prop.startswith("background"):
        return "bg"
    if prop in ("color", "fill"):
        return "text"
    if prop in ("box-shadow", "text-shadow"):
        return "shadow"
    return "border"


def rules(css):
    """Yield (media, selector, declarations) for flat CSS with one level of @media."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    i, media_stack = 0, []
    token = re.compile(r"\s*(@media[^{]+|@supports[^{]+|@keyframes[^{]+|[^{}]+)\{|\s*\}")
    while i < len(css):
        m = token.match(css, i)
        if not m:
            break
        if m.group(0).strip() == "}":
            if media_stack:
                media_stack.pop()
            i = m.end()
            continue
        head = m.group(1).strip()
        if head.startswith("@media") or head.startswith("@supports"):
            media_stack.append(head)
            i = m.end()
            continue
        if head.startswith("@keyframes"):
            depth, j = 1, m.end()
            while depth and j < len(css):
                depth += {"{": 1, "}": -1}.get(css[j], 0)
                j += 1
            i = j
            continue
        end = css.index("}", m.end())
        yield (media_stack[-1] if media_stack else None), head, css[m.end():end]
        i = end + 1


def scoped(selector):
    out = []
    for part in selector.split(","):
        part = part.strip()
        if not part or part.startswith(":root") or part.startswith("@"):
            continue
        if part.startswith("html"):
            out.append(part.replace("html", DARK, 1))
        else:
            out.append(f"{DARK} {part}")
    return ",".join(out)


def build():
    blocks = {}
    for name in SOURCES:
        for media, selector, body in rules((ROOT / name).read_text(encoding="utf-8")):
            sel = scoped(selector)
            if not sel:
                continue
            decls = [d.strip() for d in body.split(";") if ":" in d]
            props = {}
            for d in decls:
                prop, value = (x.strip() for x in d.split(":", 1))
                props[prop.lower()] = value
            out = []
            for prop, value in props.items():
                if prop.startswith("--") and COLOUR.fullmatch(value.strip()):
                    # page-level copies of the theme variables (e.g. .statistics-page{--ink:...})
                    if prop in VARS:
                        out.append(f"{prop}:{VARS[prop]}")
                    else:
                        l = colorsys.rgb_to_hls(*parse_colour(value.strip())[:3])[1]
                        out.append(f"{prop}:{recolour(value.strip(), 'bg' if l >= 0.6 else 'text')}")
                    continue
                if prop not in PROPS or not COLOUR.search(value):
                    continue
                new = COLOUR.sub(lambda m: recolour(m.group(0), kind_of(prop)), value)
                if new != value:
                    out.append(f"{prop}:{new}")
            bg = props.get("background", props.get("background-color", ""))
            if "var(--green)" in bg and re.search(r"^(#fff(fff)?|white)$", props.get("color", "").replace("!important", "").strip()):
                out = [d for d in out if not d.startswith("color:")] + [f"color:{ON_ACCENT}"]
            if out:
                blocks.setdefault(media, []).append(f"{sel}{{{';'.join(out)}}}")
    lines = ["/* Generated by scripts/build_dark_css.py: dark-theme overrides. Do not edit by hand; change MANUAL in the script. */",
             f"{DARK}{{color-scheme:dark;{';'.join(f'{k}:{v}' for k, v in VARS.items())}}}"]
    for media, items in blocks.items():
        lines.append(f"{media}{{{''.join(items)}}}" if media else "\n".join(items))
    lines.append(MANUAL.strip())
    return "\n".join(lines) + "\n"


MANUAL = """
/* Hand-written: maps, tiles, controls and the theme button. */
html[data-theme="dark"] body{background:var(--paper);color:var(--ink)}
html[data-theme="dark"] .leaflet-container{background:#1b2622}
html[data-theme="dark"] .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.9) contrast(.85) saturate(.6)}
html[data-theme="dark"] .light-basemap-tiles{filter:grayscale(1) brightness(1.06) contrast(.85)}
html[data-theme="dark"] .leaflet-bar a,html[data-theme="dark"] .leaflet-bar a:hover{background:#1c2b26;color:var(--ink);border-bottom-color:#2c3f39}
html[data-theme="dark"] .leaflet-control-attribution{background:rgba(15,26,23,.85)!important;color:#a3b7af}
html[data-theme="dark"] .leaflet-control-attribution a{color:#8fd3b5}
html[data-theme="dark"] .leaflet-tooltip{background:#1c2b26;color:var(--ink);border-color:#2c3f39}
html[data-theme="dark"] .leaflet-tooltip-top:before{border-top-color:#1c2b26}
html[data-theme="dark"] .leaflet-popup-content-wrapper,html[data-theme="dark"] .leaflet-popup-tip{background:#1c2b26;color:var(--ink)}
html[data-theme="dark"] .leaflet-control.map-layer-control,html[data-theme="dark"] .choropleth-legend,html[data-theme="dark"] .flood-legend{background:rgba(22,35,31,.95);color:var(--ink);border-color:#2c3f39}
html[data-theme="dark"] .map-layer-control .map-layer-row,html[data-theme="dark"] .map-layer-control legend,html[data-theme="dark"] .map-layer-control fieldset label{color:var(--ink)}
html[data-theme="dark"] .map-layer-control select{background:#0f1a17;color:var(--ink);border-color:#3a4e47}
html[data-theme="dark"] .leaflet-boundaries-pane path.boundary-division{stroke:#e8f1ed}
html[data-theme="dark"] .leaflet-boundaries-pane path.boundary-district{stroke:#b7cbc3}
html[data-theme="dark"] .leaflet-boundaries-pane path.boundary-upazila{stroke:#8ea69d}
/* Flood layers and their legend swatches: flip lightness so more water reads brighter on the dark map. */
html[data-theme="dark"] .flood-raster,html[data-theme="dark"] .flood-legend i{filter:invert(1) hue-rotate(180deg)}
html[data-theme="dark"] select,html[data-theme="dark"] input,html[data-theme="dark"] textarea{background:#0f1a17;color:var(--ink);border-color:#3a4e47}
.theme-toggle{display:inline-flex;align-items:center;gap:6px}
.theme-toggle .theme-icon{font-size:15px;line-height:1}
@media(max-width:700px){.theme-toggle .theme-label{display:none}}
"""

if __name__ == "__main__":
    css = build()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != css:
            sys.exit("dark.css is out of date: run python3 scripts/build_dark_css.py")
        print("dark.css is up to date")
    else:
        OUT.write_text(css, encoding="utf-8")
        print(f"wrote {OUT.relative_to(ROOT)} ({len(css):,} bytes)")
