#!/usr/bin/env python3
"""
Sunbelt Rentals — EMaaS ACEM Presentation  v2
Professional redesign: minimalist, modern, board-level
Design principles: controlled whitespace · restrained orange · connected diagrams · clean hierarchy
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

# ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
OR   = RGBColor(0xF4, 0x79, 0x20)   # #F47920  Sunbelt Orange (ACCENT only)
OR_D = RGBColor(0xC0, 0x52, 0x00)   # #C05200  Deep Orange (hover/pressed)
OR_L = RGBColor(0xFF, 0xF0, 0xE0)   # #FFF0E0  Orange tint (card bg)
BK   = RGBColor(0x10, 0x10, 0x10)   # #101010  Near-black (dark BGs)
BK2  = RGBColor(0x1C, 0x1C, 0x1C)   # #1C1C1C  Card surface on dark
BK3  = RGBColor(0x26, 0x26, 0x26)   # #262626  Raised card on dark
WH   = RGBColor(0xFF, 0xFF, 0xFF)   # #FFFFFF  White
BG   = RGBColor(0xFA, 0xFA, 0xFA)   # #FAFAFA  Warm off-white (light BG)
BD   = RGBColor(0xE8, 0xE8, 0xE8)   # #E8E8E8  Border light
TX1  = RGBColor(0x1A, 0x1A, 0x1A)   # #1A1A1A  Primary text (on light)
TX2  = RGBColor(0x6B, 0x6B, 0x6B)   # #6B6B6B  Secondary text
TX3  = RGBColor(0xA0, 0xA0, 0xA0)   # #A0A0A0  Muted text (on dark)

W = Inches(13.333)
H = Inches(7.5)
FONT = "Calibri"

# ─── PRIMITIVES ──────────────────────────────────────────────────────────────

def prs_new():
    p = Presentation()
    p.slide_width, p.slide_height = W, H
    return p

def sl(p): return p.slides.add_slide(p.slide_layouts[6])

def R(slide, l, t, w, h, fill=None, lc=None, lw=Pt(0.75)):
    s = slide.shapes.add_shape(1, l, t, w, h)
    s.fill.solid() if fill else s.fill.background()
    if fill: s.fill.fore_color.rgb = fill
    if lc:
        s.line.color.rgb = lc
        s.line.width = lw
    else:
        s.line.fill.background()
    return s

def T(slide, text, l, t, w, h,
      sz=13, bold=False, color=TX1,
      align=PP_ALIGN.LEFT, italic=False):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.size = Pt(sz)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    r.font.name = FONT
    return tb

def TM(slide, lines, l, t, w, h, default_sz=13,
       default_bold=False, default_color=TX1,
       default_align=PP_ALIGN.LEFT):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        d = ln if isinstance(ln, dict) else {'text': ln}
        p.alignment = d.get('align', default_align)
        if d.get('space_before'): p.space_before = d['space_before']
        r = p.add_run()
        r.text = d.get('text', '')
        r.font.size = Pt(d.get('sz', default_sz))
        r.font.bold = d.get('bold', default_bold)
        r.font.italic = d.get('italic', False)
        r.font.color.rgb = d.get('color', default_color)
        r.font.name = FONT
    return tb

# ─── DESIGN COMPONENTS ───────────────────────────────────────────────────────

def dot_field(slide, l, t, w, h, cols=12, rows=7, color=None, alpha_sim=BK3):
    """Subtle dot-grid texture using tiny squares."""
    cw = w / (cols * 2 - 1)
    rh = h / (rows * 2 - 1)
    c = color or alpha_sim
    for row in range(rows):
        for col in range(cols):
            R(slide,
              l + Inches(col * 2 * cw / Inches(1)),
              t + Inches(row * 2 * rh / Inches(1)),
              Emu(int(cw * 0.5)), Emu(int(rh * 0.5)), fill=c)

def left_stripe(slide, color=OR):
    """8px left brand stripe."""
    R(slide, Inches(0), Inches(0), Inches(0.1), H, fill=color)

def footer(slide, dark=True):
    bg = BK if dark else BK
    R(slide, Inches(0), H - Inches(0.42), W, Inches(0.42), fill=bg)
    T(slide, "SUNBELT RENTALS  ·  POWER & HVAC DIVISION  ·  ENERGY MANAGEMENT AS A SERVICE™",
      Inches(0.22), H - Inches(0.37), Inches(10), Inches(0.32),
      sz=8.5, color=TX3, align=PP_ALIGN.LEFT)
    T(slide, "sunbeltrentals.com",
      W - Inches(2.0), H - Inches(0.37), Inches(1.85), Inches(0.32),
      sz=8.5, color=TX3, align=PP_ALIGN.RIGHT)

def page_header(slide, label, title, subtitle=None):
    """Minimal header: tiny orange label + large title + hairline."""
    T(slide, label,
      Inches(0.3), Inches(0.22), Inches(10), Inches(0.3),
      sz=9, bold=False, color=OR, align=PP_ALIGN.LEFT)
    T(slide, title,
      Inches(0.3), Inches(0.52), W - Inches(0.5), Inches(0.72),
      sz=28, bold=True, color=TX1, align=PP_ALIGN.LEFT)
    R(slide, Inches(0.3), Inches(1.28), Inches(1.0), Inches(0.04), fill=OR)
    if subtitle:
        T(slide, subtitle,
          Inches(0.3), Inches(1.4), W - Inches(0.5), Inches(0.38),
          sz=12, color=TX2, align=PP_ALIGN.LEFT)

def icon_circle(slide, glyph, l, t, dia=Inches(0.62), bg=OR, fg=WH, sz=20):
    """Filled circle with centered glyph — primary icon component."""
    R(slide, l, t, dia, dia, fill=bg)
    T(slide, glyph, l, t + Inches(0.02), dia, dia - Inches(0.04),
      sz=sz, bold=True, color=fg, align=PP_ALIGN.CENTER)

def icon_ring(slide, glyph, l, t, dia=Inches(0.6), ring_color=OR, fg=OR, sz=18):
    """Stroke-only ring icon (outline style)."""
    R(slide, l, t, dia, dia, lc=ring_color, lw=Pt(1.5))
    T(slide, glyph, l, t + Inches(0.02), dia, dia - Inches(0.04),
      sz=sz, bold=False, color=fg, align=PP_ALIGN.CENTER)

def stat_card_light(slide, value, unit, label, l, t,
                    w=Inches(2.8), h=Inches(1.75)):
    """White card with shadow simulation, orange value."""
    # Shadow
    R(slide, l + Inches(0.05), t + Inches(0.05), w, h, fill=BD)
    # Card
    R(slide, l, t, w, h, fill=WH, lc=BD, lw=Pt(0.5))
    # Orange top rule
    R(slide, l, t, w, Inches(0.055), fill=OR)
    T(slide, value,
      l + Inches(0.18), t + Inches(0.18), w - Inches(0.36), Inches(0.8),
      sz=38, bold=True, color=OR, align=PP_ALIGN.LEFT)
    if unit:
        T(slide, unit,
          l + Inches(0.18) + Inches(len(value) * 0.22), t + Inches(0.5),
          Inches(0.9), Inches(0.35), sz=13, color=TX2)
    T(slide, label,
      l + Inches(0.18), t + Inches(1.1), w - Inches(0.36), Inches(0.55),
      sz=11, color=TX2, align=PP_ALIGN.LEFT)

def stat_card_dark(slide, value, label, sub, l, t,
                   w=Inches(2.85), h=Inches(1.7)):
    """Dark card with orange value, no border."""
    R(slide, l, t, w, h, fill=BK2)
    R(slide, l, t, Inches(0.055), h, fill=OR)
    T(slide, value,
      l + Inches(0.2), t + Inches(0.12), w - Inches(0.35), Inches(0.78),
      sz=36, bold=True, color=OR, align=PP_ALIGN.LEFT)
    T(slide, label,
      l + Inches(0.2), t + Inches(0.95), w - Inches(0.35), Inches(0.4),
      sz=12, bold=True, color=WH, align=PP_ALIGN.LEFT)
    T(slide, sub,
      l + Inches(0.2), t + Inches(1.35), w - Inches(0.35), Inches(0.28),
      sz=9.5, color=TX3, align=PP_ALIGN.LEFT)

def card_dark(slide, l, t, w, h, accent=True):
    """Standard dark card surface."""
    R(slide, l, t, w, h, fill=BK2)
    if accent:
        R(slide, l, t, w, Inches(0.055), fill=OR)
    return (l, t, w, h)

def hbar(slide, label, pct, l, t, w=Inches(5.5), track_h=Inches(0.1)):
    """Horizontal percentage bar with label."""
    T(slide, label, l, t, w, Inches(0.32), sz=11, color=TX2)
    R(slide, l, t + Inches(0.35), w, track_h, fill=BD)
    R(slide, l, t + Inches(0.35), Inches(w / Inches(1) * pct), track_h, fill=OR)
    T(slide, f"{int(pct * 100)}%",
      l + w + Inches(0.08), t + Inches(0.3), Inches(0.55), Inches(0.28),
      sz=11, bold=True, color=OR)

def connector_h(slide, x1, y, x2, color=OR):
    """Horizontal connector line with arrowhead."""
    R(slide, x1, y - Inches(0.03), x2 - x1, Inches(0.05), fill=color)
    # Arrow tip
    T(slide, "▶", x2 - Inches(0.18), y - Inches(0.17), Inches(0.22), Inches(0.35),
      sz=12, bold=True, color=color, align=PP_ALIGN.LEFT)

def process_node(slide, num, title, desc, l, t, w=Inches(2.85), h=Inches(3.5), dark=False):
    """Process step card with numbered icon."""
    bg = BK2 if dark else WH
    bc = None if dark else BD
    R(slide, l, t, w, h, fill=bg, lc=bc, lw=Pt(0.5) if bc else Pt(0))
    R(slide, l, t, w, Inches(0.055), fill=OR)
    # Number badge
    icon_circle(slide, str(num), l + Inches(0.18), t + Inches(0.18),
                dia=Inches(0.52), bg=OR, fg=WH, sz=16)
    T(slide, title,
      l + Inches(0.85), t + Inches(0.2), w - Inches(1.0), Inches(0.58),
      sz=13, bold=True, color=WH if dark else TX1)
    R(slide, l + Inches(0.18), t + Inches(0.88), w - Inches(0.36), Inches(0.03),
      fill=OR if dark else BD)
    T(slide, desc,
      l + Inches(0.18), t + Inches(1.0), w - Inches(0.36), h - Inches(1.15),
      sz=10.5, color=TX3 if dark else TX2)

def section_divider(prs, section_num, eyebrow, title, sub=None):
    """Full-bleed dark section break slide."""
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)
    # Subtle dot field top-right
    for row in range(8):
        for col in range(10):
            dot_x = W - Inches(4.5) + Inches(col * 0.45)
            dot_y = Inches(0.2) + Inches(row * 0.42)
            if dot_x < W and dot_y < H:
                R(s, dot_x, dot_y, Inches(0.06), Inches(0.06), fill=BK3)
    left_stripe(s)
    # Section number
    T(s, f"— {section_num} —",
      Inches(0.3), Inches(2.0), Inches(10), Inches(0.42),
      sz=11, color=OR, align=PP_ALIGN.LEFT)
    T(s, title,
      Inches(0.3), Inches(2.5), Inches(9.5), Inches(1.9),
      sz=52, bold=True, color=WH, align=PP_ALIGN.LEFT)
    R(s, Inches(0.3), Inches(4.5), Inches(3.5), Inches(0.055), fill=OR)
    if sub:
        T(s, sub,
          Inches(0.3), Inches(4.65), Inches(8.5), Inches(0.55),
          sz=16, color=TX3, align=PP_ALIGN.LEFT)
    T(s, eyebrow,
      Inches(0.3), Inches(5.35), Inches(10), Inches(0.38),
      sz=11, color=TX3, italic=True, align=PP_ALIGN.LEFT)
    footer(s)
    return s

# ─── SLIDES ──────────────────────────────────────────────────────────────────

def s01_cover(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)

    # Right geometric panel — clean split
    R(s, Inches(8.6), Inches(0), W - Inches(8.6), H, fill=BK2)
    R(s, Inches(8.6), Inches(0), Inches(0.055), H, fill=OR)

    # Dot texture — right panel
    for row in range(14):
        for col in range(8):
            dx = Inches(8.85) + Inches(col * 0.55)
            dy = Inches(0.25) + Inches(row * 0.5)
            if dx < W and dy < H:
                R(s, dx, dy, Inches(0.07), Inches(0.07), fill=BK3)

    # Left content
    left_stripe(s)

    T(s, "SUNBELT RENTALS  ·  POWER & HVAC DIVISION",
      Inches(0.25), Inches(0.28), Inches(8.0), Inches(0.35),
      sz=10, color=OR, bold=False)

    R(s, Inches(0.25), Inches(0.7), Inches(5.0), Inches(0.03), fill=BK3)

    # Hero text
    T(s, "Energy Management",
      Inches(0.25), Inches(1.05), Inches(8.2), Inches(1.0),
      sz=50, bold=True, color=WH)
    T(s, "as a Service™",
      Inches(0.25), Inches(1.95), Inches(8.2), Inches(0.95),
      sz=50, bold=True, color=OR)

    R(s, Inches(0.25), Inches(3.05), Inches(5.5), Inches(0.055), fill=OR)

    T(s, "Powering Construction's Clean Energy Future",
      Inches(0.25), Inches(3.2), Inches(8.0), Inches(0.5),
      sz=17, color=TX3)

    # Audience block
    R(s, Inches(0.25), Inches(4.1), Inches(7.8), Inches(1.45), fill=BK2)
    R(s, Inches(0.25), Inches(4.1), Inches(0.055), Inches(1.45), fill=OR)
    T(s, "PRESENTED TO",
      Inches(0.42), Inches(4.25), Inches(7.5), Inches(0.32),
      sz=9, color=OR, bold=True)
    T(s, "Association of Construction Equipment Managers",
      Inches(0.42), Inches(4.6), Inches(7.5), Inches(0.42),
      sz=15, bold=True, color=WH)
    T(s, "30–50 of the Nation's Largest Construction Contractors  ·  2026",
      Inches(0.42), Inches(5.02), Inches(7.5), Inches(0.38),
      sz=11, color=TX3)

    # Right panel text
    TM(s, [
        {'text': '950+',   'sz': 42, 'bold': True, 'color': OR, 'align': PP_ALIGN.CENTER},
        {'text': 'Locations', 'sz': 12, 'color': TX3, 'align': PP_ALIGN.CENTER},
        {'text': ' ', 'sz': 10, 'color': TX3},
        {'text': '#1',     'sz': 42, 'bold': True, 'color': OR, 'align': PP_ALIGN.CENTER},
        {'text': 'BESS Fleet — N. America', 'sz': 12, 'color': TX3, 'align': PP_ALIGN.CENTER},
        {'text': ' ', 'sz': 10, 'color': TX3},
        {'text': '40+',    'sz': 42, 'bold': True, 'color': OR, 'align': PP_ALIGN.CENTER},
        {'text': 'Years of Innovation', 'sz': 12, 'color': TX3, 'align': PP_ALIGN.CENTER},
    ],
    Inches(8.75), Inches(1.8), W - Inches(9.0), Inches(4.5),
    default_align=PP_ALIGN.CENTER)

    footer(s)
    return s


def s02_agenda(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "TODAY'S BRIEFING", "Agenda",
                "A structured journey through Sunbelt's energy management capabilities")

    items = [
        ("01", "Sunbelt Rentals at a Glance",      "Scale · capabilities · market position"),
        ("02", "The Energy Challenge",              "What's disrupting construction power today"),
        ("03", "Complete Power & HVAC Portfolio",   "Generators · BESS · HVAC · Distribution"),
        ("04", "Energy Management as a Service™",   "The managed power ecosystem model"),
        ("05", "Hybrid Power & Microgrid Design",   "Generator + BESS architecture & control"),
        ("06", "Proven Results — Case Study",       "Real metrics from a hyperscale data center"),
        ("07", "Sustainability & ESG Impact",       "Carbon pathways and reporting capabilities"),
        ("08", "Partnership & Next Steps",          "How to engage with the Sunbelt team"),
    ]

    for i, (num, title, sub) in enumerate(items):
        col = i % 2
        row = i // 2
        l = Inches(0.3) + Inches(col * 6.5)
        t = Inches(1.88) + Inches(row * 1.25)
        w = Inches(6.1)

        # Row bg on alternating
        if row % 2 == 0:
            R(s, l, t, w, Inches(1.12), fill=WH, lc=BD, lw=Pt(0.5))
        else:
            R(s, l, t, w, Inches(1.12), fill=BG)

        # Number
        icon_circle(s, num, l + Inches(0.15), t + Inches(0.28),
                    dia=Inches(0.55), bg=OR, fg=WH, sz=14)
        T(s, title, l + Inches(0.85), t + Inches(0.25), w - Inches(1.0), Inches(0.38),
          sz=13, bold=True, color=TX1)
        T(s, sub, l + Inches(0.85), t + Inches(0.63), w - Inches(1.0), Inches(0.35),
          sz=10.5, color=TX2)

    # Centre divider
    R(s, Inches(6.62), Inches(1.78), Inches(0.04), H - Inches(2.1), fill=BD)

    footer(s, dark=True)
    return s


def s03_at_a_glance(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)
    # Dot texture top-right quadrant
    for row in range(7):
        for col in range(12):
            R(s, W - Inches(5.0) + Inches(col * 0.38),
              Inches(0.2) + Inches(row * 0.48),
              Inches(0.06), Inches(0.06), fill=BK3)
    left_stripe(s)

    T(s, "WHO WE ARE", Inches(0.25), Inches(0.22), Inches(8), Inches(0.35),
      sz=9, color=OR)
    T(s, "Sunbelt Rentals at a Glance",
      Inches(0.25), Inches(0.6), Inches(9), Inches(0.78),
      sz=30, bold=True, color=WH)
    R(s, Inches(0.25), Inches(1.45), Inches(0.9), Inches(0.055), fill=OR)
    T(s, "Four decades of equipment excellence — now the intelligence layer that makes temporary power truly work.",
      Inches(0.25), Inches(1.6), Inches(8.5), Inches(0.55),
      sz=13, color=TX3)

    # KPI row
    kpis = [
        ("950+", "Locations", "U.S. & Canada"),
        ("#1",   "BESS Fleet", "In North America"),
        ("14K+", "Equipment Types", "Comprehensive portfolio"),
        ("40+",  "Years", "Founded 1983"),
    ]
    for i, (val, lbl, sub) in enumerate(kpis):
        stat_card_dark(s, val, lbl, sub,
                       Inches(0.25) + Inches(i * 3.3), Inches(2.3),
                       w=Inches(3.1), h=Inches(1.65))

    # Detail strip
    R(s, Inches(0.25), Inches(4.18), W - Inches(0.5), Inches(0.04), fill=BK3)
    T(s, "ENTERPRISE PROFILE", Inches(0.25), Inches(4.3), Inches(6), Inches(0.35),
      sz=9, color=OR, bold=True)

    details = [
        ("Parent Company",  "Ashtead Group plc — London Stock Exchange, $26B+ global enterprise"),
        ("Capabilities",    "Power Generation · BESS · HVAC · Climate Control · Distribution Engineering"),
        ("Technology",      "EMaaS™ · DEIF Controller Ecosystem · Real-time Telematics · Load Profiling"),
        ("Sustainability",  "Tier 4 Final fleet · BESS hybrid proven · HVO-compatible · Carbon reporting"),
    ]
    for i, (lbl, val) in enumerate(details):
        t = Inches(4.78) + Inches(i * 0.56)
        T(s, lbl + "  ", Inches(0.25), t, Inches(1.8), Inches(0.42),
          sz=10.5, bold=True, color=OR)
        T(s, val, Inches(2.1), t, Inches(10.8), Inches(0.42),
          sz=10.5, color=TX3)

    footer(s)
    return s


def s04_challenge(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "THE BUSINESS CASE", "The Energy Challenge",
                "Five forces reshaping how top contractors manage temporary power")

    pain_points = [
        ("⚡", "Unpredictable Demand",
         "Loads swing 5:1 between startup surge and steady-state — legacy rental can't adapt."),
        ("💰", "Fuel Waste & Cost",
         "Generators at 20–40% capacity run at worst-case efficiency. Direct budget erosion."),
        ("🌱", "ESG & Scope 3 Mandates",
         "Owners now require carbon reporting from contractors — power source decisions matter."),
        ("🔧", "Maintenance Complexity",
         "Multi-vendor fragmentation, 24/7 operations, and inconsistent protocols drain teams."),
        ("🏗️", "Grid Infrastructure Gaps",
         "Utility upgrades average 3–6 months. Contractors need a complete interim strategy."),
    ]

    for i, (icon, head, body) in enumerate(pain_points):
        t = Inches(1.88) + Inches(i * 1.08)
        # Card
        R(s, Inches(0.25), t, Inches(12.85), Inches(0.95),
          fill=WH if i % 2 == 0 else BG, lc=BD, lw=Pt(0.5))
        # Orange left rule
        R(s, Inches(0.25), t, Inches(0.055), Inches(0.95), fill=OR)
        # Icon circle
        icon_circle(s, icon, Inches(0.45), t + Inches(0.17),
                    dia=Inches(0.6), bg=OR_L, fg=OR, sz=20)
        # Number
        T(s, f"0{i+1}", Inches(1.25), t + Inches(0.28), Inches(0.5), Inches(0.38),
          sz=11, color=OR, bold=True)
        # Headline
        T(s, head, Inches(1.8), t + Inches(0.1), Inches(3.5), Inches(0.38),
          sz=14, bold=True, color=TX1)
        # Body
        T(s, body, Inches(1.8), t + Inches(0.5), Inches(10.9), Inches(0.38),
          sz=11, color=TX2)
        # Right stat
    # Right-side market callout
    R(s, Inches(9.2), Inches(1.62), Inches(3.9), Inches(5.42), fill=WH, lc=BD, lw=Pt(0.5))
    R(s, Inches(9.2), Inches(1.62), Inches(3.9), Inches(0.055), fill=OR)
    T(s, "MARKET CONTEXT", Inches(9.38), Inches(1.75), Inches(3.55), Inches(0.35),
      sz=9, bold=True, color=OR)
    mkt = [
        ("$8.3B", "US Power Rental\nMarket by 2030"),
        ("62%",   "Projects face power\ncapacity shortfalls"),
        ("40%",   "Generator runtime\nat sub-optimal load"),
    ]
    for i, (val, lbl) in enumerate(mkt):
        mt = Inches(2.28) + Inches(i * 1.62)
        R(s, Inches(9.38), mt, Inches(3.55), Inches(1.42), fill=BG)
        T(s, val, Inches(9.55), mt + Inches(0.12), Inches(1.5), Inches(0.72),
          sz=36, bold=True, color=OR)
        T(s, lbl, Inches(9.55), mt + Inches(0.85), Inches(3.2), Inches(0.48),
          sz=11, color=TX2)

    # Override the pain point cards width to not overlap right panel
    # (already done above — right panel starts at 9.2)

    footer(s, dark=True)
    return s


def s04b_challenge(prs):
    """Redo slide 4 with correct non-overlapping layout."""
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "THE BUSINESS CASE", "The Energy Challenge",
                "Five forces reshaping how top contractors manage temporary power")

    pain_points = [
        ("⚡", "Unpredictable Demand",
         "Loads swing 5:1 between startup surge and steady-state — legacy rental can't adapt."),
        ("💰", "Fuel Waste & Cost",
         "Generators at 20–40% load run at worst-case efficiency — direct budget erosion."),
        ("🌱", "ESG & Scope 3 Mandates",
         "Owners require Scope 3 carbon reporting. Power source decisions are now contractual."),
        ("🔧", "Maintenance Complexity",
         "Multi-vendor fragmentation and 24/7 operations drain technical teams and schedules."),
        ("🏗️", "Grid Infrastructure Gaps",
         "Utility upgrades average 3–6 months. Contractors need a complete interim strategy."),
    ]

    for i, (icon, head, body) in enumerate(pain_points):
        t = Inches(1.88) + Inches(i * 1.08)
        R(s, Inches(0.25), t, Inches(8.7), Inches(0.95),
          fill=WH if i % 2 == 0 else BG, lc=BD, lw=Pt(0.5))
        R(s, Inches(0.25), t, Inches(0.055), Inches(0.95), fill=OR)
        icon_circle(s, icon, Inches(0.45), t + Inches(0.17),
                    dia=Inches(0.6), bg=OR_L, fg=OR, sz=20)
        T(s, f"0{i+1}", Inches(1.25), t + Inches(0.28), Inches(0.5), Inches(0.38),
          sz=11, color=OR, bold=True)
        T(s, head, Inches(1.8), t + Inches(0.1), Inches(3.5), Inches(0.38),
          sz=14, bold=True, color=TX1)
        T(s, body, Inches(1.8), t + Inches(0.5), Inches(7.0), Inches(0.38),
          sz=11, color=TX2)

    # Right market callout panel
    R(s, Inches(9.25), Inches(1.65), Inches(3.85), Inches(5.4), fill=WH, lc=BD, lw=Pt(0.5))
    R(s, Inches(9.25), Inches(1.65), Inches(3.85), Inches(0.055), fill=OR)
    T(s, "MARKET CONTEXT", Inches(9.45), Inches(1.78), Inches(3.5), Inches(0.35),
      sz=9, bold=True, color=OR)
    mkt = [
        ("$8.3B", "US Power Rental\nMarket by 2030"),
        ("62%",   "Projects face power\ncapacity shortfalls"),
        ("40%",   "Generator runtime\nat sub-optimal load"),
    ]
    for i, (val, lbl) in enumerate(mkt):
        mt = Inches(2.28) + Inches(i * 1.62)
        R(s, Inches(9.45), mt, Inches(3.5), Inches(1.4), fill=BG)
        T(s, val, Inches(9.62), mt + Inches(0.1), Inches(1.5), Inches(0.72),
          sz=36, bold=True, color=OR)
        T(s, lbl, Inches(9.62), mt + Inches(0.82), Inches(3.1), Inches(0.52),
          sz=11, color=TX2)

    footer(s, dark=True)
    return s


def s05_portfolio(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)
    for row in range(8):
        for col in range(12):
            R(s, W - Inches(5.5) + Inches(col * 0.42),
              Inches(0.15) + Inches(row * 0.42),
              Inches(0.06), Inches(0.06), fill=BK3)
    left_stripe(s)

    T(s, "POWER & HVAC PORTFOLIO", Inches(0.25), Inches(0.22), Inches(9), Inches(0.35),
      sz=9, color=OR)
    T(s, "One Partner. Complete Energy Ecosystem.",
      Inches(0.25), Inches(0.6), Inches(9), Inches(0.72),
      sz=30, bold=True, color=WH)
    R(s, Inches(0.25), Inches(1.38), Inches(0.9), Inches(0.055), fill=OR)
    T(s, "Every component — engineered, monitored, and optimized by Sunbelt.",
      Inches(0.25), Inches(1.52), Inches(9), Inches(0.38),
      sz=13, color=TX3)

    cats = [
        ("⚡", "POWER\nGENERATION",    "2.5 kW – 2,000 kW+",
         ["Tier 4 Final diesel & gas", "Parallel multi-MW configs", "Transfer switches & load banks"]),
        ("🔋", "BATTERY\nSTORAGE",      "<10 kWh – 750 kWh+",
         ["Trailer & skid-mounted", "Hybrid integration ready", "Island mode & grid sync"]),
        ("❄️", "HVAC &\nCLIMATE",       "7.5 – 500+ Tons",
         ["AC, chillers & spot coolers", "Heating all fuel types", "Dehumidifiers & scrubbers"]),
        ("🔌", "DISTRIBUTION\nSYSTEMS", "Full Design Service",
         ["Transformers & switchgear", "One-line schematics", "Sub-metering & protection"]),
        ("📡", "EMaaS™\nINTELLIGENCE", "Proprietary Platform",
         ["Real-time telematics", "Load profiling & analytics", "24/7 NOC monitoring"]),
    ]

    for i, (icon, title, spec, items) in enumerate(cats):
        l = Inches(0.25) + Inches(i * 2.62)
        t = Inches(2.08)
        w, h = Inches(2.48), Inches(4.92)
        R(s, l, t, w, h, fill=BK2)
        R(s, l, t, w, Inches(0.055), fill=OR)
        # Icon area
        R(s, l, t + Inches(0.055), w, Inches(0.92), fill=BK3)
        T(s, icon, l, t + Inches(0.1), w, Inches(0.65),
          sz=28, align=PP_ALIGN.CENTER, color=OR)
        T(s, title, l + Inches(0.15), t + Inches(1.05), w - Inches(0.3), Inches(0.68),
          sz=13, bold=True, color=WH)
        R(s, l + Inches(0.15), t + Inches(1.78), w - Inches(0.3), Inches(0.03), fill=OR)
        T(s, spec, l + Inches(0.15), t + Inches(1.88), w - Inches(0.3), Inches(0.38),
          sz=11, bold=True, color=OR)
        for j, item in enumerate(items):
            T(s, f"▸  {item}",
              l + Inches(0.15), t + Inches(2.42) + Inches(j * 0.75),
              w - Inches(0.3), Inches(0.62),
              sz=10.5, color=TX3)

    footer(s)
    return s


def s06_generators(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "POWER GENERATION", "Generator Fleet",
                "2.5 kW to 2,000 kW+ — Tier 4 Final · Paralleling-ready · EMaaS™ integrated")

    tiers = [
        ("PORTABLE",    "2.5–10 kW",    "Gas-powered\nJob-site tools & lighting\nFast, flexible deployment"),
        ("SMALL",       "20–60 kW",     "Diesel Tier 4 Final\nTrailers & small sites\nATS-ready"),
        ("MEDIUM",      "100–350 kW",   "Sound-attenuated housing\nBuilding-level coverage\nCritical load support"),
        ("LARGE",       "400–800 kW",   "Paralleling-ready\nCampus & campus backup\nHospital & mission-critical"),
        ("INDUSTRIAL",  "1,000–2,000kW+","Multi-unit parallel configs\nGrid-scale temporary power\nData center & utility"),
    ]

    for i, (tier, kw, detail) in enumerate(tiers):
        l = Inches(0.25) + Inches(i * 2.62)
        t = Inches(1.82)
        w, h = Inches(2.48), Inches(5.28)
        # Shadow card
        R(s, l + Inches(0.06), t + Inches(0.06), w, h, fill=BD)
        R(s, l, t, w, h, fill=WH, lc=BD, lw=Pt(0.5))
        R(s, l, t, w, Inches(0.055), fill=OR)
        # Tier label dark area
        R(s, l, t + Inches(0.055), w, Inches(0.68), fill=TX1)
        T(s, tier, l + Inches(0.15), t + Inches(0.1), w - Inches(0.3), Inches(0.55),
          sz=13, bold=True, color=WH)
        # kW range
        T(s, kw, l + Inches(0.15), t + Inches(0.82), w - Inches(0.3), Inches(0.72),
          sz=24, bold=True, color=OR)
        R(s, l + Inches(0.15), t + Inches(1.6), w - Inches(0.3), Inches(0.03), fill=BD)
        for j, line in enumerate(detail.split('\n')):
            T(s, f"▸  {line}",
              l + Inches(0.15), t + Inches(1.75) + Inches(j * 0.72),
              w - Inches(0.3), Inches(0.6),
              sz=11, color=TX2)

    # Bottom badge row
    badges = ["✔  Tier 4 Final Compliant",
              "✔  Parallel Configurations",
              "✔  Automated Transfer Switches",
              "✔  DEIF Controller Standard",
              "✔  24/7 Remote Telematics"]
    R(s, Inches(0.25), Inches(7.0), W - Inches(0.5), Inches(0.06), fill=OR)
    for i, b in enumerate(badges):
        T(s, b, Inches(0.25) + Inches(i * 2.62), Inches(6.85),
          Inches(2.5), Inches(0.35), sz=9.5, color=TX2)

    footer(s, dark=True)
    return s


def s07_bess(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)
    for row in range(7):
        for col in range(14):
            R(s, W - Inches(6.0) + Inches(col * 0.38),
              Inches(0.2) + Inches(row * 0.5),
              Inches(0.06), Inches(0.06), fill=BK3)
    left_stripe(s)
    T(s, "BATTERY ENERGY STORAGE  ·  NORTH AMERICA'S LARGEST BESS RENTAL FLEET",
      Inches(0.25), Inches(0.22), Inches(11), Inches(0.35), sz=9, color=OR)
    T(s, "Store. Dispatch. Optimize.",
      Inches(0.25), Inches(0.6), Inches(9), Inches(0.72),
      sz=32, bold=True, color=WH)
    R(s, Inches(0.25), Inches(1.38), Inches(0.9), Inches(0.055), fill=OR)
    T(s, "From load-leveling a single generator to anchoring a multi-MW microgrid.",
      Inches(0.25), Inches(1.52), Inches(9), Inches(0.38), sz=13, color=TX3)

    tiers = [
        ("<10 kWh",    "Compact Unit",      "Portable · Fast deploy\nStandalone operation\nTool & lighting support"),
        ("80–100 kWh", "Standard Mobile",   "Trailer-mounted\nSingle generator pairing\nMedium load leveling"),
        ("100–300 kWh","High Capacity",     "Multiple generator sync\nIsland mode capable\nGrid synchronization"),
        ("500–750 kWh","Industrial Scale",  "Multi-unit parallel\nMission-critical backup\nMicrogrid anchor"),
    ]

    for i, (cap, name, detail) in enumerate(tiers):
        l = Inches(0.25) + Inches(i * 3.3)
        t = Inches(2.1)
        w, h = Inches(3.1), Inches(4.85)
        R(s, l, t, w, h, fill=BK2)
        R(s, l, t, w, Inches(0.055), fill=OR)
        R(s, l, t + Inches(0.055), w, Inches(1.05), fill=BK3)
        T(s, cap, l + Inches(0.15), t + Inches(0.1), w - Inches(0.3), Inches(0.62),
          sz=26, bold=True, color=WH)
        T(s, name, l + Inches(0.15), t + Inches(0.78), w - Inches(0.3), Inches(0.3),
          sz=11, color=OR)
        R(s, l + Inches(0.15), t + Inches(1.18), w - Inches(0.3), Inches(0.03), fill=BK3)
        for j, line in enumerate(detail.split('\n')):
            T(s, f"▸  {line}",
              l + Inches(0.15), t + Inches(1.35) + Inches(j * 0.88),
              w - Inches(0.3), Inches(0.72),
              sz=12, color=TX3)

    footer(s)
    return s


def s08_hvac(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "HVAC & CLIMATE CONTROL", "Complete Thermal Solutions",
                "7.5-Ton to 500-Ton+ · Any environment · Any duration")

    cats = [
        ("❄️", "Air Conditioning",  "7.5–135 Ton",
         "Portable & trailer-mounted\nSpot coolers & packaged units"),
        ("🧊", "Chillers",          "10–500+ Ton",
         "Air & water-cooled\nProcess-grade temperature control"),
        ("🔥", "Heating Systems",   "All Fuel Types",
         "Electric · Direct-fired · Indirect\nHydronic heating solutions"),
        ("💨", "Ventilation",       "Industrial Grade",
         "Axial & centrifugal fans\nConfined space & smoke extraction"),
        ("💧", "Dehumidification",  "Commercial Scale",
         "Construction & restoration\nMoisture-critical environments"),
        ("🌀", "Air Handlers",      "Custom Configs",
         "Filtered fresh-air systems\nAir quality management"),
    ]

    positions = [
        (Inches(0.25), Inches(1.88)),
        (Inches(4.62), Inches(1.88)),
        (Inches(9.0),  Inches(1.88)),
        (Inches(0.25), Inches(4.62)),
        (Inches(4.62), Inches(4.62)),
        (Inches(9.0),  Inches(4.62)),
    ]

    for (icon, title, spec, detail), (l, t) in zip(cats, positions):
        w, h = Inches(4.12), Inches(2.52)
        R(s, l + Inches(0.06), t + Inches(0.06), w, h, fill=BD)
        R(s, l, t, w, h, fill=WH, lc=BD, lw=Pt(0.5))
        R(s, l, t, w, Inches(0.055), fill=OR)
        T(s, icon, l + Inches(0.18), t + Inches(0.14), Inches(0.55), Inches(0.55),
          sz=24, align=PP_ALIGN.CENTER)
        T(s, title, l + Inches(0.85), t + Inches(0.15), w - Inches(1.0), Inches(0.42),
          sz=14, bold=True, color=TX1)
        T(s, spec, l + Inches(0.85), t + Inches(0.57), w - Inches(1.0), Inches(0.32),
          sz=11, bold=True, color=OR)
        R(s, l + Inches(0.18), t + Inches(0.98), w - Inches(0.36), Inches(0.03), fill=BD)
        for j, line in enumerate(detail.split('\n')):
            T(s, f"▸  {line}",
              l + Inches(0.18), t + Inches(1.12) + Inches(j * 0.52),
              w - Inches(0.36), Inches(0.45), sz=11, color=TX2)

    footer(s, dark=True)
    return s


def s09_emaas_section(prs):
    return section_divider(prs,
        "SECTION 04",
        "Energy Management\nas a Service™",
        "From transactional rental to a fully managed, data-driven power ecosystem",
        "Proprietary EMaaS™ platform · DEIF controller ecosystem · 24/7 intelligence")


def s10_emaas_explained(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "EMaaS™ DEFINED", "What Is Energy Management as a Service?")

    # Definition block
    R(s, Inches(0.25), Inches(1.52), Inches(12.85), Inches(0.92), fill=TX1)
    R(s, Inches(0.25), Inches(1.52), Inches(0.055), Inches(0.92), fill=OR)
    T(s, '"EMaaS™ treats temporary power as a complete managed ecosystem — monitored, optimized, and actively\nadjusted to meet operational requirements as they change in real time."',
      Inches(0.42), Inches(1.62), Inches(12.3), Inches(0.72),
      sz=13, italic=True, color=WH)

    # Comparison — two clean columns
    T(s, "TRADITIONAL RENTAL",
      Inches(0.25), Inches(2.65), Inches(5.65), Inches(0.38),
      sz=11, bold=True, color=TX2, align=PP_ALIGN.CENTER)
    T(s, "EMaaS™  BY SUNBELT RENTALS",
      Inches(7.2), Inches(2.65), Inches(5.9), Inches(0.38),
      sz=11, bold=True, color=OR, align=PP_ALIGN.CENTER)
    R(s, Inches(0.25), Inches(3.05), Inches(5.65), Inches(0.03), fill=BD)
    R(s, Inches(7.2), Inches(3.05), Inches(5.9), Inches(0.03), fill=OR)

    rows = [
        ("Reactive — deployed and forgotten",         "Proactive — continuous optimization"),
        ("One-size-fits-all sizing",                  "Load profiling → right-sized solution"),
        ("Fuel cost is a fixed expense",              "Active fuel management with BESS"),
        ("Fix on failure or fixed schedule",          "Predictive maintenance via telematics"),
        ("Multiple vendors, split accountability",    "Single partner, end-to-end ownership"),
        ("No performance data visibility",            "Real-time dashboards & ESG reporting"),
    ]

    for i, (trad, emaas) in enumerate(rows):
        t = Inches(3.12) + Inches(i * 0.64)
        bg = BG if i % 2 == 0 else WH
        R(s, Inches(0.25), t, Inches(5.65), Inches(0.58), fill=bg)
        R(s, Inches(7.2), t, Inches(5.9), Inches(0.58), fill=OR_L if i % 2 == 0 else WH)
        T(s, f"✘  {trad}", Inches(0.4), t + Inches(0.12), Inches(5.35), Inches(0.4),
          sz=11, color=TX2)
        T(s, f"✔  {emaas}", Inches(7.35), t + Inches(0.12), Inches(5.6), Inches(0.4),
          sz=11, color=TX1)

    # VS column
    R(s, Inches(5.9), Inches(2.65), Inches(1.3), Inches(4.08), fill=TX1)
    T(s, "vs", Inches(5.9), Inches(4.5), Inches(1.3), Inches(0.5),
      sz=22, bold=True, color=OR, align=PP_ALIGN.CENTER)

    footer(s, dark=True)
    return s


def s11_emaas_how(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "EMaaS™ PROCESS", "How EMaaS™ Works",
                "The four-stage managed power lifecycle")

    steps = [
        ("01", "ASSESS & PROFILE",
         "Load Analysis",
         "We analyze actual demand patterns — not estimated peaks. Load profiles, voltage requirements, and efficiency opportunities are documented before any equipment is selected."),
        ("02", "DESIGN & ENGINEER",
         "Right-Sized Solution",
         "Engineers develop a complete energy architecture: generator sizing, BESS integration, distribution layout, transfer schemes, and redundancy design — with one-line schematics."),
        ("03", "DEPLOY & INTEGRATE",
         "Expert Commissioning",
         "Factory-tested equipment delivered and installed by certified technicians. Full parallel testing, integration checks, and grid synchronization completed before go-live."),
        ("04", "MONITOR & OPTIMIZE",
         "Continuous Intelligence",
         "DEIF telematics track fuel, load, voltage, and efficiency 24/7. Machine intelligence handles routine optimization; specialists manage complexity and escalations."),
    ]

    # Connecting line
    R(s, Inches(1.05), Inches(4.0), Inches(11.2), Inches(0.05), fill=OR_L)

    for i, (num, title, sub, body) in enumerate(steps):
        l = Inches(0.25) + Inches(i * 3.3)
        w = Inches(3.1)

        # Card above timeline
        ct = Inches(1.72)
        ch = Inches(2.1)
        R(s, l + Inches(0.06), ct + Inches(0.06), w, ch, fill=BD)
        R(s, l, ct, w, ch, fill=WH, lc=BD, lw=Pt(0.5))
        R(s, l, ct, w, Inches(0.055), fill=OR)
        T(s, title, l + Inches(0.18), ct + Inches(0.12), w - Inches(0.36), Inches(0.52),
          sz=13, bold=True, color=TX1)
        T(s, sub, l + Inches(0.18), ct + Inches(0.68), w - Inches(0.36), Inches(0.32),
          sz=10, bold=True, color=OR)
        R(s, l + Inches(0.18), ct + Inches(1.05), w - Inches(0.36), Inches(0.03), fill=BD)

        # Connector down to timeline
        R(s, l + Inches(1.32), ct + ch, Inches(0.05), Inches(0.18), fill=OR)

        # Node on timeline
        icon_circle(s, num, l + Inches(1.1), Inches(3.72),
                    dia=Inches(0.55), bg=OR, fg=WH, sz=14)

        # Connector down from timeline
        R(s, l + Inches(1.32), Inches(4.27), Inches(0.05), Inches(0.22), fill=OR)

        # Card below timeline
        bt = Inches(4.5)
        bh = Inches(2.52)
        R(s, l + Inches(0.06), bt + Inches(0.06), w, bh, fill=BD)
        R(s, l, bt, w, bh, fill=WH, lc=BD, lw=Pt(0.5))
        T(s, body, l + Inches(0.18), bt + Inches(0.15), w - Inches(0.36), bh - Inches(0.25),
          sz=10.5, color=TX2)

    footer(s, dark=True)
    return s


def s12_technology(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)
    for row in range(8):
        for col in range(10):
            R(s, W - Inches(4.8) + Inches(col * 0.42),
              Inches(0.15) + Inches(row * 0.48),
              Inches(0.06), Inches(0.06), fill=BK3)
    left_stripe(s)
    T(s, "TECHNOLOGY PLATFORM  ·  THE INTELLIGENCE BEHIND EMaaS™",
      Inches(0.25), Inches(0.22), Inches(11), Inches(0.35), sz=9, color=OR)
    T(s, "Powered by Data. Managed by Experts.",
      Inches(0.25), Inches(0.6), Inches(9), Inches(0.72),
      sz=30, bold=True, color=WH)
    R(s, Inches(0.25), Inches(1.38), Inches(0.9), Inches(0.055), fill=OR)
    T(s, "Real-time visibility and active optimization across every asset in the fleet.",
      Inches(0.25), Inches(1.52), Inches(9), Inches(0.38), sz=13, color=TX3)

    pillars = [
        ("DEIF CONTROLLER\nECOSYSTEM",
         ["AGC-4 Mk II — daily fleet standard",
          "AGC-150 — generator & BESS management",
          "TDU107 — co-developed touch display",
          "Consistent across entire rental portfolio",
          "Parallel · island mode · Tier 4 control"]),
        ("REAL-TIME\nTELEMATICS",
         ["Continuous fuel consumption tracking",
          "Load demand & efficiency monitoring",
          "Voltage stability & frequency control",
          "Predictive maintenance alerting",
          "Remote load management capability"]),
        ("LOAD PROFILING\n& ANALYTICS",
         ["Actual vs. estimated demand analysis",
          "Peak/off-peak pattern identification",
          "Right-sizing recommendations",
          "Efficiency opportunity mapping",
          "Carbon reduction quantification"]),
        ("REPORTING &\nINTELLIGENCE",
         ["Customer performance dashboards",
          "Fuel & cost reports",
          "Emissions tracking for ESG reporting",
          "Maintenance event logs & SLA docs",
          "Scope 3 compliance support"]),
    ]

    for i, (title, items) in enumerate(pillars):
        l = Inches(0.25) + Inches(i * 3.3)
        t = Inches(2.08)
        w, h = Inches(3.1), Inches(4.9)
        R(s, l, t, w, h, fill=BK2)
        R(s, l, t, w, Inches(0.055), fill=OR)
        R(s, l, t + Inches(0.055), w, Inches(0.85), fill=BK3)
        T(s, title, l + Inches(0.15), t + Inches(0.1), w - Inches(0.3), Inches(0.72),
          sz=13, bold=True, color=WH)
        R(s, l + Inches(0.15), t + Inches(0.98), w - Inches(0.3), Inches(0.03), fill=BK3)
        for j, item in enumerate(items):
            T(s, f"▸  {item}",
              l + Inches(0.15), t + Inches(1.12) + Inches(j * 0.72),
              w - Inches(0.3), Inches(0.6), sz=11, color=TX3)

    footer(s)
    return s


def s13_hybrid(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "HYBRID POWER SOLUTIONS", "Generator + BESS Integration",
                "Smarter. Cleaner. Measurably more efficient.")

    # Architecture nodes — connected diagram style
    nodes = [
        (Inches(0.7),  Inches(3.28), "⚡", "GENERATOR",   "2.5kW–2,000kW+"),
        (Inches(4.15), Inches(3.28), "🔄", "DEIF CONTROL", "Active switching"),
        (Inches(7.6),  Inches(3.28), "🔋", "BESS",         "<10–750kWh"),
        (Inches(11.05),Inches(3.28), "🏗️", "SITE LOAD",    "Dynamic demand"),
    ]

    node_w, node_h = Inches(1.92), Inches(1.6)

    for j, (nl, nt, icon, title, spec) in enumerate(nodes):
        bg_c = OR if j == 1 else BK2
        R(s, nl, nt, node_w, node_h, fill=bg_c)
        R(s, nl, nt, node_w, Inches(0.055), fill=OR if j != 1 else WH)
        T(s, icon, nl, nt + Inches(0.08), node_w, Inches(0.6),
          sz=24, align=PP_ALIGN.CENTER, color=WH if j != 1 else TX1)
        T(s, title, nl + Inches(0.1), nt + Inches(0.72), node_w - Inches(0.2), Inches(0.38),
          sz=11, bold=True, color=WH if j != 1 else TX1, align=PP_ALIGN.CENTER)
        T(s, spec, nl + Inches(0.1), nt + Inches(1.1), node_w - Inches(0.2), Inches(0.32),
          sz=9.5, color=TX3 if j != 1 else WH, align=PP_ALIGN.CENTER)
        # Connector to next node
        if j < len(nodes) - 1:
            cx = nl + node_w
            cy = nt + Inches(0.8) - Inches(0.025)
            R(s, cx, cy, Inches(0.52), Inches(0.05), fill=OR)
            T(s, "▶", cx + Inches(0.32), cy - Inches(0.18), Inches(0.25), Inches(0.35),
              sz=12, bold=True, color=OR)

    # How it works — left column
    T(s, "HOW IT WORKS", Inches(0.25), Inches(5.12), Inches(6.0), Inches(0.35),
      sz=9, bold=True, color=OR)
    R(s, Inches(0.25), Inches(5.5), Inches(6.0), Inches(0.03), fill=BD)
    steps = [
        "1.  Generator runs → charges BESS while powering the site",
        "2.  Generator shuts down → BESS supplies load seamlessly",
        "3.  Load exceeds BESS capacity → generator restarts automatically",
        "4.  DEIF controller manages all switching — zero manual intervention",
    ]
    for i, step in enumerate(steps):
        T(s, step, Inches(0.25), Inches(5.62) + Inches(i * 0.42),
          Inches(6.0), Inches(0.38), sz=11, color=TX2)

    # Results — right column with data bars
    T(s, "PROVEN RESULTS", Inches(7.1), Inches(5.12), Inches(5.9), Inches(0.35),
      sz=9, bold=True, color=OR)
    R(s, Inches(7.1), Inches(5.5), Inches(5.9), Inches(0.03), fill=BD)

    results_bar = [
        ("Fuel Reduction",           0.82),
        ("Maintenance Cost Savings", 0.75),
        ("CO₂e Emissions Avoided",   0.82),
    ]
    for i, (lbl, pct) in enumerate(results_bar):
        t = Inches(5.62) + Inches(i * 0.58)
        T(s, lbl, Inches(7.1), t, Inches(3.5), Inches(0.28), sz=10, color=TX2)
        R(s, Inches(7.1), t + Inches(0.3), Inches(4.8), Inches(0.14), fill=BD)
        R(s, Inches(7.1), t + Inches(0.3), Inches(4.8 * pct), Inches(0.14), fill=OR)
        T(s, f"{int(pct*100)}%", Inches(7.1) + Inches(4.88), t + Inches(0.25),
          Inches(0.5), Inches(0.28), sz=11, bold=True, color=OR)

    # Key stats below bars
    kstats = [("34,026 gal", "Diesel saved"), ("$43,521", "Maint. savings"), ("130", "Service calls eliminated")]
    for i, (val, lbl) in enumerate(kstats):
        l = Inches(7.1) + Inches(i * 2.0)
        T(s, val, l, Inches(7.05), Inches(1.85), Inches(0.38),
          sz=16, bold=True, color=OR)

    footer(s, dark=True)
    return s


def s14_microgrid(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)
    for row in range(7):
        for col in range(12):
            R(s, W - Inches(5.5) + Inches(col * 0.42),
              Inches(0.15) + Inches(row * 0.5),
              Inches(0.06), Inches(0.06), fill=BK3)
    left_stripe(s)
    T(s, "MICROGRID SOLUTIONS  ·  ISLAND-MODE POWER ARCHITECTURE",
      Inches(0.25), Inches(0.22), Inches(11), Inches(0.35), sz=9, color=OR)
    T(s, "Complete Temporary Microgrid Design",
      Inches(0.25), Inches(0.6), Inches(9), Inches(0.72),
      sz=30, bold=True, color=WH)
    R(s, Inches(0.25), Inches(1.38), Inches(0.9), Inches(0.055), fill=OR)
    T(s, "When grid access is unavailable, unreliable, or insufficient — we engineer a complete independent ecosystem.",
      Inches(0.25), Inches(1.52), Inches(10), Inches(0.38), sz=13, color=TX3)

    layers = [
        ("01", "GENERATION\nLAYER",      ["Multiple parallel generators", "Up to multi-MW capacity", "Auto load sharing", "N+1 redundancy"]),
        ("02", "STORAGE\nLAYER",         ["BESS arrays in parallel", "Peak shaving & leveling", "Seamless source transition", "Configurable DOD"]),
        ("03", "DISTRIBUTION\nLAYER",    ["MV/LV transformer stations", "Automated transfer schemes", "Switchgear & protection", "Metering & sub-metering"]),
        ("04", "RENEWABLE\nINTEGRATION", ["Solar PV synchronization", "Wind energy ready", "Fuel cell architecture", "Net-zero pathway"]),
        ("05", "CONTROL\nLAYER",         ["DEIF master controller", "Remote SCADA visibility", "Demand response", "Grid reconnect protocols"]),
    ]

    for i, (num, title, items) in enumerate(layers):
        l = Inches(0.25) + Inches(i * 2.62)
        t = Inches(2.08)
        w, h = Inches(2.48), Inches(4.88)
        R(s, l, t, w, h, fill=BK2)
        R(s, l, t, w, Inches(0.055), fill=OR)
        icon_circle(s, num, l + Inches(0.18), t + Inches(0.18),
                    dia=Inches(0.5), bg=OR, fg=WH, sz=14)
        T(s, title, l + Inches(0.82), t + Inches(0.18), w - Inches(0.97), Inches(0.68),
          sz=12, bold=True, color=WH)
        R(s, l + Inches(0.18), t + Inches(0.95), w - Inches(0.36), Inches(0.03), fill=BK3)
        for j, item in enumerate(items):
            T(s, f"▸  {item}",
              l + Inches(0.18), t + Inches(1.12) + Inches(j * 0.88),
              w - Inches(0.36), Inches(0.72), sz=11, color=TX3)

    footer(s)
    return s


def s15_case_study(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "CASE STUDY", "Hyperscale Data Center — EMaaS™ in Action",
                "Hybrid BESS + Generator system over a 6-month construction phase")

    # Left: project details
    R(s, Inches(0.25), Inches(1.7), Inches(4.25), Inches(5.42), fill=TX1)
    R(s, Inches(0.25), Inches(1.7), Inches(0.055), Inches(5.42), fill=OR)
    T(s, "PROJECT PROFILE", Inches(0.45), Inches(1.85), Inches(3.8), Inches(0.35),
      sz=9, bold=True, color=OR)
    details = [
        ("Project Type",   "Hyperscale Data Center Construction"),
        ("Duration",       "6 Months"),
        ("Architecture",   "15 Parallel Generators + BESS Array"),
        ("Primary Source", "BESS — generators engage on demand"),
        ("Monitoring",     "24/7 EMaaS™ telematics — DEIF platform"),
        ("Load Profile",   "1,000A peak → 200A steady-state (5:1 ratio)"),
    ]
    for i, (lbl, val) in enumerate(details):
        t = Inches(2.38) + Inches(i * 0.75)
        T(s, lbl, Inches(0.45), t, Inches(1.45), Inches(0.38),
          sz=10, bold=True, color=OR)
        T(s, val, Inches(1.95), t, Inches(2.42), Inches(0.38),
          sz=10, color=TX3)
    T(s, '"The BESS served as the primary power source with generators engaging only when load exceeded battery capacity or during recharge cycles."',
      Inches(0.45), Inches(6.7), Inches(3.8), Inches(0.8),
      sz=9.5, italic=True, color=TX3)

    # Right: results as visual data cards + bars
    T(s, "MEASURED OUTCOMES", Inches(4.72), Inches(1.78), Inches(8.4), Inches(0.35),
      sz=9, bold=True, color=OR)
    R(s, Inches(4.72), Inches(2.18), Inches(8.4), Inches(0.03), fill=BD)

    results = [
        ("82%",      "Fuel consumption reduction",     0.82),
        ("34,026",   "Gallons of diesel NOT burned",   1.0),
        ("$43,521",  "Maintenance cost savings",        0.75),
        ("130",      "Service calls eliminated",        0.80),
        ("120 tons", "CO₂e emissions avoided",          0.82),
    ]

    for i, (val, lbl, pct) in enumerate(results):
        t = Inches(2.28) + Inches(i * 0.98)
        # Value
        T(s, val, Inches(4.72), t, Inches(2.2), Inches(0.72),
          sz=32, bold=True, color=OR)
        # Label
        T(s, lbl, Inches(6.98), t + Inches(0.22), Inches(3.0), Inches(0.42),
          sz=12, color=TX2)
        # Data bar (visual)
        R(s, Inches(4.72), t + Inches(0.78), Inches(8.1), Inches(0.1), fill=BD)
        R(s, Inches(4.72), t + Inches(0.78), Inches(8.1 * pct), Inches(0.1), fill=OR)

    # Bottom callout
    R(s, Inches(4.72), Inches(7.04), Inches(8.4), Inches(0.055), fill=OR)

    footer(s, dark=True)
    return s


def s16_sustainability(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)
    for row in range(7):
        for col in range(10):
            R(s, W - Inches(4.5) + Inches(col * 0.42),
              Inches(0.15) + Inches(row * 0.5),
              Inches(0.06), Inches(0.06), fill=BK3)
    left_stripe(s)
    T(s, "SUSTAINABILITY & ESG  ·  MEASURABLE PATHWAYS TO NET ZERO",
      Inches(0.25), Inches(0.22), Inches(11), Inches(0.35), sz=9, color=OR)
    T(s, "Your ESG Goals. Our Engineering.",
      Inches(0.25), Inches(0.6), Inches(9), Inches(0.72),
      sz=30, bold=True, color=WH)
    R(s, Inches(0.25), Inches(1.38), Inches(0.9), Inches(0.055), fill=OR)
    T(s, "Every EMaaS™ deployment is tracked, quantified, and reportable for Scope 3 compliance.",
      Inches(0.25), Inches(1.52), Inches(10), Inches(0.38), sz=13, color=TX3)

    # Metric strip
    metrics = [
        ("82%",   "Max Fuel Reduction",  "Documented"),
        ("120T+", "CO₂e Per Project",    "Reportable"),
        ("#1",    "BESS Fleet N. Am.",   "Proven Scale"),
        ("Tier 4","Final Compliant",     "Entire Fleet"),
    ]
    for i, (val, lbl, badge) in enumerate(metrics):
        stat_card_dark(s, val, lbl, badge,
                       Inches(0.25) + Inches(i * 3.3), Inches(2.08),
                       w=Inches(3.1), h=Inches(1.58))

    # Pathway grid
    R(s, Inches(0.25), Inches(3.88), W - Inches(0.5), Inches(0.04), fill=BK3)
    T(s, "CLEAN ENERGY PATHWAYS AVAILABLE TODAY",
      Inches(0.25), Inches(4.0), Inches(9), Inches(0.35),
      sz=9, bold=True, color=OR)

    pathways = [
        ("⚡", "Hybrid Diesel + BESS",   "Immediate fuel & emissions reduction — no infrastructure change required."),
        ("☀️", "Solar + Storage",         "Integrate renewable generation into any temporary power architecture."),
        ("🔋", "BESS Island Mode",        "Operate emission-free during grid outages or off-peak periods."),
        ("⛽", "HVO Fuel Compatible",     "Compatible fleet for Hydrotreated Vegetable Oil — up to 90% lower CO₂."),
        ("📊", "Scope 3 Reporting",       "Full emissions quantification for ESG compliance documentation."),
        ("🌿", "Net-Zero Roadmapping",    "Expert consultation for construction site decarbonization strategy."),
    ]

    for i, (icon, title, desc) in enumerate(pathways):
        col = i % 3
        row = i // 3
        l = Inches(0.25) + Inches(col * 4.38)
        t = Inches(4.52) + Inches(row * 1.12)
        w = Inches(4.12)
        R(s, l, t, w, Inches(1.0), fill=BK2)
        R(s, l, t, Inches(0.055), Inches(1.0), fill=OR)
        T(s, icon, l + Inches(0.2), t + Inches(0.1), Inches(0.45), Inches(0.45),
          sz=18, align=PP_ALIGN.CENTER)
        T(s, title, l + Inches(0.75), t + Inches(0.08), w - Inches(0.9), Inches(0.38),
          sz=12, bold=True, color=WH)
        T(s, desc, l + Inches(0.75), t + Inches(0.48), w - Inches(0.9), Inches(0.45),
          sz=10, color=TX3)

    footer(s)
    return s


def s17_why(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "COMPETITIVE DIFFERENTIATION", "Why Sunbelt Rentals",
                "Five reasons the nation's largest contractors choose us — every time")

    diffs = [
        ("01", "⚡", "National Scale\nWith Local Depth",
         "950+ locations · locally embedded Power & HVAC specialists · 24/7 emergency dispatch · pre-positioned inventory"),
        ("02", "📡", "Proprietary\nTechnology",
         "EMaaS™ · DEIF controller ecosystem · real-time telematics · load profiling analytics — no competitor matches this stack"),
        ("03", "🔋", "N. America's\nLargest BESS Fleet",
         "Full range <10kWh–750kWh+ · proven hybrid & microgrid experience · deployable within 24–48 hours"),
        ("04", "📐", "Complete\nSolution Design",
         "Licensed engineers on staff · one-line schematics · full distribution design · single-vendor accountability"),
        ("05", "🏛️", "Ashtead Group\nEnterprise Strength",
         "$26B global enterprise · investment-grade balance sheet · continuous fleet reinvestment · sustainability at scale"),
    ]

    for i, (num, icon, title, body) in enumerate(diffs):
        col = i % 3 if i < 3 else (i - 3)
        row = 0 if i < 3 else 1
        w = Inches(4.22) if i < 3 else Inches(6.42)
        l = Inches(0.25) + Inches(col * (4.38 if i < 3 else 6.62))
        t = Inches(1.88) + Inches(row * 2.78)
        h = Inches(2.55)

        R(s, l + Inches(0.06), t + Inches(0.06), w, h, fill=BD)
        R(s, l, t, w, h, fill=WH, lc=BD, lw=Pt(0.5))
        R(s, l, t, w, Inches(0.055), fill=OR)

        icon_circle(s, icon, l + Inches(0.18), t + Inches(0.18),
                    dia=Inches(0.5), bg=OR_L, fg=OR, sz=18)
        T(s, num, l + Inches(0.82), t + Inches(0.18), Inches(0.5), Inches(0.32),
          sz=10, bold=True, color=OR)
        T(s, title, l + Inches(0.82), t + Inches(0.42), w - Inches(1.0), Inches(0.68),
          sz=13, bold=True, color=TX1)
        R(s, l + Inches(0.18), t + Inches(1.18), w - Inches(0.36), Inches(0.03), fill=BD)
        T(s, body, l + Inches(0.18), t + Inches(1.3), w - Inches(0.36), h - Inches(1.45),
          sz=10.5, color=TX2)

    footer(s, dark=True)
    return s


def s18_sectors(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)
    for row in range(7):
        for col in range(10):
            R(s, W - Inches(4.5) + Inches(col * 0.42),
              Inches(0.15) + Inches(row * 0.5),
              Inches(0.06), Inches(0.06), fill=BK3)
    left_stripe(s)
    T(s, "SECTOR APPLICATIONS  ·  BUILT FOR THE ENR 400",
      Inches(0.25), Inches(0.22), Inches(11), Inches(0.35), sz=9, color=OR)
    T(s, "Every Major Construction Vertical. One Partner.",
      Inches(0.25), Inches(0.6), Inches(9), Inches(0.72),
      sz=30, bold=True, color=WH)
    R(s, Inches(0.25), Inches(1.38), Inches(0.9), Inches(0.055), fill=OR)
    T(s, "Sunbelt delivers every project type a purpose-built energy strategy.",
      Inches(0.25), Inches(1.52), Inches(9), Inches(0.38), sz=13, color=TX3)

    sectors = [
        ("🏢", "COMMERCIAL\nCONSTRUCTION",
         ["High-rise temporary power", "Phased utility coordination", "Tower crane & elevator loads"]),
        ("🏭", "INDUSTRIAL &\nMANUFACTURING",
         ["Plant turnaround power", "Process load management", "High-inertia motor starts"]),
        ("🏥", "MISSION\nCRITICAL",
         ["Hospital & data center bridging", "N+1 generator redundancy", "Zero-interruption transitions"]),
        ("🌉", "HEAVY CIVIL &\nINFRASTRUCTURE",
         ["Remote site no-grid power", "Tunnel & underground work", "Bridge & highway lighting"]),
        ("⚡", "ENERGY &\nUTILITIES",
         ["Substation upgrade bridge", "Renewable project laydown", "Grid interconnect staging"]),
        ("🖥️", "DATA CENTER\nCONSTRUCTION",
         ["Hyperscale commissioning", "Phased IT load energization", "EMaaS™ proven — 82% fuel cut"]),
    ]

    for i, (icon, title, items) in enumerate(sectors):
        col = i % 3
        row = i // 3
        l = Inches(0.25) + Inches(col * 4.38)
        t = Inches(2.1) + Inches(row * 2.45)
        w, h = Inches(4.12), Inches(2.28)
        R(s, l, t, w, h, fill=BK2)
        R(s, l, t, w, Inches(0.055), fill=OR)
        T(s, icon, l + Inches(0.18), t + Inches(0.12), Inches(0.6), Inches(0.6),
          sz=24, align=PP_ALIGN.CENTER)
        T(s, title, l + Inches(0.9), t + Inches(0.1), w - Inches(1.05), Inches(0.72),
          sz=12, bold=True, color=WH)
        for j, item in enumerate(items):
            T(s, f"▸  {item}",
              l + Inches(0.18), t + Inches(0.88) + Inches(j * 0.45),
              w - Inches(0.36), Inches(0.38), sz=10.5, color=TX3)

    footer(s)
    return s


def s19_next_steps(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BG)
    left_stripe(s)
    page_header(s, "GETTING STARTED", "Your Path to EMaaS™",
                "Five steps from first conversation to fully managed power ecosystem")

    journey = [
        ("DISCOVERY", "30-min consultation with a solutions specialist. We learn your project profile, load requirements, and timeline — no commitment required."),
        ("SITE ASSESSMENT", "Our engineers conduct a load study and site review at no charge. Actual demand profiling, peak analysis, and infrastructure review."),
        ("SOLUTION DESIGN", "Complete energy architecture proposal: equipment mix, schematics, EMaaS™ monitoring plan, and sustainability projections."),
        ("DEPLOYMENT", "Factory-tested equipment delivered and commissioned by certified technicians. Full testing before go-live."),
        ("MANAGED SERVICE", "24/7 monitoring, proactive optimization, regular performance reporting, and a dedicated account team — for the life of your project."),
    ]

    R(s, Inches(1.3), Inches(3.88), Inches(10.8), Inches(0.05), fill=OR_L)

    for i, (step_title, step_body) in enumerate(journey):
        l = Inches(0.25) + Inches(i * 2.65)
        w = Inches(2.45)

        # Top card
        ct, ch = Inches(1.72), Inches(1.88)
        R(s, l + Inches(0.06), ct + Inches(0.06), w, ch, fill=BD)
        R(s, l, ct, w, ch, fill=WH, lc=BD, lw=Pt(0.5))
        R(s, l, ct, w, Inches(0.055), fill=OR)
        T(s, step_title, l + Inches(0.15), ct + Inches(0.12), w - Inches(0.3), Inches(0.48),
          sz=12, bold=True, color=TX1)
        R(s, l + Inches(0.15), ct + Inches(0.65), w - Inches(0.3), Inches(0.03), fill=BD)

        # Connector to node
        R(s, l + Inches(1.1), ct + ch, Inches(0.05), Inches(0.18), fill=OR)

        # Timeline node
        icon_circle(s, str(i+1), l + Inches(0.9), Inches(3.62),
                    dia=Inches(0.52), bg=OR, fg=WH, sz=14)

        # Connector from node
        R(s, l + Inches(1.1), Inches(4.14), Inches(0.05), Inches(0.22), fill=OR)

        # Bottom card
        bt, bh = Inches(4.38), Inches(2.58)
        R(s, l + Inches(0.06), bt + Inches(0.06), w, bh, fill=BD)
        R(s, l, bt, w, bh, fill=WH, lc=BD, lw=Pt(0.5))
        T(s, step_body, l + Inches(0.15), bt + Inches(0.15), w - Inches(0.3), bh - Inches(0.25),
          sz=10.5, color=TX2)

    footer(s, dark=True)
    return s


def s20_close(prs):
    s = sl(prs)
    R(s, Inches(0), Inches(0), W, H, fill=BK)

    # Right panel
    R(s, Inches(8.8), Inches(0), W - Inches(8.8), H, fill=BK2)
    R(s, Inches(8.8), Inches(0), Inches(0.055), H, fill=OR)

    # Dot texture right panel
    for row in range(14):
        for col in range(8):
            dx = Inches(9.1) + Inches(col * 0.52)
            dy = Inches(0.25) + Inches(row * 0.5)
            if dx < W and dy < H:
                R(s, dx, dy, Inches(0.07), Inches(0.07), fill=BK3)

    left_stripe(s)

    T(s, "SUNBELT RENTALS  ·  POWER & HVAC DIVISION",
      Inches(0.25), Inches(0.28), Inches(8.3), Inches(0.35),
      sz=10, color=OR)
    R(s, Inches(0.25), Inches(0.7), Inches(5.0), Inches(0.03), fill=BK3)

    T(s, "Your Energy\nManagement\nPartner",
      Inches(0.25), Inches(1.05), Inches(8.3), Inches(2.5),
      sz=52, bold=True, color=WH)

    R(s, Inches(0.25), Inches(3.65), Inches(5.5), Inches(0.055), fill=OR)

    T(s, "Let's engineer your project's energy future — together.",
      Inches(0.25), Inches(3.82), Inches(8.2), Inches(0.48),
      sz=16, color=TX3)

    contacts = [
        ("🌐", "sunbeltrentals.com/power-hvac"),
        ("📞", "Power & HVAC Division: 1-800-SUNBELT"),
        ("📍", "950+ Locations — Find Your Nearest Expert"),
    ]
    for i, (icon, detail) in enumerate(contacts):
        t = Inches(4.62) + Inches(i * 0.52)
        T(s, icon, Inches(0.25), t, Inches(0.42), Inches(0.42),
          sz=15, color=OR, align=PP_ALIGN.CENTER)
        T(s, detail, Inches(0.78), t + Inches(0.05), Inches(7.8), Inches(0.38),
          sz=12, color=TX3)

    # Right panel — Q&A prompt
    T(s, "Q&A", Inches(8.98), Inches(2.2), W - Inches(9.15), Inches(0.95),
      sz=62, bold=True, color=WH, align=PP_ALIGN.CENTER)
    R(s, Inches(9.2), Inches(3.25), W - Inches(9.4), Inches(0.055), fill=OR)
    T(s, "We welcome your questions\nand look forward to exploring\nhow EMaaS™ can transform\nyour projects.",
      Inches(8.98), Inches(3.42), W - Inches(9.15), Inches(2.5),
      sz=13, color=TX3, align=PP_ALIGN.CENTER)

    footer(s)
    return s


# ─── BUILD ───────────────────────────────────────────────────────────────────

def build():
    prs = prs_new()

    builders = [
        ("01  Cover",              s01_cover),
        ("02  Agenda",             s02_agenda),
        ("03  At a Glance",        s03_at_a_glance),
        ("04  Energy Challenge",   s04b_challenge),
        ("05  Portfolio Overview", s05_portfolio),
        ("06  Generators",         s06_generators),
        ("07  BESS",               s07_bess),
        ("08  HVAC",               s08_hvac),
        ("09  EMaaS Section",      s09_emaas_section),
        ("10  EMaaS Explained",    s10_emaas_explained),
        ("11  How EMaaS Works",    s11_emaas_how),
        ("12  Technology",         s12_technology),
        ("13  Hybrid Power",       s13_hybrid),
        ("14  Microgrid",          s14_microgrid),
        ("15  Case Study",         s15_case_study),
        ("16  Sustainability",     s16_sustainability),
        ("17  Why Sunbelt",        s17_why),
        ("18  Sectors",            s18_sectors),
        ("19  Getting Started",    s19_next_steps),
        ("20  Closing / Q&A",      s20_close),
    ]

    for label, fn in builders:
        print(f"  Building slide {label}...")
        fn(prs)

    out = "Sunbelt_Rentals_EMaaS_ACEM_v2.pptx"
    prs.save(out)
    print(f"\n✅  Saved: {out}  ({len(prs.slides)} slides)")
    return out


if __name__ == "__main__":
    build()
