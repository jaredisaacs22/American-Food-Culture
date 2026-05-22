#!/usr/bin/env python3
"""
Sunbelt Rentals - Energy Management as a Service
ACEM Presentation Builder
Board-Level Quality | Sunbelt Brand Standards
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn
from lxml import etree

# ============================================================
# BRAND CONSTANTS — Sunbelt Rentals Official Color System
# ============================================================
ORANGE      = RGBColor(0xF4, 0x79, 0x20)   # #F47920  Primary Brand Orange
ORANGE_DARK = RGBColor(0xC4, 0x57, 0x00)   # #C45700  Deep Orange
ORANGE_LITE = RGBColor(0xFD, 0xEA, 0xD2)   # #FDEAD2  Orange Tint (cards)
DARK        = RGBColor(0x1D, 0x1D, 0x1B)   # #1D1D1B  Charcoal Black
DARK2       = RGBColor(0x2B, 0x2B, 0x29)   # #2B2B29  Slightly lighter dark
GRAY        = RGBColor(0x4D, 0x4D, 0x4D)   # #4D4D4D  Medium Gray
GRAY_MED    = RGBColor(0x7A, 0x7A, 0x7A)   # #7A7A7A  Light-medium gray
GRAY_LIGHT  = RGBColor(0xF2, 0xF2, 0xF2)   # #F2F2F2  Off-white
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)   # #FFFFFF  White
SLATE       = RGBColor(0x3A, 0x3A, 0x3A)   # #3A3A3A  Slide body bg alt

# Slide dimensions — 16:9 Widescreen
W = Inches(13.333)
H = Inches(7.5)


# ============================================================
# CORE UTILITIES
# ============================================================

def new_prs():
    prs = Presentation()
    prs.slide_width  = W
    prs.slide_height = H
    return prs


def blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def rect(slide, l, t, w, h, fill=None, line_color=None, line_w=Pt(0)):
    shp = slide.shapes.add_shape(1, l, t, w, h)
    if fill:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    else:
        shp.fill.background()
    if line_color:
        shp.line.color.rgb = line_color
        shp.line.width = line_w
    else:
        shp.line.fill.background()
    return shp


def txt(slide, text, l, t, w, h,
        size=18, bold=False, color=WHITE,
        align=PP_ALIGN.LEFT, italic=False, wrap=True):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    run.font.name = "Calibri"
    return tb


def txt_block(slide, lines, l, t, w, h,
              default_size=16, default_bold=False,
              default_color=WHITE, default_align=PP_ALIGN.LEFT,
              spacing_after=Pt(4)):
    """
    lines: list of dicts with keys text, size, bold, color, align, spacing_after
    or plain strings (use defaults).
    """
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if isinstance(line, dict):
            p.alignment = line.get('align', default_align)
            if line.get('spacing_after'):
                p.space_after = line['spacing_after']
            run = p.add_run()
            run.text = line.get('text', '')
            run.font.size = Pt(line.get('size', default_size))
            run.font.bold = line.get('bold', default_bold)
            run.font.italic = line.get('italic', False)
            run.font.color.rgb = line.get('color', default_color)
            run.font.name = "Calibri"
        else:
            p.alignment = default_align
            run = p.add_run()
            run.text = str(line)
            run.font.size = Pt(default_size)
            run.font.bold = default_bold
            run.font.color.rgb = default_color
            run.font.name = "Calibri"
    return tb


def orange_header_bar(slide, title, subtitle=None):
    """Standard slide top bar: full-width orange strip with white title."""
    rect(slide, Inches(0), Inches(0), W, Inches(1.15), fill=ORANGE)
    # Thin dark line below header
    rect(slide, Inches(0), Inches(1.15), W, Inches(0.04), fill=DARK)
    txt(slide, title, Inches(0.35), Inches(0.12), W - Inches(0.5), Inches(0.72),
        size=30, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
    if subtitle:
        txt(slide, subtitle, Inches(0.35), Inches(0.78), W - Inches(0.5), Inches(0.35),
            size=14, bold=False, color=WHITE, align=PP_ALIGN.LEFT)


def dark_section_slide(prs, eyebrow, title, subtitle=None):
    """Full-dark section divider slide with orange accents."""
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)
    # Left orange stripe
    rect(sl, Inches(0), Inches(0), Inches(0.35), H, fill=ORANGE)
    # Decorative horizontal bar
    rect(sl, Inches(0.35), Inches(3.45), W - Inches(0.35), Inches(0.06), fill=ORANGE)
    # Eyebrow
    txt(sl, eyebrow, Inches(0.6), Inches(2.2), Inches(10), Inches(0.5),
        size=13, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)
    # Title
    txt(sl, title, Inches(0.6), Inches(2.65), Inches(11.5), Inches(1.5),
        size=44, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
    # Subtitle
    if subtitle:
        txt(sl, subtitle, Inches(0.6), Inches(3.7), Inches(10), Inches(0.8),
            size=18, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def stat_box(slide, value, label, l, t, w=Inches(2.8), h=Inches(1.6),
             bg=ORANGE, val_color=WHITE, lbl_color=WHITE):
    """Metric/KPI card with large value and label."""
    rect(slide, l, t, w, h, fill=bg)
    # Value
    txt(slide, value, l + Inches(0.15), t + Inches(0.1), w - Inches(0.3), Inches(0.9),
        size=36, bold=True, color=val_color, align=PP_ALIGN.CENTER)
    # Label
    txt(slide, label, l + Inches(0.1), t + Inches(0.9), w - Inches(0.2), Inches(0.6),
        size=13, bold=False, color=lbl_color, align=PP_ALIGN.CENTER)


def stat_box_dark(slide, value, label, sublabel, l, t,
                  w=Inches(2.9), h=Inches(1.8)):
    """Dark card with orange value."""
    rect(slide, l, t, w, h, fill=DARK2)
    # Orange top accent
    rect(slide, l, t, w, Inches(0.06), fill=ORANGE)
    txt(slide, value, l + Inches(0.12), t + Inches(0.18), w - Inches(0.25), Inches(0.85),
        size=38, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
    txt(slide, label, l + Inches(0.12), t + Inches(0.95), w - Inches(0.25), Inches(0.45),
        size=13, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
    if sublabel:
        txt(slide, sublabel, l + Inches(0.12), t + Inches(1.35), w - Inches(0.25), Inches(0.35),
            size=11, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)


def bullet_row(slide, icon_char, headline, body, l, t, icon_size=22, head_size=15, body_size=12):
    """Orange bullet + headline + body text row."""
    # Orange circle bullet
    c = rect(slide, l, t + Inches(0.04), Inches(0.32), Inches(0.32), fill=ORANGE)
    txt(slide, icon_char, l, t, Inches(0.35), Inches(0.4),
        size=icon_size, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)
    # Headline
    txt(slide, headline, l + Inches(0.42), t, Inches(5.5), Inches(0.35),
        size=head_size, bold=True, color=DARK, align=PP_ALIGN.LEFT)
    # Body
    txt(slide, body, l + Inches(0.42), t + Inches(0.32), Inches(5.5), Inches(0.5),
        size=body_size, bold=False, color=GRAY, align=PP_ALIGN.LEFT)


def process_step(slide, number, title, body, l, t, w=Inches(2.7), h=Inches(2.8)):
    """Numbered process step card."""
    # Card background
    rect(slide, l, t, w, h, fill=GRAY_LIGHT)
    # Orange top accent
    rect(slide, l, t, w, Inches(0.08), fill=ORANGE)
    # Number circle
    num_r = Inches(0.45)
    rect(slide, l + Inches(0.15), t + Inches(0.2), num_r, num_r, fill=ORANGE)
    txt(slide, str(number), l + Inches(0.15), t + Inches(0.2), num_r, num_r,
        size=20, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    # Title
    txt(slide, title, l + Inches(0.15), t + Inches(0.82), w - Inches(0.3), Inches(0.55),
        size=14, bold=True, color=DARK, align=PP_ALIGN.LEFT)
    # Body
    txt(slide, body, l + Inches(0.15), t + Inches(1.38), w - Inches(0.3), Inches(1.3),
        size=11, bold=False, color=GRAY, align=PP_ALIGN.LEFT)


def orange_number_circle(slide, number, l, t, size=Inches(0.55)):
    rect(slide, l, t, size, size, fill=ORANGE)
    txt(slide, str(number), l, t, size, size,
        size=22, bold=True, color=WHITE, align=PP_ALIGN.CENTER)


def capability_card(slide, title, items, l, t, w=Inches(3.9), h=Inches(2.5)):
    """Dark card with orange header and bullet items."""
    rect(slide, l, t, w, h, fill=DARK2)
    rect(slide, l, t, w, Inches(0.55), fill=ORANGE)
    txt(slide, title, l + Inches(0.15), t + Inches(0.08), w - Inches(0.3), Inches(0.42),
        size=14, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
    for i, item in enumerate(items):
        txt(slide, f"▸  {item}",
            l + Inches(0.15), t + Inches(0.68) + Inches(i * 0.38),
            w - Inches(0.3), Inches(0.38),
            size=11, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)


def equipment_card(slide, category, spec_range, icon_label, l, t,
                   w=Inches(2.55), h=Inches(2.1)):
    """Product category card."""
    rect(slide, l, t, w, h, fill=WHITE,
         line_color=GRAY_LIGHT, line_w=Pt(1))
    # Top color bar
    rect(slide, l, t, w, Inches(0.08), fill=ORANGE)
    # Icon label area
    rect(slide, l, t + Inches(0.08), w, Inches(0.7), fill=DARK)
    txt(slide, icon_label, l, t + Inches(0.08), w, Inches(0.7),
        size=22, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)
    # Category text
    txt(slide, category, l + Inches(0.12), t + Inches(0.88), w - Inches(0.24), Inches(0.55),
        size=12, bold=True, color=DARK, align=PP_ALIGN.LEFT)
    # Spec range
    txt(slide, spec_range, l + Inches(0.12), t + Inches(1.4), w - Inches(0.24), Inches(0.55),
        size=11, bold=False, color=GRAY, align=PP_ALIGN.LEFT)


def comparison_col(slide, header, items, is_sunbelt, l, t, w=Inches(5.5), h=Inches(4.5)):
    """Side-by-side comparison column."""
    bg = ORANGE if is_sunbelt else GRAY_LIGHT
    hdr_text_col = WHITE if is_sunbelt else GRAY
    rect(slide, l, t, w, Inches(0.65), fill=bg)
    txt(slide, header, l + Inches(0.2), t + Inches(0.1), w - Inches(0.4), Inches(0.5),
        size=15, bold=True,
        color=WHITE if is_sunbelt else DARK,
        align=PP_ALIGN.LEFT)
    item_bg = DARK2 if is_sunbelt else WHITE
    for i, item in enumerate(items):
        ib = t + Inches(0.72) + Inches(i * 0.72)
        rect(slide, l, ib, w, Inches(0.65),
             fill=item_bg,
             line_color=None if is_sunbelt else GRAY_LIGHT,
             line_w=Pt(1) if not is_sunbelt else Pt(0))
        check = "✔" if is_sunbelt else "✘"
        chk_col = ORANGE if is_sunbelt else RGBColor(0xCC, 0x00, 0x00)
        txt(slide, check, l + Inches(0.15), ib + Inches(0.12), Inches(0.3), Inches(0.45),
            size=14, bold=True, color=chk_col, align=PP_ALIGN.LEFT)
        txt(slide, item, l + Inches(0.5), ib + Inches(0.12), w - Inches(0.65), Inches(0.45),
            size=12, bold=False,
            color=WHITE if is_sunbelt else GRAY,
            align=PP_ALIGN.LEFT)


# ============================================================
# SLIDE BUILDERS
# ============================================================

def slide_01_cover(prs):
    """Cover slide — dramatic dark background, orange accents."""
    sl = blank(prs)

    # Full dark background
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)

    # Right-side large orange accent panel (tapered via overlapping rects)
    rect(sl, Inches(9.8), Inches(0), Inches(3.533), H, fill=ORANGE_DARK)
    rect(sl, Inches(10.2), Inches(0), Inches(3.133), H, fill=ORANGE)

    # Diagonal design element — angled rect at top of right panel
    shp = sl.shapes.add_shape(1,
                               Inches(8.5), Inches(0),
                               Inches(2.0), Inches(7.5))
    shp.fill.solid()
    shp.fill.fore_color.rgb = DARK2
    shp.line.fill.background()
    shp.rotation = 0
    # Simulated "slash" via thin diagonal rectangle
    shp2 = sl.shapes.add_shape(1,
                                Inches(9.2), Inches(0),
                                Inches(0.9), Inches(7.5))
    shp2.fill.solid()
    shp2.fill.fore_color.rgb = DARK
    shp2.line.fill.background()
    shp2.rotation = 8

    # Left vertical orange accent bar
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)

    # Sunbelt "wordmark" area top-left
    txt(sl, "SUNBELT RENTALS",
        Inches(0.25), Inches(0.28), Inches(5.5), Inches(0.5),
        size=13, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)

    # Divider line
    rect(sl, Inches(0.25), Inches(0.82), Inches(5.0), Inches(0.03), fill=ORANGE)

    # Eyebrow text
    txt(sl, "POWER & HVAC DIVISION  |  ACEM EXECUTIVE BRIEFING",
        Inches(0.25), Inches(0.95), Inches(9.0), Inches(0.4),
        size=11, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Main title — large, bold, white
    txt(sl, "ENERGY MANAGEMENT",
        Inches(0.25), Inches(1.55), Inches(9.2), Inches(1.05),
        size=52, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
    txt(sl, "AS A SERVICE™",
        Inches(0.25), Inches(2.5), Inches(9.2), Inches(1.0),
        size=52, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)

    # Subtitle
    txt(sl, "Powering Construction's Clean Energy Future",
        Inches(0.25), Inches(3.6), Inches(8.5), Inches(0.55),
        size=20, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Horizontal divider
    rect(sl, Inches(0.25), Inches(4.28), Inches(5.5), Inches(0.04), fill=ORANGE)

    # Audience line
    txt(sl, "Presented to the Association of Construction Equipment Managers",
        Inches(0.25), Inches(4.45), Inches(9.0), Inches(0.45),
        size=13, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    txt(sl, "30–50 of the Nation's Largest Construction Contractors  |  2026",
        Inches(0.25), Inches(4.9), Inches(9.0), Inches(0.4),
        size=12, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Bottom bar
    rect(sl, Inches(0), H - Inches(0.5), W, Inches(0.5), fill=ORANGE_DARK)
    txt(sl, "CONFIDENTIAL — FOR ACEM MEMBER USE ONLY",
        Inches(0.3), H - Inches(0.44), Inches(8), Inches(0.38),
        size=10, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    txt(sl, "sunbeltrentals.com",
        W - Inches(2.5), H - Inches(0.44), Inches(2.3), Inches(0.38),
        size=10, bold=False, color=WHITE, align=PP_ALIGN.RIGHT)

    return sl


def slide_02_agenda(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "AGENDA", "Today's Briefing Overview")

    agenda_items = [
        ("01", "Sunbelt Rentals at a Glance",        "Scale, capabilities, and market leadership"),
        ("02", "The Energy Challenge",                "What's keeping contractors up at night"),
        ("03", "Complete Power & HVAC Portfolio",     "Generators • BESS • HVAC • Distribution"),
        ("04", "Energy Management as a Service™",     "From transactional rental to managed ecosystem"),
        ("05", "Hybrid Power & Microgrid Solutions",  "Combining generation, storage, and intelligence"),
        ("06", "Proven Results & Case Studies",       "Real data from real construction sites"),
        ("07", "Sustainability & ESG Impact",         "Carbon reduction pathways for your projects"),
        ("08", "Why Sunbelt Rentals",                 "Differentiation, scale, and partnership"),
    ]

    col1 = agenda_items[:4]
    col2 = agenda_items[4:]

    for i, (num, title, sub) in enumerate(col1):
        t = Inches(1.45) + Inches(i * 1.42)
        # Number box
        rect(sl, Inches(0.35), t, Inches(0.55), Inches(0.55), fill=ORANGE)
        txt(sl, num, Inches(0.35), t, Inches(0.55), Inches(0.55),
            size=16, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        txt(sl, title, Inches(1.05), t, Inches(5.4), Inches(0.35),
            size=14, bold=True, color=DARK, align=PP_ALIGN.LEFT)
        txt(sl, sub, Inches(1.05), t + Inches(0.33), Inches(5.4), Inches(0.3),
            size=11, bold=False, color=GRAY, align=PP_ALIGN.LEFT)
        # Light divider
        rect(sl, Inches(0.35), t + Inches(0.7), Inches(6.3), Inches(0.015),
             fill=GRAY_LIGHT)

    for i, (num, title, sub) in enumerate(col2):
        t = Inches(1.45) + Inches(i * 1.42)
        rect(sl, Inches(7.05), t, Inches(0.55), Inches(0.55), fill=ORANGE)
        txt(sl, num, Inches(7.05), t, Inches(0.55), Inches(0.55),
            size=16, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        txt(sl, title, Inches(7.75), t, Inches(5.2), Inches(0.35),
            size=14, bold=True, color=DARK, align=PP_ALIGN.LEFT)
        txt(sl, sub, Inches(7.75), t + Inches(0.33), Inches(5.2), Inches(0.3),
            size=11, bold=False, color=GRAY, align=PP_ALIGN.LEFT)
        rect(sl, Inches(7.05), t + Inches(0.7), Inches(6.1), Inches(0.015),
             fill=GRAY_LIGHT)

    # Vertical separator
    rect(sl, Inches(6.65), Inches(1.38), Inches(0.04), H - Inches(1.58), fill=GRAY_LIGHT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_03_at_a_glance(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)

    # Left orange stripe
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)

    # Top decorative band
    rect(sl, Inches(0.12), Inches(0), W - Inches(0.12), Inches(0.08), fill=ORANGE)

    # "SUNBELT RENTALS" eyebrow
    txt(sl, "SUNBELT RENTALS  |  AT A GLANCE",
        Inches(0.4), Inches(0.2), Inches(9), Inches(0.4),
        size=11, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)

    # Slide title
    txt(sl, "North America's Energy Rental Authority",
        Inches(0.4), Inches(0.68), Inches(9), Inches(0.75),
        size=34, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    rect(sl, Inches(0.4), Inches(1.48), Inches(4.5), Inches(0.04), fill=ORANGE)

    # Body subtext
    txt(sl, "Built on four decades of equipment excellence — and now engineering\nthe future of intelligent, sustainable temporary power.",
        Inches(0.4), Inches(1.62), Inches(7.0), Inches(0.75),
        size=15, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Main KPI stat boxes (row 1)
    stat_box_dark(sl, "950+",   "Locations Nationwide",      "U.S. & Canada",          Inches(0.4),  Inches(2.55), w=Inches(2.85), h=Inches(1.75))
    stat_box_dark(sl, "14,000+","Equipment Types",           "Comprehensive fleet",     Inches(3.45), Inches(2.55), w=Inches(2.85), h=Inches(1.75))
    stat_box_dark(sl, "#1",     "Largest BESS Rental Fleet", "In North America",        Inches(6.5),  Inches(2.55), w=Inches(2.85), h=Inches(1.75))
    stat_box_dark(sl, "40+",    "Years of Innovation",       "Founded 1983",            Inches(9.55), Inches(2.55), w=Inches(3.4), h=Inches(1.75))

    # Row 2 — additional differentiators
    diff_items = [
        ("Ashtead Group", "Part of a $26B global enterprise with investment-grade balance sheet"),
        ("24/7 Support",  "Round-the-clock technical experts, remote monitoring & dispatch"),
        ("EMaaS™ Pioneer", "Early adopter and market leader in managed energy ecosystems"),
        ("DEIF Certified", "Proprietary controller ecosystem for hybrid & microgrid applications"),
    ]
    for i, (label, sub) in enumerate(diff_items):
        l = Inches(0.4) + Inches(i * 3.25)
        rect(sl, l, Inches(4.52), Inches(3.1), Inches(0.04), fill=ORANGE)
        txt(sl, label, l, Inches(4.62), Inches(3.1), Inches(0.38),
            size=13, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        txt(sl, sub, l, Inches(4.98), Inches(3.1), Inches(0.55),
            size=10, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=ORANGE_DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    return sl


def slide_04_energy_challenge(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "THE ENERGY CHALLENGE", "What Today's Largest Contractors Are Facing")

    # Left info panel
    rect(sl, Inches(0), Inches(1.19), Inches(4.5), H - Inches(1.57), fill=DARK)
    rect(sl, Inches(0), Inches(1.19), Inches(0.12), H - Inches(1.57), fill=ORANGE)

    txt(sl, "The Stakes Have Never\nBeen Higher",
        Inches(0.3), Inches(1.4), Inches(4.0), Inches(0.95),
        size=22, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, "Construction's energy demands are\nexploding while sustainability mandates\ntighten and project complexity soars.\nThe gap between power need and\npower strategy has never been wider.",
        Inches(0.3), Inches(2.45), Inches(3.9), Inches(1.6),
        size=13, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Market stats
    rect(sl, Inches(0.3), Inches(4.18), Inches(3.6), Inches(0.04), fill=ORANGE)
    market_stats = [
        ("$8.3B",  "US Power Rental Market by 2030"),
        ("62%",    "Projects face power capacity shortfalls"),
        ("40%",    "Of generator runtime at inefficient load"),
    ]
    for i, (val, lbl) in enumerate(market_stats):
        t = Inches(4.3) + Inches(i * 0.8)
        txt(sl, val, Inches(0.3), t, Inches(1.1), Inches(0.45),
            size=22, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        txt(sl, lbl, Inches(1.5), t + Inches(0.05), Inches(2.6), Inches(0.4),
            size=11, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Right side — pain point cards
    pain_points = [
        ("⚡", "Unpredictable Power Demand",
         "Loads fluctuate 5:1 between startup peaks and steady-state — legacy rental can't adapt in real time."),
        ("💰", "Fuel Cost & Waste",
         "Diesel generators running at 20–40% capacity burn fuel at worst-case efficiency, inflating project budgets."),
        ("🌱", "ESG & Carbon Mandates",
         "Owner-mandated Scope 3 emissions reporting places new accountability on power source decisions."),
        ("🔧", "Maintenance Complexity",
         "Multi-vendor equipment, inconsistent protocols, and 24/7 operations strain in-house technical teams."),
        ("🏗️", "Grid Infrastructure Gaps",
         "Utility upgrades averaging 3–6 months force contractors into costly interim power solutions without a plan."),
    ]

    for i, (icon, head, body) in enumerate(pain_points):
        t = Inches(1.35) + Inches(i * 1.2)
        rect(sl, Inches(4.75), t, Inches(8.25), Inches(1.08),
             fill=GRAY_LIGHT if i % 2 == 0 else WHITE,
             line_color=GRAY_LIGHT, line_w=Pt(1))
        rect(sl, Inches(4.75), t, Inches(0.06), Inches(1.08), fill=ORANGE)
        txt(sl, icon, Inches(4.95), t + Inches(0.12), Inches(0.55), Inches(0.55),
            size=20, bold=False, color=DARK, align=PP_ALIGN.CENTER)
        txt(sl, head, Inches(5.65), t + Inches(0.08), Inches(7.1), Inches(0.38),
            size=14, bold=True, color=DARK, align=PP_ALIGN.LEFT)
        txt(sl, body, Inches(5.65), t + Inches(0.46), Inches(7.1), Inches(0.52),
            size=11, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_05_portfolio_overview(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)
    rect(sl, Inches(0.12), Inches(0), W - Inches(0.12), Inches(0.08), fill=ORANGE)

    txt(sl, "POWER & HVAC PORTFOLIO  |  COMPLETE SOLUTIONS ECOSYSTEM",
        Inches(0.4), Inches(0.2), Inches(10), Inches(0.4),
        size=11, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)

    txt(sl, "One Partner. Complete Energy Solutions.",
        Inches(0.4), Inches(0.68), Inches(10), Inches(0.72),
        size=34, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, "From a single generator to a fully orchestrated microgrid — engineered, monitored, and optimized by Sunbelt Rentals experts.",
        Inches(0.4), Inches(1.5), Inches(10), Inches(0.45),
        size=15, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    rect(sl, Inches(0.4), Inches(2.05), Inches(6), Inches(0.04), fill=ORANGE)

    # Large category cards (2x2 grid + 1 spanning)
    categories = [
        ("⚡ POWER\nGENERATION",
         "2.5kW – 2,000kW+",
         ["Diesel & gas generators", "Tier 4 Final compliant", "Paralleling up to multi-MW", "Load banks & accessories"]),
        ("🔋 BATTERY ENERGY\nSTORAGE (BESS)",
         "<10kWh – 750kWh+",
         ["Trailer-mounted & skid units", "Hybrid generator integration", "Island mode operation", "Grid synchronization ready"]),
        ("❄️ HVAC &\nCLIMATE CONTROL",
         "7.5-Ton to 500-Ton+",
         ["Air conditioning & chillers", "Heating (electric/direct/indirect)", "Dehumidifiers & air scrubbers", "Cooling towers & air handlers"]),
        ("🔌 POWER\nDISTRIBUTION",
         "Full System Design",
         ["Transformers & switchgear", "Distribution panels", "Transfer switches (ATS/MTS)", "One-line schematic design"]),
    ]

    positions = [
        (Inches(0.4),  Inches(2.22)),
        (Inches(3.65), Inches(2.22)),
        (Inches(6.9),  Inches(2.22)),
        (Inches(10.15),Inches(2.22)),
    ]
    for (cat_title, spec, items), (cl, ct) in zip(categories, positions):
        cw, ch = Inches(3.0), Inches(4.9)
        rect(sl, cl, ct, cw, ch, fill=DARK2)
        rect(sl, cl, ct, cw, Inches(0.06), fill=ORANGE)
        # Title area
        rect(sl, cl, ct + Inches(0.06), cw, Inches(1.1), fill=ORANGE_DARK)
        txt(sl, cat_title, cl + Inches(0.12), ct + Inches(0.1), cw - Inches(0.25), Inches(0.95),
            size=14, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        # Spec
        txt(sl, spec, cl + Inches(0.12), ct + Inches(1.22), cw - Inches(0.25), Inches(0.38),
            size=11, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        rect(sl, cl + Inches(0.12), ct + Inches(1.62), cw - Inches(0.25), Inches(0.025),
             fill=GRAY_MED)
        for j, item in enumerate(items):
            txt(sl, f"▸  {item}",
                cl + Inches(0.12), ct + Inches(1.72) + Inches(j * 0.7),
                cw - Inches(0.25), Inches(0.6),
                size=11, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Footer bar
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=ORANGE_DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    return sl


def slide_06_generators(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "POWER GENERATION", "Diesel & Gas Generator Fleet — 2.5kW to 2,000kW+")

    txt(sl, "The most comprehensive temporary generation fleet in North America — Tier 4 Final compliant, paralleling-ready, and EMaaS™ integrated.",
        Inches(0.35), Inches(1.28), Inches(12.6), Inches(0.42),
        size=13, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Generator tier cards
    gen_tiers = [
        ("PORTABLE",     "2.5 – 10 kW",   "Gas-powered\nJob-site convenience\nTool & lighting power"),
        ("SMALL",        "20 – 60 kW",     "Diesel Tier 4 Final\nSmall commercial sites\nConstruction trailers"),
        ("MEDIUM",       "100 – 350 kW",   "Sound-attenuated\nSingle-building coverage\nCritical load support"),
        ("LARGE",        "400 – 800 kW",   "Paralleling ready\nLarge campus power\nHospitals & data centers"),
        ("INDUSTRIAL",   "1,000 – 2,000kW+","Multi-unit paralleling\nGrid-scale temporary power\nMission-critical applications"),
    ]

    for i, (tier, kw, details) in enumerate(gen_tiers):
        l = Inches(0.35) + Inches(i * 2.6)
        t = Inches(1.82)
        w, h = Inches(2.45), Inches(4.9)
        rect(sl, l, t, w, h, fill=DARK)
        rect(sl, l, t, w, Inches(0.06), fill=ORANGE)
        rect(sl, l, t + Inches(0.06), w, Inches(0.78), fill=ORANGE_DARK)
        txt(sl, tier, l + Inches(0.12), t + Inches(0.12), w - Inches(0.25), Inches(0.42),
            size=16, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        rect(sl, l + Inches(0.12), t + Inches(0.88), w - Inches(0.25), Inches(0.03), fill=ORANGE)
        txt(sl, kw, l + Inches(0.12), t + Inches(0.95), w - Inches(0.25), Inches(0.52),
            size=20, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        for j, detail in enumerate(details.split('\n')):
            txt(sl, f"▸  {detail}",
                l + Inches(0.12), t + Inches(1.6) + Inches(j * 0.68),
                w - Inches(0.25), Inches(0.6),
                size=11, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Bottom capability callouts
    rect(sl, Inches(0), Inches(7.0), W, Inches(0.02), fill=ORANGE)
    callouts = [
        "✔  Tier 4 Final Compliant Fleet",
        "✔  Parallel Generator Configurations",
        "✔  Automated Transfer Switches",
        "✔  24/7 Remote Telematics Monitoring",
        "✔  DEIF Controller Ecosystem",
    ]
    for i, c in enumerate(callouts):
        txt(sl, c, Inches(0.35) + Inches(i * 2.6), Inches(6.88), Inches(2.5), Inches(0.38),
            size=10, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_07_bess(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)
    rect(sl, Inches(0.12), Inches(0), W - Inches(0.12), Inches(0.08), fill=ORANGE)

    txt(sl, "BATTERY ENERGY STORAGE SYSTEMS  |  NORTH AMERICA'S LARGEST BESS RENTAL FLEET",
        Inches(0.4), Inches(0.2), Inches(11), Inches(0.4),
        size=11, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)

    txt(sl, "Store. Dispatch. Optimize.",
        Inches(0.4), Inches(0.68), Inches(9), Inches(0.72),
        size=36, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, "From load-leveling a single generator to anchoring a multi-MW microgrid — BESS transforms how construction sites consume energy.",
        Inches(0.4), Inches(1.5), Inches(12.5), Inches(0.45),
        size=14, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # BESS product tier cards
    bess_tiers = [
        ("<10 kWh",    "Compact Unit",      ["Portable applications", "Tool & lighting support", "Fast deployment", "Standalone operation"]),
        ("80–100 kWh", "Standard Mobile",   ["Trailer-mounted", "Single generator pairing", "Construction trailers", "Medium load leveling"]),
        ("100–300 kWh","High Capacity",     ["Multiple generator sync", "Large-site load leveling", "Island mode capable", "Grid synchronization"]),
        ("500–750 kWh","Industrial Scale",  ["Mission-critical backup", "Data center bridging", "Multi-unit paralleling", "Microgrid anchor"]),
    ]

    for i, (cap, tier_name, features) in enumerate(bess_tiers):
        l = Inches(0.4) + Inches(i * 3.25)
        t = Inches(2.1)
        w, h = Inches(3.05), Inches(4.85)
        rect(sl, l, t, w, h, fill=DARK2)
        rect(sl, l, t, w, Inches(0.06), fill=ORANGE)
        # Capacity badge
        rect(sl, l, t + Inches(0.06), w, Inches(1.05), fill=ORANGE_DARK)
        txt(sl, cap, l + Inches(0.12), t + Inches(0.1), w - Inches(0.25), Inches(0.6),
            size=24, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        txt(sl, tier_name, l + Inches(0.12), t + Inches(0.72), w - Inches(0.25), Inches(0.35),
            size=12, bold=False, color=ORANGE_LITE, align=PP_ALIGN.LEFT)
        rect(sl, l + Inches(0.12), t + Inches(1.18), w - Inches(0.25), Inches(0.03), fill=ORANGE)
        for j, feat in enumerate(features):
            txt(sl, f"▸  {feat}",
                l + Inches(0.12), t + Inches(1.35) + Inches(j * 0.78),
                w - Inches(0.25), Inches(0.65),
                size=12, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Key differentiator callout at bottom
    rect(sl, Inches(0.4), Inches(7.02), Inches(12.5), Inches(0.06), fill=ORANGE)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=ORANGE_DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    return sl


def slide_08_hvac(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "HVAC & CLIMATE CONTROL", "Complete Thermal Management — 7.5-Ton to 500-Ton+")

    # Left panel — description
    rect(sl, Inches(0), Inches(1.19), Inches(3.9), H - Inches(1.57), fill=DARK)
    rect(sl, Inches(0), Inches(1.19), Inches(0.12), H - Inches(1.57), fill=ORANGE)

    txt(sl, "Full Thermal\nSolutions for\nAny Environment",
        Inches(0.3), Inches(1.45), Inches(3.4), Inches(1.2),
        size=22, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, "Whether it's climate-critical\nconstruction, emergency heat relief,\nor dehumidification for restoration —\nSunbelt's HVAC fleet covers every BTU.",
        Inches(0.3), Inches(2.78), Inches(3.4), Inches(1.4),
        size=13, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Stats
    hvac_stats = [("135-Ton", "Largest portable AC unit"), ("500-Ton+", "Chiller capacity"), ("24/7", "Climate monitoring")]
    for i, (val, lbl) in enumerate(hvac_stats):
        t = Inches(4.38) + Inches(i * 0.88)
        txt(sl, val, Inches(0.3), t, Inches(1.5), Inches(0.45),
            size=20, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        txt(sl, lbl, Inches(1.85), t + Inches(0.08), Inches(1.9), Inches(0.38),
            size=11, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # HVAC category grid
    hvac_cats = [
        ("❄️  AIR CONDITIONING",    "7.5–135 Ton",    "Portable & trailer-mounted\nSpot coolers & packaged units\nDuctable configurations"),
        ("🧊  CHILLERS",            "10–500+ Ton",    "Air-cooled & water-cooled\nProcess cooling applications\nHigh-precision temperature ctrl"),
        ("🔥  HEATING SYSTEMS",     "All Fuels",      "Electric, direct & indirect fired\nHydronic heating systems\nHigh-output portable heaters"),
        ("💨  VENTILATION",         "Industrial",     "Axial & centrifugal fans\nConfined space solutions\nSmoke & fume extraction"),
        ("💧  DEHUMIDIFICATION",    "Commercial",     "Construction & restoration\nMoisture-critical environments\nLarge-scale drying systems"),
        ("🌀  AIR HANDLERS",        "Custom",         "Filtered fresh air systems\nAir quality management\nMakeup air applications"),
    ]

    positions = [
        (Inches(4.15), Inches(1.28)),
        (Inches(7.55), Inches(1.28)),
        (Inches(10.95),Inches(1.28)),
        (Inches(4.15), Inches(4.35)),
        (Inches(7.55), Inches(4.35)),
        (Inches(10.95),Inches(4.35)),
    ]
    for (cat, spec, details), (l, t) in zip(hvac_cats, positions):
        w, h = Inches(3.15), Inches(2.82)
        rect(sl, l, t, w, h, fill=GRAY_LIGHT, line_color=GRAY_LIGHT, line_w=Pt(1))
        rect(sl, l, t, w, Inches(0.07), fill=ORANGE)
        rect(sl, l, t + Inches(0.07), w, Inches(0.62), fill=DARK)
        txt(sl, cat, l + Inches(0.12), t + Inches(0.12), w - Inches(0.25), Inches(0.4),
            size=12, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        txt(sl, spec, l + Inches(0.12), t + Inches(0.75), w - Inches(0.25), Inches(0.35),
            size=12, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        for j, line in enumerate(details.split('\n')):
            txt(sl, f"▸  {line}", l + Inches(0.12), t + Inches(1.18) + Inches(j * 0.5),
                w - Inches(0.25), Inches(0.42),
                size=10.5, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_09_emaas_what(prs):
    """Section divider for EMaaS."""
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)

    # Bold orange right panel
    rect(sl, Inches(8.5), Inches(0), Inches(4.833), H, fill=ORANGE_DARK)
    rect(sl, Inches(9.1), Inches(0), Inches(4.233), H, fill=ORANGE)

    # Left vertical orange bar
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)

    # Eyebrow
    txt(sl, "SECTION 04",
        Inches(0.35), Inches(1.8), Inches(6), Inches(0.42),
        size=12, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)

    # Main title
    txt(sl, "Energy Management",
        Inches(0.35), Inches(2.25), Inches(8.5), Inches(1.0),
        size=50, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
    txt(sl, "as a Service™",
        Inches(0.35), Inches(3.15), Inches(8.5), Inches(1.0),
        size=50, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)

    rect(sl, Inches(0.35), Inches(4.22), Inches(5.5), Inches(0.06), fill=ORANGE)

    txt(sl, "From reactive equipment rental to a fully managed,\ndata-driven power ecosystem",
        Inches(0.35), Inches(4.38), Inches(7.8), Inches(0.85),
        size=17, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Right panel text
    txt(sl, "EMaaS™", Inches(9.3), Inches(2.2), Inches(3.8), Inches(0.8),
        size=36, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    txt(sl, "A proprietary\nSunbelt Rentals\nmanaged service",
        Inches(9.3), Inches(3.1), Inches(3.8), Inches(1.5),
        size=18, bold=False, color=ORANGE_LITE, align=PP_ALIGN.CENTER)

    # Bottom bar
    rect(sl, Inches(0), H - Inches(0.5), W, Inches(0.5), fill=ORANGE_DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.44), W - Inches(0.6), Inches(0.38),
        size=9, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    return sl


def slide_10_emaas_explained(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "WHAT IS EMaaS™?", "Energy Management as a Service — Redefining Temporary Power")

    # Definition callout box
    rect(sl, Inches(0.35), Inches(1.28), Inches(12.6), Inches(1.1), fill=DARK)
    rect(sl, Inches(0.35), Inches(1.28), Inches(0.09), Inches(1.1), fill=ORANGE)
    txt(sl, "EMaaS™ treats temporary power as a complete managed ecosystem — monitored, optimized, and\nactively adjusted to meet operational requirements as they change in real time.",
        Inches(0.6), Inches(1.38), Inches(12.1), Inches(0.88),
        size=15, bold=False, color=WHITE, align=PP_ALIGN.LEFT)

    # Traditional vs EMaaS comparison
    txt(sl, "TRADITIONAL RENTAL",
        Inches(0.35), Inches(2.62), Inches(5.5), Inches(0.38),
        size=14, bold=True, color=RGBColor(0xCC, 0x00, 0x00), align=PP_ALIGN.CENTER)
    txt(sl, "vs.",
        Inches(5.85), Inches(2.62), Inches(1.5), Inches(0.38),
        size=18, bold=True, color=GRAY, align=PP_ALIGN.CENTER)
    txt(sl, "EMaaS™ BY SUNBELT RENTALS",
        Inches(7.35), Inches(2.62), Inches(5.65), Inches(0.38),
        size=14, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)

    comparisons = [
        ("Reactive — equipment deployed and forgotten",      "Proactive — continuous monitoring & optimization"),
        ("One-size-fits-all generator sizing",               "Load profiling → right-sized solution"),
        ("Fuel cost is a fixed operating expense",           "Active fuel management with BESS integration"),
        ("Maintenance on failure or fixed schedule",          "Predictive maintenance via real-time telemetry"),
        ("Multiple vendors, fragmented accountability",       "Single partner, end-to-end responsibility"),
        ("No visibility into performance data",              "Real-time dashboards & performance reporting"),
    ]

    for i, (trad, emaas) in enumerate(comparisons):
        t = Inches(3.12) + Inches(i * 0.65)
        # Traditional side
        rect(sl, Inches(0.35), t, Inches(5.5), Inches(0.58),
             fill=GRAY_LIGHT if i % 2 == 0 else WHITE)
        txt(sl, f"✘  {trad}", Inches(0.5), t + Inches(0.1), Inches(5.2), Inches(0.42),
            size=11, bold=False, color=RGBColor(0x66, 0x00, 0x00), align=PP_ALIGN.LEFT)
        # EMaaS side
        rect(sl, Inches(7.35), t, Inches(5.65), Inches(0.58),
             fill=ORANGE_LITE if i % 2 == 0 else WHITE)
        txt(sl, f"✔  {emaas}", Inches(7.5), t + Inches(0.1), Inches(5.35), Inches(0.42),
            size=11, bold=False, color=DARK, align=PP_ALIGN.LEFT)

    # VS divider
    rect(sl, Inches(5.85), Inches(3.12), Inches(1.5), Inches(3.9), fill=DARK)
    txt(sl, "vs.", Inches(5.85), Inches(4.8), Inches(1.5), Inches(0.5),
        size=22, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_11_emaas_how(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "HOW EMaaS™ WORKS", "The Four-Stage Managed Power Lifecycle")

    # Connecting line behind process steps
    rect(sl, Inches(0.9), Inches(3.55), Inches(11.5), Inches(0.06), fill=ORANGE_LITE)

    steps = [
        ("01", "ASSESS\n& PROFILE",
         "Load Analysis",
         "We analyze your actual power demand patterns — not estimated peaks — to understand load profiles, demand cycles, voltage requirements, and efficiency opportunities."),
        ("02", "DESIGN\n& ENGINEER",
         "Right-Sized Solution",
         "Our engineers develop a complete energy architecture: generator sizing, BESS integration, distribution design, transfer schemes, and redundancy — all documented with one-line schematics."),
        ("03", "DEPLOY\n& INTEGRATE",
         "Expert Installation",
         "Factory-tested equipment delivered and commissioned by certified Power & HVAC technicians. Full system testing, paralleling configuration, and grid synchronization where required."),
        ("04", "MONITOR\n& OPTIMIZE",
         "Continuous Intelligence",
         "24/7 telematics monitoring via DEIF controllers tracks fuel, load, voltage, frequency, and efficiency. Machine intelligence handles routine optimization; specialists manage complexity."),
    ]

    for i, (num, title, subtitle, body) in enumerate(steps):
        l = Inches(0.35) + Inches(i * 3.25)
        # Card background
        rect(sl, l, Inches(1.55), Inches(3.05), Inches(5.55), fill=GRAY_LIGHT)
        rect(sl, l, Inches(1.55), Inches(3.05), Inches(0.07), fill=ORANGE)

        # Number circle
        cx = l + Inches(1.18)
        cy = Inches(3.25)
        rect(sl, cx, cy, Inches(0.7), Inches(0.7), fill=ORANGE)
        txt(sl, num, cx, cy, Inches(0.7), Inches(0.7),
            size=18, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

        # Arrow connector (except after last)
        if i < 3:
            rect(sl, l + Inches(3.05), Inches(3.55), Inches(0.2), Inches(0.06), fill=ORANGE)

        # Title
        txt(sl, title, l + Inches(0.15), Inches(1.72), Inches(2.75), Inches(0.85),
            size=16, bold=True, color=DARK, align=PP_ALIGN.LEFT)
        # Subtitle
        txt(sl, subtitle, l + Inches(0.15), Inches(2.62), Inches(2.75), Inches(0.42),
            size=12, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        rect(sl, l + Inches(0.15), Inches(3.08), Inches(2.75), Inches(0.03), fill=ORANGE)
        # Body
        txt(sl, body, l + Inches(0.15), Inches(4.08), Inches(2.75), Inches(2.85),
            size=11, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Bottom callout
    rect(sl, Inches(0.35), Inches(7.02), Inches(12.6), Inches(0.06), fill=ORANGE)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_12_technology(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)
    rect(sl, Inches(0.12), Inches(0), W - Inches(0.12), Inches(0.08), fill=ORANGE)

    txt(sl, "TECHNOLOGY & INTELLIGENCE PLATFORM  |  THE INFRASTRUCTURE BEHIND EMaaS™",
        Inches(0.4), Inches(0.2), Inches(11), Inches(0.4),
        size=11, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)

    txt(sl, "Powered by Data. Managed by Experts.",
        Inches(0.4), Inches(0.68), Inches(9), Inches(0.72),
        size=32, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, "Sunbelt Rentals' proprietary technology stack enables real-time visibility, predictive intelligence, and active optimization across every asset.",
        Inches(0.4), Inches(1.5), Inches(12.5), Inches(0.45),
        size=14, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Technology pillars
    tech_pillars = [
        ("DEIF CONTROLLER\nECOSYSTEM",
         ["AGC-4 Mk II — daily fleet standard", "AGC-150 — generator & BESS management",
          "TDU107 — touch display co-developed", "Consistent across entire rental fleet",
          "Parallel & island mode control", "Tier 4 Final emission optimization"]),
        ("REAL-TIME\nTELEMATICS",
         ["Continuous fuel consumption tracking", "Load demand & efficiency monitoring",
          "Voltage stability & frequency control", "Predictive maintenance alerts",
          "Remote load management capability", "24/7 NOC visibility"]),
        ("LOAD PROFILING\n& ANALYTICS",
         ["Actual vs. estimated demand analysis", "Peak/off-peak pattern identification",
          "Right-sizing recommendations", "Efficiency opportunity mapping",
          "Fuel savings quantification", "Carbon reduction modeling"]),
        ("REPORTING\n& INTELLIGENCE",
         ["Customer-facing performance dashboards", "Fuel consumption & cost reports",
          "Emissions & carbon footprint tracking", "Maintenance event logs",
          "SLA compliance documentation", "ESG reporting support"]),
    ]

    for i, (title, items) in enumerate(tech_pillars):
        l = Inches(0.4) + Inches(i * 3.25)
        t = Inches(2.1)
        w, h = Inches(3.05), Inches(4.88)
        rect(sl, l, t, w, h, fill=DARK2)
        rect(sl, l, t, w, Inches(0.07), fill=ORANGE)
        rect(sl, l, t + Inches(0.07), w, Inches(0.85), fill=ORANGE_DARK)
        txt(sl, title, l + Inches(0.12), t + Inches(0.12), w - Inches(0.25), Inches(0.7),
            size=14, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        rect(sl, l + Inches(0.12), t + Inches(0.98), w - Inches(0.25), Inches(0.03), fill=ORANGE)
        for j, item in enumerate(items):
            txt(sl, f"▸  {item}",
                l + Inches(0.12), t + Inches(1.08) + Inches(j * 0.62),
                w - Inches(0.25), Inches(0.55),
                size=11, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=ORANGE_DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    return sl


def slide_13_hybrid_power(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "HYBRID POWER SOLUTIONS", "Generator + BESS Integration — Smarter. Cleaner. More Efficient.")

    txt(sl, "Hybrid systems combine diesel generation with battery storage to reduce runtime, fuel consumption, and emissions — without compromising reliability.",
        Inches(0.35), Inches(1.28), Inches(12.6), Inches(0.42),
        size=13, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Architecture diagram (visual representation using shapes)
    # Left: Generator block
    rect(sl, Inches(0.35), Inches(1.88), Inches(3.0), Inches(2.1), fill=DARK)
    rect(sl, Inches(0.35), Inches(1.88), Inches(3.0), Inches(0.07), fill=ORANGE)
    txt(sl, "⚡  GENERATOR",
        Inches(0.35), Inches(1.93), Inches(3.0), Inches(0.5),
        size=14, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    txt(sl, "2.5kW – 2,000kW+\nTier 4 Final Compliant\nDEIF Controller Equipped",
        Inches(0.35), Inches(2.52), Inches(3.0), Inches(0.95),
        size=12, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.CENTER)
    txt(sl, "PRIMARY SOURCE",
        Inches(0.35), Inches(3.52), Inches(3.0), Inches(0.38),
        size=10, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)

    # Arrow right
    rect(sl, Inches(3.35), Inches(2.75), Inches(0.75), Inches(0.07), fill=ORANGE)
    txt(sl, "▶", Inches(3.9), Inches(2.63), Inches(0.35), Inches(0.38),
        size=18, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)

    # Center: Controller/Intelligence block
    rect(sl, Inches(4.15), Inches(1.88), Inches(3.0), Inches(2.1), fill=ORANGE)
    txt(sl, "🔄  INTELLIGENCE",
        Inches(4.15), Inches(1.98), Inches(3.0), Inches(0.5),
        size=14, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    txt(sl, "DEIF AGC-150\nLoad Demand Sensing\nAuto Source Switching",
        Inches(4.15), Inches(2.55), Inches(3.0), Inches(0.95),
        size=12, bold=False, color=WHITE, align=PP_ALIGN.CENTER)
    txt(sl, "ACTIVE OPTIMIZATION",
        Inches(4.15), Inches(3.52), Inches(3.0), Inches(0.38),
        size=10, bold=True, color=DARK, align=PP_ALIGN.CENTER)

    # Arrow right
    rect(sl, Inches(7.15), Inches(2.75), Inches(0.75), Inches(0.07), fill=ORANGE)
    txt(sl, "▶", Inches(7.7), Inches(2.63), Inches(0.35), Inches(0.38),
        size=18, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)

    # Right: BESS block
    rect(sl, Inches(7.95), Inches(1.88), Inches(3.0), Inches(2.1), fill=DARK)
    rect(sl, Inches(7.95), Inches(1.88), Inches(3.0), Inches(0.07), fill=ORANGE)
    txt(sl, "🔋  BESS",
        Inches(7.95), Inches(1.93), Inches(3.0), Inches(0.5),
        size=14, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    txt(sl, "<10kWh – 750kWh\nTrailer or Skid-Mounted\nParallel Capable",
        Inches(7.95), Inches(2.52), Inches(3.0), Inches(0.95),
        size=12, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.CENTER)
    txt(sl, "ENERGY RESERVOIR",
        Inches(7.95), Inches(3.52), Inches(3.0), Inches(0.38),
        size=10, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)

    # Arrow right to load
    rect(sl, Inches(10.95), Inches(2.75), Inches(0.75), Inches(0.07), fill=ORANGE)
    txt(sl, "▶", Inches(11.5), Inches(2.63), Inches(0.35), Inches(0.38),
        size=18, bold=True, color=ORANGE, align=PP_ALIGN.CENTER)

    # Site load block
    rect(sl, Inches(11.55), Inches(1.88), Inches(1.6), Inches(2.1), fill=ORANGE_DARK)
    txt(sl, "🏗️\nSITE\nLOAD",
        Inches(11.55), Inches(2.05), Inches(1.6), Inches(1.7),
        size=13, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

    # How it works description
    txt(sl, "HOW IT WORKS",
        Inches(0.35), Inches(4.22), Inches(5), Inches(0.38),
        size=12, bold=True, color=DARK, align=PP_ALIGN.LEFT)
    rect(sl, Inches(0.35), Inches(4.62), Inches(6.15), Inches(0.04), fill=ORANGE)

    how_steps = [
        "1.  Generator runs → charges BESS while powering the site",
        "2.  Generator shuts down → BESS supplies the load seamlessly",
        "3.  When load exceeds BESS capacity → generator restarts automatically",
        "4.  DEIF controller manages all switching — zero manual intervention",
    ]
    for i, step in enumerate(how_steps):
        txt(sl, step, Inches(0.35), Inches(4.75) + Inches(i * 0.52),
            Inches(6.15), Inches(0.45),
            size=12, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Right side — results column
    txt(sl, "PROVEN HYBRID RESULTS",
        Inches(7.0), Inches(4.22), Inches(6.0), Inches(0.38),
        size=12, bold=True, color=DARK, align=PP_ALIGN.LEFT)
    rect(sl, Inches(7.0), Inches(4.62), Inches(6.0), Inches(0.04), fill=ORANGE)

    hybrid_results = [
        ("82%", "Reduction in diesel fuel consumption"),
        ("34,026 gal", "Fuel saved (6-month data center project)"),
        ("130", "Preventive maintenance calls eliminated"),
        ("$43,521", "Maintenance cost savings"),
        ("120 tons", "CO₂e emissions avoided"),
    ]
    for i, (val, lbl) in enumerate(hybrid_results):
        t = Inches(4.78) + Inches(i * 0.47)
        txt(sl, val, Inches(7.0), t, Inches(1.7), Inches(0.42),
            size=14, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        txt(sl, lbl, Inches(8.75), t + Inches(0.04), Inches(4.2), Inches(0.38),
            size=11, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_14_microgrid(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)
    rect(sl, Inches(0.12), Inches(0), W - Inches(0.12), Inches(0.08), fill=ORANGE)

    txt(sl, "MICROGRID SOLUTIONS  |  COMPLETE ISLAND-MODE POWER ARCHITECTURE",
        Inches(0.4), Inches(0.2), Inches(11), Inches(0.4),
        size=11, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)

    txt(sl, "Temporary Microgrids for the Most Demanding Sites",
        Inches(0.4), Inches(0.68), Inches(11.5), Inches(0.72),
        size=32, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, "When grid access is unavailable, unreliable, or insufficient — Sunbelt engineers a complete independent power ecosystem.",
        Inches(0.4), Inches(1.5), Inches(12.5), Inches(0.45),
        size=14, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Microgrid components
    components = [
        ("⚡", "GENERATION LAYER",
         ["Multiple parallel generators", "Up to multi-MW capacity", "Automatic load sharing", "N+1 redundancy designs"]),
        ("🔋", "STORAGE LAYER",
         ["BESS units in parallel arrays", "Peak shaving & load leveling", "Seamless source transition", "Configurable depth of discharge"]),
        ("🔌", "DISTRIBUTION LAYER",
         ["MV/LV transformer stations", "Automated transfer schemes", "Switchgear & protection", "Metering & sub-metering"]),
        ("💡", "RENEWABLE INTEGRATION",
         ["Solar PV synchronization", "Wind energy integration", "Fuel cell ready architecture", "Net-zero pathway design"]),
        ("📊", "CONTROL LAYER",
         ["DEIF master controller", "Remote SCADA visibility", "Demand response capability", "Grid reconnection protocols"]),
    ]

    for i, (icon, title, items) in enumerate(components):
        l = Inches(0.4) + Inches(i * 2.6)
        t = Inches(2.1)
        w, h = Inches(2.45), Inches(4.85)
        rect(sl, l, t, w, h, fill=DARK2)
        rect(sl, l, t, w, Inches(0.07), fill=ORANGE)
        txt(sl, icon, l, t + Inches(0.1), w, Inches(0.6),
            size=28, bold=False, color=ORANGE, align=PP_ALIGN.CENTER)
        txt(sl, title, l + Inches(0.12), t + Inches(0.75), w - Inches(0.25), Inches(0.55),
            size=12, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        rect(sl, l + Inches(0.12), t + Inches(1.32), w - Inches(0.25), Inches(0.03), fill=ORANGE)
        for j, item in enumerate(items):
            txt(sl, f"▸  {item}",
                l + Inches(0.12), t + Inches(1.45) + Inches(j * 0.78),
                w - Inches(0.25), Inches(0.65),
                size=11, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=ORANGE_DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    return sl


def slide_15_case_study(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "CASE STUDY: HYPERSCALE DATA CENTER", "Hybrid BESS + Generator System — 6-Month Construction Project")

    # Project context panel (left)
    rect(sl, Inches(0), Inches(1.19), Inches(4.6), H - Inches(1.57), fill=DARK)
    rect(sl, Inches(0), Inches(1.19), Inches(0.12), H - Inches(1.57), fill=ORANGE)

    txt(sl, "PROJECT OVERVIEW",
        Inches(0.3), Inches(1.42), Inches(4.1), Inches(0.38),
        size=12, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)

    project_details = [
        ("Client Type:", "Hyperscale Data Center Construction"),
        ("Duration:",    "6-Month Construction Phase"),
        ("Solution:",    "Hybrid BESS + Generator System"),
        ("Architecture:", "15 Parallel Generators + BESS Array"),
        ("Operation:",   "BESS as primary source; generators on demand"),
        ("Monitoring:",  "24/7 EMaaS™ real-time telematics"),
    ]

    for i, (label, value) in enumerate(project_details):
        t = Inches(1.88) + Inches(i * 0.72)
        txt(sl, label, Inches(0.3), t, Inches(1.45), Inches(0.38),
            size=11, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        txt(sl, value, Inches(1.78), t, Inches(2.6), Inches(0.38),
            size=11, bold=False, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, '"The BESS served as the primary power\nsource with generators engaging only\nwhen loads exceeded battery capacity\nor during recharge cycles."',
        Inches(0.3), Inches(6.0), Inches(4.1), Inches(0.95),
        size=11, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Spacer
    rect(sl, Inches(4.6), Inches(1.19), Inches(0.04), H - Inches(1.57), fill=ORANGE)

    # Results — large stat cards
    txt(sl, "MEASURED OUTCOMES",
        Inches(4.85), Inches(1.35), Inches(8.2), Inches(0.38),
        size=14, bold=True, color=DARK, align=PP_ALIGN.LEFT)

    results = [
        ("82%",       "Fuel Consumption\nReduction",     "vs. conventional generator-only setup"),
        ("34,026",    "Gallons of Diesel\nNOT Burned",   "Across the 6-month construction phase"),
        ("130",       "Preventive Maintenance\nServices Eliminated", "Freeing crews for higher-value work"),
        ("$43,521",   "Maintenance Cost\nSavings",        "Direct budget impact — documented"),
        ("120 Tons",  "CO₂e Emissions\nAvoided",          "Toward owner sustainability targets"),
        ("5:1",       "Load Flexibility\nRatio",           "1,000A startup → 200A steady state managed"),
    ]

    positions_r = [
        (Inches(4.85), Inches(1.85)),
        (Inches(8.55), Inches(1.85)),
        (Inches(4.85), Inches(3.78)),
        (Inches(8.55), Inches(3.78)),
        (Inches(4.85), Inches(5.72)),
        (Inches(8.55), Inches(5.72)),
    ]
    for (val, label, sub), (l, t) in zip(results, positions_r):
        w, h = Inches(3.42), Inches(1.72)
        rect(sl, l, t, w, h, fill=GRAY_LIGHT)
        rect(sl, l, t, w, Inches(0.07), fill=ORANGE)
        txt(sl, val, l + Inches(0.15), t + Inches(0.1), w - Inches(0.3), Inches(0.72),
            size=32, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        txt(sl, label, l + Inches(0.15), t + Inches(0.84), w - Inches(0.3), Inches(0.5),
            size=12, bold=True, color=DARK, align=PP_ALIGN.LEFT)
        txt(sl, sub, l + Inches(0.15), t + Inches(1.3), w - Inches(0.3), Inches(0.38),
            size=9.5, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_16_sustainability(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)
    rect(sl, Inches(0.12), Inches(0), W - Inches(0.12), Inches(0.08), fill=ORANGE)

    txt(sl, "SUSTAINABILITY & ESG IMPACT  |  MEASURABLE PATHWAYS TO NET ZERO",
        Inches(0.4), Inches(0.2), Inches(11), Inches(0.4),
        size=11, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)

    txt(sl, "Your ESG Goals. Our Engineering.",
        Inches(0.4), Inches(0.68), Inches(9), Inches(0.72),
        size=34, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, "Sunbelt Rentals delivers measurable carbon reduction — not promises. Every EMaaS™ deployment is tracked, quantified, and reportable.",
        Inches(0.4), Inches(1.5), Inches(12.5), Inches(0.45),
        size=14, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Top stat row
    esg_stats = [
        ("82%",    "Max Fuel\nReduction",    "Documented"),
        ("120T+",  "CO₂e Saved\nPer Project","Reportable"),
        ("#1",     "BESS Fleet\nN. America",  "Proven Scale"),
        ("Tier 4", "Final\nCompliant",        "Entire Fleet"),
    ]
    for i, (val, lbl, badge) in enumerate(esg_stats):
        l = Inches(0.4) + Inches(i * 3.25)
        t = Inches(2.08)
        w = Inches(3.0)
        rect(sl, l, t, w, Inches(1.95), fill=DARK2)
        rect(sl, l, t, w, Inches(0.07), fill=ORANGE)
        txt(sl, val, l + Inches(0.15), t + Inches(0.12), w - Inches(0.3), Inches(0.85),
            size=38, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        txt(sl, lbl, l + Inches(0.15), t + Inches(0.98), w - Inches(0.3), Inches(0.55),
            size=13, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        txt(sl, badge, l + Inches(0.15), t + Inches(1.52), w - Inches(0.3), Inches(0.35),
            size=10, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Sustainability pathways
    rect(sl, Inches(0.4), Inches(4.18), Inches(12.5), Inches(0.04), fill=ORANGE)
    txt(sl, "CLEAN ENERGY PATHWAYS AVAILABLE TODAY",
        Inches(0.4), Inches(4.28), Inches(9), Inches(0.4),
        size=13, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)

    pathways = [
        ("⚡ Hybrid Diesel + BESS",    "Reduce runtime & emissions immediately with zero infrastructure change"),
        ("☀️ Solar + Storage",          "Integrate renewable generation into your temporary power architecture"),
        ("🔋 BESS Island Mode",         "Operate emission-free during grid outages or off-peak periods"),
        ("⛽ HVO Fuel Ready",           "Compatible fleet for Hydrotreated Vegetable Oil — 90% lower lifecycle CO₂"),
        ("📊 Carbon Reporting",         "Full emissions quantification for Scope 3 compliance documentation"),
        ("🌿 Net-Zero Roadmapping",     "Expert consultation for construction site decarbonization strategy"),
    ]

    for i, (pathway, desc) in enumerate(pathways):
        col = i % 2
        row = i // 2
        l = Inches(0.4) + Inches(col * 6.6)
        t = Inches(4.82) + Inches(row * 0.72)
        txt(sl, pathway, l, t, Inches(2.8), Inches(0.38),
            size=12, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)
        txt(sl, desc, l + Inches(2.85), t, Inches(3.5), Inches(0.38),
            size=11, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=ORANGE_DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    return sl


def slide_17_why_sunbelt(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "WHY SUNBELT RENTALS", "Five Reasons the Nation's Top Contractors Choose Us")

    # Intro
    txt(sl, "When the stakes are highest — mission-critical power, aggressive sustainability targets, complex logistics — these are the differentiators that matter.",
        Inches(0.35), Inches(1.28), Inches(12.6), Inches(0.42),
        size=13, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # 5 large differentiator cards
    diffs = [
        ("01", "NATIONAL SCALE\nWITH LOCAL DEPTH",
         ["950+ locations across North America", "Power & HVAC specialists embedded locally",
          "24/7 emergency dispatch capability", "Inventory pre-positioned for rapid response"]),
        ("02", "PROPRIETARY\nTECHNOLOGY",
         ["EMaaS™ — managed power ecosystem", "DEIF controller standardization",
          "Real-time telematics platform", "Load profiling & optimization analytics"]),
        ("03", "ONE OF N. AMERICA'S\nLARGEST BESS FLEETS",
         ["Full range <10kWh to 750kWh+", "Hybrid & microgrid proven experience",
          "Island mode & grid-sync capability", "Deployable within 24–48 hours"]),
        ("04", "COMPLETE\nSOLUTION DESIGN",
         ["Licensed engineers on staff", "One-line schematic development",
          "Full distribution design service", "Single vendor accountability"]),
        ("05", "ASHTEAD GROUP\nBACKING",
         ["$26B global enterprise strength", "Investment-grade balance sheet",
          "Continuous fleet reinvestment", "Sustainability commitments at scale"]),
    ]

    for i, (num, title, items) in enumerate(diffs):
        l = Inches(0.35) + Inches(i * 2.6)
        t = Inches(1.82)
        w, h = Inches(2.45), Inches(5.3)
        rect(sl, l, t, w, h, fill=DARK)
        rect(sl, l, t, w, Inches(0.07), fill=ORANGE)
        # Number
        rect(sl, l + Inches(0.12), t + Inches(0.18), Inches(0.52), Inches(0.52), fill=ORANGE)
        txt(sl, num, l + Inches(0.12), t + Inches(0.18), Inches(0.52), Inches(0.52),
            size=14, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        # Title
        txt(sl, title, l + Inches(0.75), t + Inches(0.18), w - Inches(0.9), Inches(0.7),
            size=12, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        rect(sl, l + Inches(0.12), t + Inches(0.92), w - Inches(0.25), Inches(0.03), fill=ORANGE)
        for j, item in enumerate(items):
            txt(sl, f"▸  {item}",
                l + Inches(0.12), t + Inches(1.05) + Inches(j * 0.92),
                w - Inches(0.25), Inches(0.78),
                size=11, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_18_sectors(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)
    rect(sl, Inches(0.12), Inches(0), W - Inches(0.12), Inches(0.08), fill=ORANGE)

    txt(sl, "CONSTRUCTION SECTOR APPLICATIONS  |  BUILT FOR YOUR MARKET",
        Inches(0.4), Inches(0.2), Inches(11), Inches(0.4),
        size=11, bold=False, color=ORANGE, align=PP_ALIGN.LEFT)

    txt(sl, "Engineered for the ENR 400's Most Complex Projects",
        Inches(0.4), Inches(0.68), Inches(11), Inches(0.72),
        size=32, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    txt(sl, "From vertical high-rise to horizontal infrastructure — every project type demands a different energy strategy. Sunbelt delivers all of them.",
        Inches(0.4), Inches(1.5), Inches(12.5), Inches(0.45),
        size=13, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Sector cards
    sectors = [
        ("🏢", "COMMERCIAL\nCONSTRUCTION",
         ["Temporary power for high-rise builds", "Phased utility coordination", "Tower crane & elevator power", "HVAC for occupied-adjacent work"]),
        ("🏭", "INDUSTRIAL &\nMANUFACTURING",
         ["Plant shutdown & turnaround power", "Process load management", "High-inertia motor start support", "Continuous production backup"]),
        ("🏥", "MISSION CRITICAL\n& HEALTHCARE",
         ["Hospital & data center bridging", "N+1 generator redundancy", "Zero-interruption transitions", "Life safety load prioritization"]),
        ("🌉", "HEAVY CIVIL &\nINFRASTRUCTURE",
         ["Remote site power with no grid", "Tunnel & underground construction", "Bridge & highway lighting", "Multi-phase project power"]),
        ("⚡", "ENERGY &\nUTILITIES",
         ["Substation upgrade bridge power", "Transmission line construction", "Renewable project laydown", "Grid interconnection staging"]),
        ("🏗️", "DATA CENTER\nCONSTRUCTION",
         ["Hyperscale commissioning power", "Phased IT load energization", "EMaaS™ fuel optimization proven", "Critical infrastructure bridging"]),
    ]

    positions = [
        (Inches(0.4),  Inches(2.12)),
        (Inches(4.65), Inches(2.12)),
        (Inches(8.9),  Inches(2.12)),
        (Inches(0.4),  Inches(4.65)),
        (Inches(4.65), Inches(4.65)),
        (Inches(8.9),  Inches(4.65)),
    ]

    for (icon, title, items), (l, t) in zip(sectors, positions):
        w, h = Inches(4.0), Inches(2.42)
        rect(sl, l, t, w, h, fill=DARK2)
        rect(sl, l, t, w, Inches(0.07), fill=ORANGE)
        txt(sl, icon, l + Inches(0.15), t + Inches(0.12), Inches(0.5), Inches(0.5),
            size=22, bold=False, color=ORANGE, align=PP_ALIGN.CENTER)
        txt(sl, title, l + Inches(0.75), t + Inches(0.12), w - Inches(0.9), Inches(0.6),
            size=12, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
        for j, item in enumerate(items):
            txt(sl, f"▸  {item}",
                l + Inches(0.15), t + Inches(0.8) + Inches(j * 0.38),
                w - Inches(0.3), Inches(0.35),
                size=10, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=ORANGE_DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=WHITE, align=PP_ALIGN.LEFT)
    return sl


def slide_19_getting_started(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=WHITE)
    orange_header_bar(sl, "GETTING STARTED WITH EMaaS™", "Your Pathway to Managed Energy Partnership")

    txt(sl, "Transitioning from transactional rental to a managed energy partnership is straightforward — here's the Sunbelt Rentals onboarding journey.",
        Inches(0.35), Inches(1.28), Inches(12.6), Inches(0.42),
        size=13, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Journey steps
    journey = [
        ("DISCOVERY\nCALL",
         "30-minute consultation with a Power & HVAC solutions specialist to understand your project profile, timeline, and power requirements."),
        ("SITE ASSESSMENT\n& LOAD STUDY",
         "Our engineers conduct a detailed load analysis — actual demand profiling, peak identification, and infrastructure review — at no charge."),
        ("SOLUTION\nDESIGN",
         "Receive a complete energy architecture proposal: equipment mix, one-line schematics, EMaaS™ monitoring plan, and sustainability projections."),
        ("DEPLOYMENT\n& COMMISSIONING",
         "Factory-tested equipment delivered and installed by certified technicians. Full parallel and integration testing before go-live."),
        ("ONGOING\nMANAGEMENT",
         "24/7 monitoring, proactive optimization, regular performance reporting, and a dedicated account team throughout your project lifecycle."),
    ]

    # Timeline line
    rect(sl, Inches(0.5), Inches(4.35), Inches(12.3), Inches(0.06), fill=ORANGE)

    for i, (step_title, step_body) in enumerate(journey):
        l = Inches(0.35) + Inches(i * 2.6)
        # Circle on timeline
        cx = l + Inches(1.2)
        rect(sl, cx, Inches(4.0), Inches(0.7), Inches(0.7), fill=ORANGE)
        txt(sl, str(i + 1), cx, Inches(4.0), Inches(0.7), Inches(0.7),
            size=20, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

        # Card above timeline
        cw, ch = Inches(2.35), Inches(1.95)
        cl = l + Inches(0.25)
        ct = Inches(1.88)
        rect(sl, cl, ct, cw, ch, fill=DARK)
        rect(sl, cl, ct, cw, Inches(0.07), fill=ORANGE)
        txt(sl, step_title, cl + Inches(0.12), ct + Inches(0.12), cw - Inches(0.25), Inches(0.72),
            size=13, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

        # Connector line to circle
        rect(sl, cx + Inches(0.35), ct + ch, Inches(0.04), Inches(4.0) - ct - ch,
             fill=ORANGE)

        # Card below timeline
        ct2 = Inches(4.82)
        rect(sl, cl, ct2, cw, Inches(2.1), fill=GRAY_LIGHT)
        rect(sl, cl, ct2, cw, Inches(0.07), fill=ORANGE_LITE)
        txt(sl, step_body, cl + Inches(0.12), ct2 + Inches(0.15), cw - Inches(0.25), Inches(1.85),
            size=10.5, bold=False, color=GRAY, align=PP_ALIGN.LEFT)

    # Bottom CTA
    rect(sl, Inches(0.35), Inches(7.0), Inches(12.6), Inches(0.06), fill=ORANGE)

    # Footer
    rect(sl, Inches(0), H - Inches(0.38), W, Inches(0.38), fill=DARK)
    txt(sl, "SUNBELT RENTALS  |  POWER & HVAC DIVISION  |  ENERGY MANAGEMENT AS A SERVICE™",
        Inches(0.3), H - Inches(0.34), W - Inches(0.6), Inches(0.3),
        size=9, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)
    return sl


def slide_20_closing(prs):
    sl = blank(prs)
    rect(sl, Inches(0), Inches(0), W, H, fill=DARK)

    # Bold orange right panel
    rect(sl, Inches(9.0), Inches(0), Inches(4.333), H, fill=ORANGE_DARK)
    rect(sl, Inches(9.5), Inches(0), Inches(3.833), H, fill=ORANGE)

    # Left vertical orange bar
    rect(sl, Inches(0), Inches(0), Inches(0.12), H, fill=ORANGE)

    # Main message
    txt(sl, "SUNBELT RENTALS",
        Inches(0.35), Inches(1.35), Inches(8.8), Inches(0.55),
        size=14, bold=True, color=ORANGE, align=PP_ALIGN.LEFT)

    txt(sl, "Your Energy\nManagement\nPartner",
        Inches(0.35), Inches(1.98), Inches(8.5), Inches(2.5),
        size=52, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

    rect(sl, Inches(0.35), Inches(4.62), Inches(6.5), Inches(0.06), fill=ORANGE)

    txt(sl, "Let's design your site's energy future — together.",
        Inches(0.35), Inches(4.78), Inches(8.5), Inches(0.5),
        size=18, bold=False, color=GRAY_MED, align=PP_ALIGN.LEFT)

    # Contact details
    contact_items = [
        ("🌐", "sunbeltrentals.com/power-hvac"),
        ("📞", "Power & HVAC Division: 1-800-SUNBELT"),
        ("✉️", "powerandhvac@sunbeltrentals.com"),
        ("📍", "950+ Locations Nationwide — Find Your Local Expert"),
    ]
    for i, (icon, detail) in enumerate(contact_items):
        t = Inches(5.42) + Inches(i * 0.45)
        txt(sl, icon, Inches(0.35), t, Inches(0.45), Inches(0.38),
            size=14, bold=False, color=ORANGE, align=PP_ALIGN.CENTER)
        txt(sl, detail, Inches(0.88), t + Inches(0.02), Inches(7.5), Inches(0.38),
            size=13, bold=False, color=GRAY_LIGHT, align=PP_ALIGN.LEFT)

    # Right panel content
    txt(sl, "Q&A\nDISCUSSION",
        Inches(9.7), Inches(2.2), Inches(3.4), Inches(1.6),
        size=38, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

    rect(sl, Inches(9.8), Inches(3.85), Inches(3.2), Inches(0.04), fill=WHITE)

    txt(sl, "We welcome your\nquestions and look\nforward to exploring\nhow EMaaS™ can\ntransform your projects.",
        Inches(9.7), Inches(4.0), Inches(3.4), Inches(2.0),
        size=13, bold=False, color=ORANGE_LITE, align=PP_ALIGN.CENTER)

    # Bottom
    rect(sl, Inches(0), H - Inches(0.5), W, Inches(0.5), fill=ORANGE_DARK)
    txt(sl, "ASSOCIATION OF CONSTRUCTION EQUIPMENT MANAGERS  |  ACEM EXECUTIVE BRIEFING  |  2026",
        Inches(0.3), H - Inches(0.44), W - Inches(0.6), Inches(0.38),
        size=10, bold=False, color=WHITE, align=PP_ALIGN.CENTER)
    return sl


# ============================================================
# MAIN
# ============================================================

def build_presentation():
    prs = new_prs()

    print("Building slide 01: Cover...")
    slide_01_cover(prs)

    print("Building slide 02: Agenda...")
    slide_02_agenda(prs)

    print("Building slide 03: At a Glance...")
    slide_03_at_a_glance(prs)

    print("Building slide 04: Energy Challenge...")
    slide_04_energy_challenge(prs)

    print("Building slide 05: Portfolio Overview...")
    slide_05_portfolio_overview(prs)

    print("Building slide 06: Generator Solutions...")
    slide_06_generators(prs)

    print("Building slide 07: BESS Solutions...")
    slide_07_bess(prs)

    print("Building slide 08: HVAC Portfolio...")
    slide_08_hvac(prs)

    print("Building slide 09: EMaaS Section Divider...")
    slide_09_emaas_what(prs)

    print("Building slide 10: EMaaS Explained...")
    slide_10_emaas_explained(prs)

    print("Building slide 11: How EMaaS Works...")
    slide_11_emaas_how(prs)

    print("Building slide 12: Technology Platform...")
    slide_12_technology(prs)

    print("Building slide 13: Hybrid Power...")
    slide_13_hybrid_power(prs)

    print("Building slide 14: Microgrid Solutions...")
    slide_14_microgrid(prs)

    print("Building slide 15: Case Study...")
    slide_15_case_study(prs)

    print("Building slide 16: Sustainability...")
    slide_16_sustainability(prs)

    print("Building slide 17: Why Sunbelt Rentals...")
    slide_17_why_sunbelt(prs)

    print("Building slide 18: Sector Applications...")
    slide_18_sectors(prs)

    print("Building slide 19: Getting Started...")
    slide_19_getting_started(prs)

    print("Building slide 20: Closing / Q&A...")
    slide_20_closing(prs)

    out = "Sunbelt_Rentals_EMaaS_ACEM_Presentation.pptx"
    prs.save(out)
    print(f"\n✅  Presentation saved: {out}")
    print(f"   Slides: {len(prs.slides)}")
    return out


if __name__ == "__main__":
    build_presentation()
