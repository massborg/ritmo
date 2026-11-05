#!/usr/bin/env python3
"""Generates HTML for every Ritmo Instagram asset, plus jobs.json for render.cjs."""
import json, math, os

S = os.path.dirname(os.path.abspath(__file__))
OUT = '/home/user/ritmo/marketing/instagram'
BRAND = '/home/user/ritmo/public/brand'
H = os.path.join(S, 'html')
os.makedirs(H, exist_ok=True)

C = dict(orange='#E8480C', strong='#FF6A2B', lane='#FF8A5C', accent='#FFB547', graphite='#1E1A17',
         surface='#FAF8F5', ink='#171412', muted='#5C5650', dark='#0F0A06')

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800'
         '&family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">')

THEMES = {
    'orange': dict(bg=C['orange'], fg=C['dark'], sub=C['dark'], soft='rgba(15,10,6,.72)', logo='ritmo-running-logo-reversed.svg', rule='rgba(15,10,6,.28)'),
    'graphite': dict(bg=C['graphite'], fg=C['surface'], sub=C['surface'], soft='rgba(250,248,245,.72)', logo='ritmo-running-logo-reversed.svg', rule='rgba(250,248,245,.22)'),
    'light': dict(bg=C['surface'], fg=C['ink'], sub=C['ink'], soft=C['muted'], logo='ritmo-running-logo.svg', rule='rgba(23,20,18,.14)'),
}

BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:%(w)dpx;height:%(h)dpx;overflow:hidden}
body{background:%(bg)s;color:%(fg)s;font-family:'Instrument Sans',sans-serif;position:relative;-webkit-font-smoothing:antialiased}
.art{position:absolute;left:0;right:0;bottom:136px}
.top{position:absolute;left:80px;right:80px;top:72px;height:60px;display:flex;align-items:center;justify-content:space-between;z-index:5}
.top img{height:60px;width:auto;display:block}
.kick{font-family:'DM Mono',monospace;font-size:24px;letter-spacing:.02em;color:%(soft)s}
.foot{position:absolute;left:80px;right:80px;bottom:64px;display:flex;justify-content:space-between;align-items:center;font-family:'DM Mono',monospace;font-size:24px;color:%(soft)s;z-index:5}
.eyebrow{font-family:'DM Mono',monospace;font-size:26px;color:%(soft)s;margin-bottom:28px;display:flex;align-items:center;gap:14px}
.eyebrow i{display:inline-block;width:12px;height:12px;border-radius:50%%;background:%(dot)s}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;letter-spacing:-.025em;line-height:1.0;font-size:96px;color:%(fg)s}
p.body{font-size:34px;line-height:1.42;color:%(soft)s;max-width:900px;text-wrap:pretty}
h1{text-wrap:balance}
.num{font-family:'DM Mono',monospace}
.z{position:relative;z-index:4}
"""


def page(name, w, h, theme, inner, extra_css='', dot=None):
    t = THEMES[theme]
    css = BASE_CSS % dict(w=w, h=h, bg=t['bg'], fg=t['fg'], soft=t['soft'], dot=dot or (C['dark'] if theme == 'orange' else C['orange']))
    html = f'<!doctype html><html lang="en"><head><meta charset="utf-8">{FONTS}<style>{css}{extra_css}</style></head><body>{inner}</body></html>'
    p = os.path.join(H, name + '.html')
    open(p, 'w').write(html)
    return p


def top(theme, right=''):
    return f'<div class="top"><img src="file://{BRAND}/{THEMES[theme]["logo"]}" alt=""><span class="kick">{right}</span></div>'


def foot(left='@ritmorunning.run', right=''):
    return f'<div class="foot"><span>{left}</span><span>{right}</span></div>'


# ---------------------------------------------------------------- illustrations (original SVG)

def svg(w, h, body):
    return f'<svg class="art" width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'


def art_sunrise():
    """Sunrise over a track, lanes running to the horizon."""
    w, h, hy = 1080, 660, 310
    b = []
    b.append(f'<defs><clipPath id="sky"><rect x="0" y="0" width="{w}" height="{hy}"/></clipPath>'
             f'<clipPath id="ground"><rect x="0" y="{hy}" width="{w}" height="{h-hy}"/></clipPath></defs>')
    b.append(f'<g clip-path="url(#sky)">')
    for i, r in enumerate([295, 240, 190]):
        b.append(f'<circle cx="540" cy="{hy}" r="{r}" fill="none" stroke="{C["lane"]}" stroke-width="5" opacity="{0.55 + i*0.15:.2f}"/>')
    b.append(f'<circle cx="540" cy="{hy}" r="135" fill="{C["accent"]}"/></g>')
    # track surface
    vx = 540
    b.append(f'<g clip-path="url(#ground)">')
    b.append(f'<polygon points="{vx-40},{hy} {vx+40},{hy} {w+520},{h} {-520},{h}" fill="{C["strong"]}"/>')
    n = 8
    for i in range(n + 1):
        xb = -520 + i * (w + 1040) / n
        xt = vx - 40 + i * 80 / n
        b.append(f'<line x1="{xt:.1f}" y1="{hy}" x2="{xb:.1f}" y2="{h}" stroke="{C["lane"]}" stroke-width="{3 + 4*abs(i-n/2)/(n/2):.1f}"/>')
    # transverse marks that get closer towards the horizon
    for k in range(1, 9):
        y = hy + (h - hy) * (k / 8) ** 2.2
        b.append(f'<line x1="0" y1="{y:.1f}" x2="{w}" y2="{y:.1f}" stroke="{C["orange"]}" stroke-width="{1 + k*0.6:.1f}" opacity=".55"/>')
    b.append('</g>')
    b.append(f'<line x1="0" y1="{hy}" x2="{w}" y2="{hy}" stroke="{C["dark"]}" stroke-width="4"/>')
    return svg(w, h, ''.join(b))


def stadium(cx, cy, w, h):
    r = h / 2
    x0, x1 = cx - w / 2 + r, cx + w / 2 - r
    return (f'M{x0:.1f},{cy-r:.1f} H{x1:.1f} A{r:.1f},{r:.1f} 0 0 1 {x1:.1f},{cy+r:.1f} '
            f'H{x0:.1f} A{r:.1f},{r:.1f} 0 0 1 {x0:.1f},{cy-r:.1f} Z')


def stadium_len(w, h):
    r = h / 2
    return 2 * (w - h) + 2 * math.pi * r


def art_laps():
    """Track laps from above; one lane traced again and again."""
    w, h = 1080, 640
    b = []
    cx, cy = 700, 360
    for i in range(7):
        ww, hh = 1000 - i * 64, 560 - i * 64
        col = C['lane']
        op = 0.28 if i != 3 else 1
        sw = 4 if i != 3 else 8
        b.append(f'<path d="{stadium(cx, cy, ww, hh)}" fill="none" stroke="{col if i!=3 else C["strong"]}" stroke-width="{sw}" opacity="{op}"/>')
    # lap ticks on lane 3
    ww, hh = 1000 - 3 * 64, 560 - 3 * 64
    b.append(f'<circle cx="{cx-120}" cy="{cy-hh/2}" r="18" fill="{C["accent"]}"/>')
    b.append(f'<circle cx="{cx-120}" cy="{cy-hh/2}" r="34" fill="none" stroke="{C["accent"]}" stroke-width="3" opacity=".5"/>')
    # lap counters
    for k in range(6):
        x = 120 + k * 52
        b.append(f'<rect x="{x}" y="590" width="34" height="8" rx="4" fill="{C["strong"] if k < 5 else C["lane"]}" opacity="{1 if k<5 else .35}"/>')
    return svg(w, h, ''.join(b))


def art_route():
    """A road route with pins, over faint map contours."""
    w, h = 1080, 640
    b = []
    for i in range(6):
        b.append(f'<path d="M-40,{120+i*90} C 240,{40+i*90} 520,{220+i*90} 1120,{90+i*90}" fill="none" stroke="{C["lane"]}" stroke-width="3" opacity=".55"/>')
    road = 'M-60,560 C 160,560 220,420 380,410 S 600,520 720,430 S 860,200 1140,180'
    b.append(f'<path d="{road}" fill="none" stroke="{C["dark"]}" stroke-width="74" stroke-linecap="round" opacity=".92"/>')
    b.append(f'<path d="{road}" fill="none" stroke="{C["accent"]}" stroke-width="6" stroke-dasharray="26 22" stroke-linecap="round"/>')
    # pins
    b.append(f'<circle cx="380" cy="410" r="26" fill="{C["surface"]}" stroke="{C["dark"]}" stroke-width="8"/>')
    b.append(f'<g transform="translate(860,250)"><path d="M0,-96 C-40,-96 -62,-68 -62,-38 C-62,6 0,52 0,52 C0,52 62,6 62,-38 C62,-68 40,-96 0,-96 Z" fill="{C["surface"]}"/>'
             f'<circle cx="0" cy="-40" r="22" fill="{C["orange"]}"/></g>')
    return svg(w, h, ''.join(b))


def blob(cx, cy, r, k, seed):
    pts = []
    for i in range(0, 361, 6):
        a = math.radians(i)
        rr = r * (1 + 0.10 * math.sin(3 * a + seed) + 0.06 * math.sin(5 * a + seed * 2) + 0.04 * math.cos(2 * a + seed * 3)) * k
        pts.append((cx + rr * math.cos(a) * 1.35, cy + rr * math.sin(a)))
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z'


def art_contours():
    """Elevation contours of a gentle hill and its profile."""
    w, h = 1080, 660
    b = []
    for i in range(9):
        k = 1 - i * 0.105
        b.append(f'<path d="{blob(720, 300, 300, k, 0.7 + i*0.12)}" fill="none" stroke="{C["lane"]}" stroke-width="{3 if i%3 else 5}" opacity="{0.25 + i*0.07:.2f}"/>')
    b.append(f'<circle cx="725" cy="300" r="12" fill="{C["accent"]}"/>')
    # elevation profile: gentle, flat-ish rolling line
    pts = []
    for x in range(0, w + 1, 10):
        y = 600 - 34 * math.sin(x / 170) - 18 * math.sin(x / 63 + 1)
        pts.append(f'{x},{y:.1f}')
    b.append(f'<polygon points="0,{h} {" ".join(pts)} {w},{h}" fill="{C["orange"]}"/>')
    b.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{C["strong"]}" stroke-width="5"/>')
    return svg(w, h, ''.join(b))


def foot_print(x, y, rot, left, col, op=1):
    sx = -1 if left else 1
    tread = ''.join(f'<line x1="-40" y1="{t}" x2="40" y2="{t}" stroke="{C["orange"]}" stroke-width="5"/>' for t in (-62, -44, -26, 44, 62))
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({sx},1)" opacity="{op}">'
            f'<clipPath id="cp{x}"><path d="M2,-82 C30,-82 40,-56 38,-28 C36,-6 26,4 22,16 C20,28 26,40 24,60 C22,80 10,86 -2,86 C-16,86 -26,78 -26,58 C-26,36 -22,20 -24,4 C-27,-16 -36,-34 -34,-52 C-32,-72 -18,-82 2,-82 Z"/></clipPath>'
            f'<g clip-path="url(#cp{x})"><rect x="-50" y="-90" width="100" height="180" fill="{col}"/>{tread}</g></g>')


def art_prints():
    """Shoe-print rhythm with a deliberate pause."""
    w, h = 1080, 560
    b = []
    b.append(f'<line x1="0" y1="300" x2="{w}" y2="300" stroke="{C["lane"]}" stroke-width="3" stroke-dasharray="4 14"/>')
    xs = [20, 160, 300, 440] + [720, 860, 1000, 1140]
    for i, x in enumerate(xs):
        left = i % 2 == 0
        y = 300 + (-58 if left else 58)
        b.append(foot_print(x, y, 90, left, C['dark'], 0.9))
    # pause marker
    b.append(f'<rect x="574" y="210" width="12" height="180" rx="6" fill="{C["accent"]}"/>')
    b.append(f'<text x="580" y="446" text-anchor="middle" font-family="DM Mono" font-size="26" fill="{C["dark"]}">rest</text>')
    return svg(w, h, ''.join(b))


def art_countdown():
    """Four laps; the last one nearly closed."""
    w, h = 1080, 640
    b = []
    cx, cy = 540, 340
    for i in range(4):
        ww, hh = 940 - i * 90, 520 - i * 90
        L = stadium_len(ww, hh)
        if i < 3:
            b.append(f'<path d="{stadium(cx, cy, ww, hh)}" fill="none" stroke="{C["strong"]}" stroke-width="10" opacity="{0.45 + i*0.2:.2f}"/>')
        else:
            b.append(f'<path d="{stadium(cx, cy, ww, hh)}" fill="none" stroke="{C["lane"]}" stroke-width="10" opacity=".18"/>')
            b.append(f'<path d="{stadium(cx, cy, ww, hh)}" fill="none" stroke="{C["accent"]}" stroke-width="10" stroke-linecap="round" stroke-dasharray="{L*0.86:.1f} {L:.1f}"/>')
    # start/finish line
    b.append(f'<rect x="{cx-60}" y="{cy-260-14}" width="8" height="300" fill="{C["surface"]}" opacity=".0"/>')
    b.append(f'<text x="{cx}" y="{cy+34}" text-anchor="middle" font-family="DM Mono" font-weight="500" font-size="104" fill="{C["surface"]}" letter-spacing="-2">4/4</text>')
    b.append(f'<text x="{cx}" y="{cy+84}" text-anchor="middle" font-family="DM Mono" font-size="26" fill="{C["surface"]}" opacity=".7">lap</text>')
    return svg(w, h, ''.join(b))


def art_finish():
    """Finish line across track lanes in perspective."""
    w, h, ty = 1080, 600, 40
    b = []
    vx = 540
    b.append(f'<polygon points="{vx-170},{ty} {vx+170},{ty} {w+260},{h} {-260},{h}" fill="{C["orange"]}"/>')
    n = 6
    for i in range(n + 1):
        xt = vx - 170 + i * 340 / n
        xb = -260 + i * (w + 520) / n
        b.append(f'<line x1="{xt:.1f}" y1="{ty}" x2="{xb:.1f}" y2="{h}" stroke="{C["surface"]}" stroke-width="{4 + 3*abs(i-n/2)/(n/2):.1f}" opacity=".9"/>')
    # checkered finish band at y 300..360 (perspective-correct x per row)
    def xat(xt, xb, y):
        return xt + (xb - xt) * (y - ty) / (h - ty)
    rows = [(300, 330), (330, 362)]
    cols = 24
    for ri, (y0, y1) in enumerate(rows):
        for ci in range(cols):
            fill = C['ink'] if (ci + ri) % 2 == 0 else C['surface']
            ax0 = xat(vx - 170 + ci * 340 / cols, -260 + ci * (w + 520) / cols, y0)
            ax1 = xat(vx - 170 + (ci + 1) * 340 / cols, -260 + (ci + 1) * (w + 520) / cols, y0)
            bx0 = xat(vx - 170 + ci * 340 / cols, -260 + ci * (w + 520) / cols, y1)
            bx1 = xat(vx - 170 + (ci + 1) * 340 / cols, -260 + (ci + 1) * (w + 520) / cols, y1)
            b.append(f'<polygon points="{ax0:.1f},{y0} {ax1:.1f},{y0} {bx1:.1f},{y1} {bx0:.1f},{y1}" fill="{fill}"/>')
    # distance marker
    b.append(f'<text x="{vx}" y="{h-60}" text-anchor="middle" font-family="DM Mono" font-weight="500" font-size="64" fill="{C["dark"]}">5.0 km</text>')
    return svg(w, h, ''.join(b))


def art_arcs_corner(op=0.5):
    """Lane arcs in the lower right corner (echoes the app icon), for light feature posts."""
    w, h = 1080, 1350
    b = []
    for i, r in enumerate([700, 615, 530, 445, 360]):
        b.append(f'<circle cx="1220" cy="1480" r="{r}" fill="none" stroke="{C["lane"]}" stroke-width="5" opacity="{op}"/>')
    return f'<svg style="position:absolute;left:0;top:0" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{"".join(b)}</svg>'


# ---------------------------------------------------------------- post builders
JOBS = []


def job(html, out, w, h):
    JOBS.append(dict(html=html, out=out, w=w, h=h))


def statement_post(name, theme, eyebrow, title, body, art, kicker='', footr='', title_size=96, body_top=None):
    css = f'.copy{{position:absolute;left:80px;right:80px;top:210px}} h1{{font-size:{title_size}px}} p.body{{margin-top:34px}}'
    inner = (art + top(theme, kicker) + f'<div class="copy z"><div class="eyebrow"><i></i>{eyebrow}</div><h1>{title}</h1>'
             + (f'<p class="body">{body}</p>' if body else '') + '</div>' + foot(right=footr))
    job(page(name, 1080, 1350, theme, inner, css), f'{OUT}/posts/{name}.png', 1080, 1350)


def phone(img, ratio_h):
    sw = 456
    sh = round(sw * ratio_h)
    return (f'<div class="phone" style="width:{sw+28}px;height:{sh+28}px"><img src="file://{S}/crops/{img}.png" style="width:{sw}px;height:{sh}px"></div>')


FEATURE_CSS = """
.phone{position:absolute;right:80px;bottom:70px;background:#171412;border-radius:62px;padding:14px;box-shadow:0 30px 60px rgba(23,20,18,.18),0 6px 14px rgba(23,20,18,.10);z-index:3}
.phone img{display:block;border-radius:48px;object-fit:cover;object-position:top}
.copy{position:absolute;left:80px;right:80px;top:200px;z-index:4}
h1{font-size:80px;line-height:1.02}
.pts{position:absolute;left:80px;width:396px;bottom:150px;z-index:4;list-style:none}
.pts li{border-top:2px solid rgba(23,20,18,.14);padding:22px 0 30px;font-size:31px;line-height:1.3;color:#171412}
.pts li .num{display:block;font-size:22px;color:#E8480C;margin-bottom:8px;font-weight:500}
"""


def feature_post(name, eyebrow, title, points, img, ratio, kicker='', footr=''):
    pts = ''.join(f'<li><span class="num">{i+1:02d}</span>{p}</li>' for i, p in enumerate(points))
    inner = (art_arcs_corner(0.42) + top('light', kicker) + f'<div class="copy"><div class="eyebrow"><i></i>{eyebrow}</div><h1>{title}</h1></div>'
             + f'<ul class="pts">{pts}</ul>' + phone(img, ratio) + foot(right=''))
    job(page(name, 1080, 1350, 'light', inner, FEATURE_CSS), f'{OUT}/posts/{name}.png', 1080, 1350)


R = 1992 / 1170
RT = 1832 / 1170

POSTS = [
    ('01-2026-11-07-meet-ritmo', 'statement', dict(theme='orange', eyebrow='Coming soon', title='Train to your own rhythm.',
        body='Meet Ritmo, a running coach app that plans each session around you, tells you why, and adapts as you go.',
        art=art_sunrise(), kicker='01', footr='Ritmo Running')),
    ('02-2026-11-12-session-with-a-why', 'feature', dict(eyebrow='Feature glimpse · Today', title='Every session comes<br>with a why.',
        points=['The run for today, sized to you.', 'Target pace and effort, step by step.', 'The reason it sits in your plan.'], img='today', ratio=RT, kicker='02')),
    ('03-2026-11-17-consistency', 'statement', dict(theme='graphite', eyebrow="Coach's note · Consistency", title='The run you repeat matters more than the run you remember.',
        body='Fitness is built by ordinary weeks stacked on top of each other. Keep the next one ordinary too.', art=art_laps(), kicker='03', title_size=86, footr='Training tips')),
    ('04-2026-11-22-guided-setup', 'carousel', [
        dict(eyebrow='Feature glimpse · Setup', title='A plan that starts<br>from you.',
             points=['A short guided setup.', 'Your goal, your days, your time.', 'A safer first step when a goal is big for now.'], img='goal', ratio=R, kicker='04 · 1/2'),
        dict(eyebrow='Feature glimpse · Plan preview', title='See your first weeks<br>before you start.',
             points=['Every session dated and timed.', 'Set by effort until Ritmo knows your pace.', 'Adjusts as you train.'], img='preview', ratio=R, kicker='04 · 2/2')]),
    ('05-2026-11-27-join-the-waitlist', 'statement', dict(theme='orange', eyebrow='Coming soon · Waitlist', title='Be first to run with Ritmo.',
        body='Join the waitlist through the link in our bio. We will let you know the moment it opens.', art=art_route(), kicker='05', footr='Link in bio')),
    ('06-2026-12-02-run-feedback', 'carousel', [
        dict(eyebrow='Feature glimpse · Feedback', title='Clear feedback<br>after every run.',
             points=['A session score with a plain reason.', 'Planned compared with actual.', 'What it means for the coming days.'], img='fb1', ratio=R, kicker='06 · 1/2'),
        dict(eyebrow='Feature glimpse · Feedback', title='What went well.<br>What to change.',
             points=['Specific, from your own run.', 'One clear thing to adjust.', 'Nothing to change when nothing needs to.'], img='fb2', ratio=R, kicker='06 · 2/2')]),
    ('07-2026-12-07-easy-days', 'statement', dict(theme='graphite', eyebrow="Coach's note · Easy days", title='Easy days are where the engine is built.',
        body='Slow enough to talk in full sentences. It feels too easy, and that is the point.', art=art_contours(), kicker='07', footr='Training tips')),
    ('08-2026-12-12-beginner-run-walk', 'carousel', [
        dict(eyebrow='Feature glimpse · Beginners', title='New to running?<br>Start here.',
             points=['Tell Ritmo where you are starting from.', 'No pace targets on day one.', 'Three days a week, rest days between.'], img='beg1', ratio=R, kicker='08 · 1/2'),
        dict(eyebrow='Feature glimpse · Run/walk', title='Run, walk, repeat.<br>Then run a little more.',
             points=['Short running spells with walking breaks.', 'Building towards 30 minutes of running.', 'Set by effort, not pace.'], img='beg2', ratio=R, kicker='08 · 2/2')]),
    ('09-2026-12-17-rest-days', 'statement', dict(theme='orange', eyebrow="Coach's note · Rest", title='Rest is part of the plan, not a break from it.',
        body='The work happens on the run. The adaptation happens in between. Protect both.', art=art_prints(), kicker='09', footr='Training tips')),
    ('10-2026-12-22-privacy', 'carousel', [
        dict(eyebrow='Feature glimpse · Privacy', title='Your data<br>stays yours.',
             points=['Export everything in one file.', 'Delete your account and all your data with it.', 'Health data is never sold.'], img='priv1', ratio=R, kicker='10 · 1/2'),
        dict(eyebrow='Feature glimpse · Privacy', title='Clear about what<br>we use, and why.',
             points=['Explained in plain words at setup.', 'Garmin data is never used to train AI.', 'Garmin sync is coming, pending Garmin approval.'], img='priv2', ratio=R, kicker='10 · 2/2')]),
    ('11-2026-12-27-final-laps', 'statement', dict(theme='graphite', eyebrow='Coming soon', title='Final laps.',
        body='The plans are set and the feedback is tuned. Ritmo is nearly ready. Follow along for the opening.', art=art_countdown(), kicker='11', footr='Ritmo Running', title_size=120)),
    ('12-2027-01-01-first-5k', 'statement', dict(theme='light', eyebrow="Coach's note · First 5K", title='Your first 5K is a finish, not a time.',
        body='Start slower than feels necessary. Finish knowing you had a little more to give.', art=art_finish(), kicker='12', footr='Training tips')),
]

for name, kind, spec in POSTS:
    if kind == 'statement':
        statement_post(name, **spec)
    elif kind == 'feature':
        feature_post(name, **spec)
    else:
        for i, s in enumerate(spec):
            feature_post(f'{name}-{i+1}', **s)

# ---------------------------------------------------------------- profile photo
inner = f'<img src="file://{BRAND}/ritmo-app-icon-1024.png" style="position:absolute;left:180px;top:180px;width:720px;height:720px">'
job(page('profile-photo', 1080, 1080, 'graphite', inner), f'{OUT}/profile-photo.png', 1080, 1080)

# ---------------------------------------------------------------- highlight covers
HL = [('coming-soon', 'Coming soon', C['graphite'], C['surface']),
      ('features', 'Features', C['surface'], C['ink']),
      ('training-tips', 'Training tips', C['accent'], C['dark']),
      ('privacy', 'Privacy', C['lane'], C['dark'])]
for slug, label, bg, fg in HL:
    rings = ''.join(f'<circle cx="540" cy="960" r="{r}" fill="none" stroke="{C["orange"] if bg != C["graphite"] else C["lane"]}" stroke-width="4" opacity=".35"/>' for r in (330, 390))
    inner = (f'<svg style="position:absolute;left:0;top:0" width="1080" height="1920">{rings}</svg>'
             f'<img src="file://{BRAND}/ritmo-app-icon-1024.png" style="position:absolute;left:350px;top:770px;width:380px;height:380px">'
             f'<div style="position:absolute;left:0;right:0;top:1480px;text-align:center;font-family:\'Bricolage Grotesque\';font-weight:700;font-size:64px;color:{fg}">{label}</div>'
             f'<div style="position:absolute;left:0;right:0;top:1570px;text-align:center;font-family:\'DM Mono\';font-size:28px;color:{fg};opacity:.7">@ritmorunning.run</div>')
    css = f'body{{background:{bg}}}'
    job(page('hl-' + slug, 1080, 1920, 'light', inner, css), f'{OUT}/highlights/{slug}.png', 1080, 1920)

json.dump(JOBS, open(os.path.join(S, 'jobs.json'), 'w'), indent=1)
print(len(JOBS), 'jobs')

# ---------------------------------------------------------------- standalone SVG illustrations
IL = os.path.join(OUT, 'illustrations')
os.makedirs(IL, exist_ok=True)
for fname, fn, bg in [('sunrise-over-track', art_sunrise, C['orange']), ('laps', art_laps, C['graphite']), ('route-lines', art_route, C['orange']),
                      ('elevation-contours', art_contours, C['graphite']), ('shoe-print-rhythm', art_prints, C['orange']),
                      ('final-laps', art_countdown, C['graphite']), ('finish-line', art_finish, C['surface'])]:
    s = fn().replace(' class="art"', '')
    i = s.index('>') + 1
    s = s[:i] + f'<rect width="100%" height="100%" fill="{bg}"/>' + s[i:]
    open(os.path.join(IL, fname + '.svg'), 'w').write(s)
