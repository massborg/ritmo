#!/usr/bin/env python3
"""100 ready-to-post Ritmo Instagram cards (1080x1350) in the same design system as the first 12 posts.
Reuses the helpers and illustrations in gen.py, adds five templates and four illustrations.
Writes HTML to the scratchpad, jobs100.json for render100.cjs, and cards/captions.md + cards/calendar.md."""
import datetime as dt, json, math, os, re

S = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(S, 'gen.py')).read()
exec(src[:src.index('# ---------------------------------------------------------------- post builders')])

OUT = '/home/user/ritmo/marketing/instagram/cards'
H = '/tmp/claude-0/-home-user-ritmo/63603377-04aa-55d6-a01b-b01a6588d571/scratchpad/instagram/html100'
os.makedirs(H, exist_ok=True)
os.makedirs(OUT + '/png', exist_ok=True)
JOBS = []


def page(name, theme, inner, extra_css='', dot=None):
    t = THEMES[theme]
    css = BASE_CSS % dict(w=1080, h=1350, bg=t['bg'], fg=t['fg'], soft=t['soft'], dot=dot or (C['dark'] if theme == 'orange' else C['orange']))
    html = f'<!doctype html><html lang="en"><head><meta charset="utf-8">{FONTS}<style>{css}{extra_css}</style></head><body>{inner}</body></html>'
    p = os.path.join(H, name + '.html')
    open(p, 'w').write(html)
    JOBS.append(dict(html=p, out=f'{OUT}/png/{name}.png', w=1080, h=1350))


# ---------------------------------------------------------------- new illustrations

def art_intervals():
    """Effort bars: hard reps with easy gaps, and the session's effort line."""
    w, h, base = 1080, 600, 560
    b = []
    xs = list(range(60, 1040, 70))
    pts = []
    for i, x in enumerate(xs):
        hard = i % 2 == 1 and 2 <= i <= 12
        bh = 330 if hard else (110 if 1 < i < 13 else 70)
        b.append(f'<rect x="{x}" y="{base-bh}" width="52" height="{bh}" rx="10" fill="{C["strong"] if hard else C["lane"]}" opacity="{1 if hard else .45}"/>')
        pts.append(f'{x+26},{base-bh-34}')
    b.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{C["accent"]}" stroke-width="5" stroke-linejoin="round" stroke-dasharray="2 12" stroke-linecap="round"/>')
    b.append(f'<line x1="0" y1="{base+4}" x2="{w}" y2="{base+4}" stroke="{C["lane"]}" stroke-width="4" opacity=".6"/>')
    return svg(w, h, ''.join(b))


def art_heartline():
    """Five effort bands and a calm heart-rate line that stays low."""
    w, h = 1080, 600
    b = []
    for i in range(5):
        y = 120 + i * 90
        b.append(f'<rect x="0" y="{y}" width="{w}" height="86" fill="{C["lane"]}" opacity="{0.08 + (4-i)*0.07:.2f}"/>')
        b.append(f'<text x="1040" y="{y+54}" text-anchor="end" font-family="DM Mono" font-size="24" fill="{C["lane"]}" opacity=".9">Z{5-i}</text>')
    pts = []
    for x in range(0, w - 90, 6):
        y = 470 - 18 * math.sin(x / 47) - 9 * math.sin(x / 13)
        if 380 < x < 430:
            y -= 120 * math.sin((x - 380) / 50 * math.pi)
        pts.append(f'{x},{y:.1f}')
    b.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{C["accent"]}" stroke-width="7" stroke-linejoin="round"/>')
    return svg(w, h, ''.join(b))


def art_stopwatch():
    """A stopwatch face with a partly filled lap ring."""
    w, h, cx, cy, r = 1080, 620, 540, 330, 230
    b = [f'<rect x="{cx-34}" y="{cy-r-70}" width="68" height="40" rx="10" fill="{C["lane"]}"/>',
         f'<circle cx="{cx}" cy="{cy}" r="{r+24}" fill="none" stroke="{C["lane"]}" stroke-width="6" opacity=".45"/>']
    L = 2 * math.pi * r
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{C["strong"]}" stroke-width="22" opacity=".25"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{C["accent"]}" stroke-width="22" stroke-linecap="round" '
             f'stroke-dasharray="{L*0.62:.1f} {L:.1f}" transform="rotate(-90 {cx} {cy})"/>')
    for k in range(60):
        a = math.radians(k * 6)
        r1 = r - 44 if k % 5 == 0 else r - 34
        b.append(f'<line x1="{cx+math.sin(a)*r1:.1f}" y1="{cy-math.cos(a)*r1:.1f}" x2="{cx+math.sin(a)*(r-22):.1f}" y2="{cy-math.cos(a)*(r-22):.1f}" '
                 f'stroke="{C["lane"]}" stroke-width="{5 if k%5==0 else 2}" opacity=".8"/>')
    a = math.radians(223)
    b.append(f'<line x1="{cx}" y1="{cy}" x2="{cx+math.sin(a)*(r-60):.1f}" y2="{cy-math.cos(a)*(r-60):.1f}" stroke="{C["accent"]}" stroke-width="10" stroke-linecap="round"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="18" fill="{C["accent"]}"/>')
    return svg(w, h, ''.join(b))


def art_waves():
    """Stride rhythm as overlapping waves; one wave in focus."""
    w, h = 1080, 560
    b = []
    for i in range(7):
        pts = ' '.join(f'{x},{300 + (70 - i*6) * math.sin(x/120 + i*0.55) + i*14:.1f}' for x in range(0, w + 1, 8))
        focus = i == 3
        b.append(f'<polyline points="{pts}" fill="none" stroke="{C["accent"] if focus else C["lane"]}" stroke-width="{8 if focus else 3}" opacity="{1 if focus else .45}"/>')
    return svg(w, h, ''.join(b))


ARTS = dict(sunrise=art_sunrise, laps=art_laps, route=art_route, contours=art_contours, prints=art_prints, countdown=art_countdown,
            finish=art_finish, intervals=art_intervals, heart=art_heartline, stopwatch=art_stopwatch, waves=art_waves)
ART_ALT = dict(sunrise='a yellow sun rising over running track lanes', laps='running track lanes seen from above, one lane highlighted',
               route='a road route with map pins over faint contour lines', contours='elevation contour lines above a gentle rolling profile',
               prints='a line of shoe prints with a short pause marked "rest"', countdown='four nested track laps, the last nearly closed, labelled 4/4 lap',
               finish='a chequered finish line across track lanes, marked 5.0 km', intervals='bars of hard and easy efforts with a dotted effort line',
               heart='five heart-rate zone bands with a calm line staying low', stopwatch='a stopwatch face with a partly filled ring',
               waves='overlapping waves, one highlighted in yellow')


def corner(theme):
    return art_arcs_corner(0.42 if theme == 'light' else 0.3)


def esc(s):
    return s.replace('&', '&amp;')


# ---------------------------------------------------------------- templates

def t_statement(n, c, theme):
    size = c.get('size', 92)
    css = f'.copy{{position:absolute;left:80px;right:80px;top:210px}} h1{{font-size:{size}px}} p.body{{margin-top:34px}}'
    inner = (ARTS[c['art']]() + top(theme, f'{n:03d}') + f'<div class="copy z"><div class="eyebrow"><i></i>{c["eyebrow"]}</div><h1>{c["title"]}</h1>'
             + (f'<p class="body">{c["body"]}</p>' if c.get('body') else '') + '</div>' + foot(right=c['foot']))
    return inner, css


LIST_CSS = """
.copy{position:absolute;left:80px;right:80px;top:210px;z-index:4}
h1{font-size:100px;line-height:1.0;max-width:900px}
.pts{position:absolute;left:80px;right:80px;bottom:150px;z-index:4;list-style:none}
.pts li{border-top:2px solid %(rule)s;padding:30px 0 40px;font-size:46px;line-height:1.24;display:flex;gap:30px;align-items:baseline;max-width:860px}
.pts li .num{flex:none;font-size:26px;color:%(acc)s;font-weight:500;width:48px}
"""


def t_list(n, c, theme):
    t = THEMES[theme]
    css = LIST_CSS % dict(rule=t['rule'], acc=C['dark'] if theme == 'orange' else C['orange'])
    pts = ''.join(f'<li><span class="num">{i+1:02d}</span><span>{p}</span></li>' for i, p in enumerate(c['points']))
    inner = (corner(theme) + top(theme, f'{n:03d}') + f'<div class="copy"><div class="eyebrow"><i></i>{c["eyebrow"]}</div><h1>{c["title"]}</h1></div>'
             + f'<ul class="pts">{pts}</ul>' + foot(right=c['foot']))
    return inner, css


def t_myth(n, c, theme):
    t = THEMES[theme]
    css = f"""
.copy{{position:absolute;left:80px;right:80px;top:210px;z-index:4}}
.lab{{font-family:'DM Mono',monospace;font-size:26px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:22px;display:inline-block;padding:8px 18px;border-radius:999px}}
.myth .lab{{border:2px solid {t['rule']};color:{t['soft']}}}
.fact .lab{{background:{C['dark'] if theme == 'orange' else C['orange']};color:{C['surface'] if theme != 'orange' else C['orange']}}}
.myth h2{{font-family:'Bricolage Grotesque';font-weight:600;font-size:60px;line-height:1.08;letter-spacing:-.02em;color:{t['soft']};text-decoration:line-through;text-decoration-thickness:4px;text-decoration-color:{C['dark'] if theme == 'orange' else C['orange']};text-wrap:balance}}
.fact{{margin-top:70px;padding-top:60px;border-top:2px solid {t['rule']}}}
.fact h1{{font-size:84px;line-height:1.02}}
.fact p.body{{margin-top:30px}}
"""
    inner = (corner(theme) + top(theme, f'{n:03d}') + f'<div class="copy"><div class="eyebrow"><i></i>Myth vs fact</div>'
             f'<div class="myth"><span class="lab">Myth</span><h2>{c["myth"]}</h2></div>'
             f'<div class="fact"><span class="lab">Fact</span><h1>{c["fact"]}</h1>' + (f'<p class="body">{c["body"]}</p>' if c.get('body') else '')
             + '</div></div>' + foot(right='Myth vs fact'))
    return inner, css


def t_glossary(n, c, theme):
    t = THEMES[theme]
    size = 150 if len(c['term']) <= 10 else 118
    css = f"""
.copy{{position:absolute;left:80px;right:80px;top:210px;z-index:4}}
.term{{font-family:'Bricolage Grotesque';font-weight:800;font-size:{size}px;line-height:.95;letter-spacing:-.035em;color:{t['fg']}}}
.kind{{font-family:'DM Mono',monospace;font-size:28px;color:{C['orange'] if theme == 'light' else C['accent']};margin:30px 0 56px}}
.def{{font-family:'Bricolage Grotesque';font-weight:600;font-size:58px;line-height:1.12;letter-spacing:-.015em;color:{t['fg']};text-wrap:pretty}}
.feel{{position:absolute;left:80px;right:80px;bottom:150px;border-top:2px solid {t['rule']};padding-top:34px;z-index:4}}
.feel .num{{display:block;font-size:24px;color:{t['soft']};margin-bottom:12px}}
.feel p{{font-size:40px;line-height:1.3;color:{t['fg']}}}
"""
    inner = (corner(theme) + top(theme, f'{n:03d}') + f'<div class="copy"><div class="eyebrow"><i></i>Running words</div>'
             f'<div class="term">{c["term"]}</div><div class="kind">{c["kind"]}</div><div class="def">{c["def"]}</div></div>'
             f'<div class="feel"><span class="num">How it feels</span><p>{c["feel"]}</p></div>' + foot(right='Glossary'))
    return inner, css


def t_number(n, c, theme):
    size = c.get('size', 300)
    css = f"""
.copy{{position:absolute;left:80px;right:80px;top:210px;z-index:4}}
.big{{font-family:'DM Mono',monospace;font-weight:500;font-size:{size}px;line-height:1;letter-spacing:-.05em;color:{C['accent'] if theme == 'graphite' else C['dark']};margin:10px 0 50px -8px;white-space:nowrap}}
h1{{font-size:80px;line-height:1.03}} p.body{{margin-top:34px}}
"""
    inner = (corner(theme) + top(theme, f'{n:03d}') + f'<div class="copy"><div class="eyebrow"><i></i>{c["eyebrow"]}</div><div class="big">{c["big"]}</div>'
             f'<h1>{c["title"]}</h1>' + (f'<p class="body">{c["body"]}</p>' if c.get('body') else '') + '</div>' + foot(right='By the numbers'))
    return inner, css


def t_question(n, c, theme):
    css = """.copy{position:absolute;left:80px;right:80px;top:210px;z-index:4} h1{font-size:112px;line-height:.98} p.body{margin-top:40px}"""
    inner = (art_waves() + top(theme, f'{n:03d}') + f'<div class="copy"><div class="eyebrow"><i></i>Over to you</div><h1>{c["title"]}</h1>'
             f'<p class="body">{c["body"]}</p></div>' + foot(right='Tell us below'))
    return inner, css


TEMPLATES = dict(statement=t_statement, list=t_list, myth=t_myth, glossary=t_glossary, number=t_number, question=t_question)

# ---------------------------------------------------------------- content
# Rules: no emoji, no launch date, prices, user numbers, testimonials or named people. Garmin only as pending approval.

COACH = [  # statement cards: eyebrow, title, body, art
    ('Start slow', 'Start slower than you think.', 'The first kilometre is a warm-up, not a statement. Let the pace come to you.', 'sunrise'),
    ('Progress', 'Progress is quiet.', 'Most weeks feel ordinary. Look back after a month and the change is obvious.', 'laps'),
    ('Hills', 'Hills are speed work in disguise.', 'Short, steady efforts uphill build strength without the pounding of the track.', 'contours'),
    ('Sleep', 'Sleep is training too.', 'Your body adapts while you rest. A late night can cost more than a missed run.', 'prints'),
    ('Focus', 'Run the kilometre you are in.', 'Not the one behind you, not the one ahead. This one.', 'route'),
    ('Consistency', 'Steady beats heroic.', 'Three ordinary runs a week, every week, will take you further than one big effort.', 'laps'),
    ('Warm-up', 'Warm up like you mean it.', 'Ten easy minutes and a few strides make the hard part feel easier.', 'intervals'),
    ('Easy pace', 'Slow down to speed up.', 'Most of your running should feel easy. It builds the base that makes fast days possible.', 'heart'),
    ('Missed runs', 'A missed run is not a lost week.', 'Let it go and pick up the plan where it is. Do not cram it in later.', 'prints'),
    ('Heat', 'Heat changes the pace, not the effort.', 'On hot days run by feel. Slower is right when the air is heavy.', 'sunrise'),
    ('Wind', 'Wind is a hill you cannot see.', 'Run into it by effort, and enjoy the push on the way home.', 'waves'),
    ('Long runs', 'Long runs are about time on your feet.', 'Go slow enough to finish feeling you could keep going.', 'route'),
    ('First steps', 'Every finish line starts at your front door.', 'The hardest step of most runs is the first one outside. The rest follows.', 'finish'),
    ('Easy pace', 'Your easy pace is allowed to be slow.', 'Easy is a feeling, not a number. Nobody else needs to know your pace.', 'heart'),
    ('Strides', 'Short, quick, relaxed.', 'A few 20-second strides after an easy run keep your legs sharp without tiring them.', 'intervals'),
    ('Cool-down', 'Cool down before you stop.', 'A few easy minutes help you finish the run and start the recovery.', 'waves'),
    ('Race day', 'Race day is the celebration.', 'The test was the training. Race day is where you collect.', 'finish'),
    ('Form', 'Run tall.', 'Hips forward, shoulders loose, eyes ahead. Small changes, every step.', 'prints'),
    ('Recovery weeks', 'Lighter weeks are part of progress.', 'Every few weeks, ease back. You come out of it stronger.', 'laps'),
    ('Patience', 'Be patient with your pace.', 'Speed follows months of steady running, not days.', 'stopwatch'),
    ('Small aches', 'Listen to small aches early.', 'A niggle ignored can become an injury. Ease off, and see a professional if it stays.', 'heart'),
    ('Purpose', 'Every run has a job.', 'Easy, long, steady or quick. Know which one today is, and run it that way.', 'intervals'),
]

TIPS = [  # list cards: title, points
    ('Three signs your easy run is easy enough.', ['You can talk in full sentences.', 'You could keep going for much longer.', 'You finish feeling better than you started.']),
    ('Before your first 5K.', ['Run part of the course, or one like it.', 'No new shoes or kit on race day.', 'Start near the back and ease in.']),
    ('Running in the heat.', ['Go early in the morning or later in the evening.', 'Carry water on longer runs.', 'Let the pace drop and keep the effort.']),
    ('A simple warm-up.', ['Five to ten minutes of easy jogging.', 'A few leg swings and light drills.', 'Four short strides, relaxed and quick.']),
    ('Building up safely.', ['Add a little at a time, not all at once.', 'Keep most of your runs easy.', 'Ease back every few weeks.']),
    ('What to eat before a run.', ['Something light that you know agrees with you.', 'Leave time to digest before hard sessions.', 'Practise your fuelling on long runs, not race day.']),
    ('After a hard session.', ['Cool down with a few minutes of easy jogging.', 'Eat and drink within the next few hours.', 'Keep the next day easy.']),
    ('How to run hills.', ['Shorter steps, steady effort.', 'Look up the hill, not at your feet.', 'Run tall over the top and keep going.']),
    ('Choosing running shoes.', ['Comfort first, from the very first try.', 'Try them on later in the day.', 'Rotate two pairs if you run often.']),
    ('Make running a habit.', ['Pick the same days each week.', 'Lay out your kit the night before.', 'Keep the first runs short and easy.']),
    ('Run/walk, the smart way.', ['Walk before you need to.', 'Keep the walks brisk.', 'Shrink the walks as the weeks pass.']),
    ('Signs you need an extra rest day.', ['Easy runs feel unusually hard.', 'Your sleep is off or your mood is low.', 'A niggle is getting worse, not better.']),
    ('Pacing your long run.', ['Start slower than your usual easy pace.', 'Hold back through the first half.', 'Finish with something left.']),
    ('Running in the dark.', ['Wear something bright or reflective.', 'Choose lit routes that you know.', 'Tell someone where you are going.']),
    ('Your race-week checklist.', ['Shorter runs with a few quick strides.', 'Sleep well two nights before.', 'Lay everything out the night before.']),
    ('Cross-training that helps runners.', ['Cycling for easy aerobic work.', 'Swimming for low-impact recovery.', 'Strength work twice a week.']),
    ('Strength moves for runners.', ['Squats and lunges for strong legs.', 'Calf raises for the lower leg.', 'Planks for a steady core.']),
]

FEATURES = [  # list cards with a feature eyebrow: eyebrow, title, points
    ('Your plan', 'A plan built around your week.', ['Starts from your goal, your days and your time.', 'Every session dated and sized to you.', 'Updates as your runs come in.']),
    ('Today', 'Know what today is for.', ['Easy, steady, long or quick.', 'Target effort, step by step.', 'A short reason for every session.']),
    ('Sessions', 'Warm-up, strides, main run, cool-down.', ['Pieces of one run read as one session.', 'Warm-up and cool-down recognised.', 'The main run judged on its own.']),
    ('Cross-training', 'Cross-training counts.', ['Log cycling, swimming and gym sessions.', 'They count towards your training load.', 'Your week shows the whole picture.']),
    ('Calendar', 'Move a session, keep the plan.', ['Drag a session to another day.', 'See the whole week at a glance.', 'Your plan fits your life.']),
    ('Feedback', 'Clear feedback after every run.', ['A session score with a plain reason.', 'Planned compared with actual.', 'One clear thing to adjust.']),
    ('Best efforts', 'Your best efforts, found for you.', ['Fastest 1 km, 5K, 10K and more.', 'Found inside any run, not only races.', 'GPS glitches left out.']),
    ('Heart rate', 'Time in each heart-rate zone.', ['See how much of a run was truly easy.', 'Spot easy days that drifted hard.', 'Works with your heart-rate data.']),
    ('Beginners', 'Starting from zero? Start here.', ['Run/walk sessions to build up gently.', 'No pace targets on day one.', 'Three days a week, rest days between.']),
    ('Privacy', 'Your data stays yours.', ['Export everything in one file.', 'Delete your account and your data with it.', 'Health data is never sold.']),
]

MYTHS = [  # myth, fact, body
    ('Every run should hurt.', 'Most runs should feel easy.', 'That is how endurance is built. Save the hard efforts for a few sessions a week.'),
    ('Long static stretches before a run prevent injury.', 'Easy jogging and drills are the better warm-up.', 'Keep long holds for afterwards, if you like them.'),
    ('Running ruins your knees.', 'How fast you build up matters more.', 'Sudden jumps in training are the bigger risk for most people.'),
    ('You need to run every day to improve.', 'Rest days are where you adapt.', 'Three or four runs a week is plenty for most runners.'),
    ('Running fast all the time makes you faster.', 'Easy running is what makes the fast days work.', 'Build the base first. The speed sessions sit on top of it.'),
    ('Walking breaks are cheating.', 'Run/walk is a smart way to build up.', 'Plenty of runners use it to go further, for longer.'),
    ('You are not a real runner unless you race.', 'If you run, you are a runner.', 'Races are optional. Enjoying it is not.'),
    ('More kilometres is always better.', 'The right amount is what you can recover from.', 'Recovery is where training turns into fitness.'),
    ('One bad run means you are losing fitness.', 'One day is just one day.', 'Sleep, heat, stress and food all show up on the run.'),
    ('Beginners should run as far as they can.', 'Start short and finish fresh.', 'Then come back two days later and do it again.'),
    ('Strength training will slow you down.', 'Two short sessions a week make you sturdier.', 'Strong legs and a steady core hold your form late in a run.'),
    ('Pace targets are only for fast runners.', 'Effort comes first, pace comes later.', 'Ritmo starts beginners on effort, then adds pace once it knows you.'),
]

GLOSSARY = [  # term, kind, definition, feel
    ('Easy run', 'Session type', 'A relaxed run at a pace where you can talk in full sentences.', 'Comfortable and unhurried. You could do it again tomorrow.'),
    ('Tempo run', 'Session type', 'A steady, comfortably hard effort, usually 15 to 30 minutes in the middle of a run.', 'You can say a few words, not whole sentences.'),
    ('Intervals', 'Session type', 'Repeated hard efforts with easy recovery between them.', 'Hard during each rep, easy in the gaps.'),
    ('Strides', 'Drill', 'Short, relaxed accelerations of about 20 seconds, often after an easy run.', 'Quick and smooth, never a sprint.'),
    ('Long run', 'Session type', 'The longest run of your week, run at an easy effort.', 'Steady and patient from start to finish.'),
    ('Cadence', 'Form', 'How many steps you take per minute.', 'Quick, light steps rather than long reaching ones.'),
    ('Recovery run', 'Session type', 'A short, very easy run the day after a harder session.', 'Slower than easy. Gentle on purpose.'),
    ('Taper', 'Race preparation', 'Cutting back training before a race so you arrive fresh.', 'Restless legs. That is a good sign.'),
    ('Negative split', 'Pacing', 'Running the second half of a run or race faster than the first.', 'Controlled early, strong late.'),
    ('Fartlek', 'Session type', 'Swedish for "speed play": unstructured bursts of faster running.', 'Playful. Pick a lamp post and go.'),
    ('Base building', 'Training phase', 'A period of mostly easy running that builds your aerobic engine.', 'Unremarkable runs that add up to remarkable fitness.'),
    ('Heart-rate zones', 'Effort', 'Bands of effort based on heart rate, from very easy to very hard.', 'A check on whether easy really was easy.'),
    ('Training load', 'Planning', 'A measure of how much work your body has done recently.', 'The balance between doing enough and doing too much.'),
    ('Cool-down', 'Session part', 'A few minutes of easy running or walking at the end of a session.', 'Breathing settles and legs loosen.'),
    ('Warm-up', 'Session part', 'Easy running and drills before a harder effort.', 'Starting slow so the fast part feels better.'),
]

NUMBERS = [  # big, eyebrow, title, body, size
    ('80/20', 'The easy rule', 'Mostly easy, a little hard.', 'Around 80 percent of your running easy and 20 percent harder is a balance many coaches use.', 300),
    ('3', 'Runs a week', 'Enough to make real progress.', 'Three steady runs, every week, beat five runs one week and none the next.', 380),
    ('30', 'Minutes', 'A great first goal.', 'Thirty minutes of continuous running. Build to it with run/walk, a little more each week.', 380),
    ('4×20s', 'Strides', 'Four relaxed strides.', 'Twenty seconds each, after an easy run. Quick feet, loose shoulders, full recovery between.', 250),
    ('48h', 'Between hard days', 'Give hard sessions room.', 'Keep a day or two of easy running between hard efforts so each one counts.', 320),
    ('5K', 'The perfect first race', 'Long enough to train for.', 'Short enough to enjoy. And there is always one not far away.', 380),
    ('1', 'Thing to change', 'After every run, one thing.', 'Not ten. Ritmo picks the one adjustment that matters most for your next session.', 380),
    ('10 min', 'Warm-up', 'Of easy jogging first.', 'Before any hard session, ten easy minutes and a few strides get you ready.', 250),
]

QUESTIONS = [  # title, body
    ('Morning runner or evening runner?', 'Tell us when you run best, and why.'),
    ('What got you running?', 'Every runner has a first reason. Share yours in the comments.'),
    ('Coast road or countryside?', 'Where is your favourite place to run? Tell us below.'),
    ('What is your next running goal?', 'A first 5K, a faster 10K, or just running more often. Tell us.'),
    ('Solo runs or running with friends?', 'Quiet time or good company? Tell us how you like it.'),
    ('Music, podcast or silence?', 'What is in your ears on an easy run?'),
    ('What does your perfect long run look like?', 'Route, time of day, and what comes after. Describe it.'),
    ('What is the hardest part of starting?', 'Tell us below. It might be the next thing we write about.'),
]

WAITLIST = [  # title, body, art
    ('The waitlist is open.', 'Sign up at ritmorunning.run and be first to know when Ritmo opens.', 'route'),
    ('A coach that explains itself.', 'Ritmo tells you what to run and why. Join the waitlist through the link in our bio.', 'sunrise'),
    ('Made for everyday runners.', 'Not elites. You, on a Tuesday evening, fitting a run around everything else.', 'laps'),
    ('Your plan is waiting.', 'Tell Ritmo your goal and it builds the weeks ahead. Join the waitlist at ritmorunning.run.', 'stopwatch'),
    ('From first run to first race.', 'Run/walk to 5K and beyond, one sensible week at a time. Link in bio.', 'finish'),
    ('Less guessing, more running.', 'Every session planned, explained and reviewed. Join the waitlist at ritmorunning.run.', 'intervals'),
    ('Almost ready for you.', 'The plans are set and the feedback is tuned. Get on the list at ritmorunning.run.', 'countdown'),
    ('Training that fits your week.', 'Your days, your time, your goal. Be first to try it: link in bio.', 'contours'),
]

# ---------------------------------------------------------------- order and themes
# The grid alternates colour-heavy (orange or graphite) and light cards, as in the first 12 posts.
colour, light = [], []
LIGHT_COACH = {2, 5, 8, 12, 16, 17, 19, 21}  # indexes of coach notes that run on the light theme (no white-only art)
coach_c = [('statement', dict(eyebrow=f"Coach's note · {e}", title=t, body=b, art=a, foot='Training tips', cat='coach'))
           for i, (e, t, b, a) in enumerate(COACH) if i not in LIGHT_COACH]
coach_l = [('statement', dict(eyebrow=f"Coach's note · {e}", title=t, body=b, art=a, foot='Training tips', cat='coach'))
           for i, (e, t, b, a) in enumerate(COACH) if i in LIGHT_COACH]
myths = [('myth', dict(myth=m, fact=f, body=b, cat='myth')) for m, f, b in MYTHS]
nums = [('number', dict(big=g, eyebrow=e, title=t, body=b, size=s, cat='number')) for g, e, t, b, s in NUMBERS]
qs = [('question', dict(title=t, body=b, cat='question')) for t, b in QUESTIONS]
wl = [('statement', dict(eyebrow='Coming soon · Waitlist', title=t, body=b, art=a, foot='ritmorunning.run', cat='waitlist')) for t, b, a in WAITLIST]
tips = [('list', dict(eyebrow='Training tips', title=t, points=p, foot='Save for later', cat='tips')) for t, p in TIPS]
feats = [('list', dict(eyebrow=f'Feature glimpse · {e}', title=t, points=p, foot='Ritmo Running', cat='feature')) for e, t, p in FEATURES]
gl = [('glossary', dict(cat='glossary', term=a, kind=b, **{'def': c}, feel=d)) for a, b, c, d in GLOSSARY]


def interleave(*lists):
    lists = [list(l) for l in lists]
    total = sum(map(len, lists))
    out, k = [], 0
    pos = [0] * len(lists)
    # spread each list evenly over the sequence
    slots = []
    for li, l in enumerate(lists):
        for j in range(len(l)):
            slots.append(((j + 0.5) / len(l), li, j))
    slots.sort()
    return [lists[li][j] for _, li, j in slots]


colour = interleave(wl, coach_c, myths, nums, qs)
light = interleave(tips, gl, feats, coach_l)
assert len(colour) == 50 and len(light) == 50, (len(colour), len(light))

CARDS = []
for i in range(50):
    CARDS.append((colour[i], 'orange' if i % 2 == 0 else 'graphite'))
    CARDS.append((light[i], 'light'))

# ---------------------------------------------------------------- captions, hashtags, alt text
TAGS = {
    'coach': '#running #runningtips #runningcoach #trainingplan #easyrun #runnersofinstagram #runningcommunity #runsmarter #maltarunning',
    'tips': '#running #runningtips #runningcoach #beginnerrunner #trainingplan #runnersofinstagram #runninglife #maltarunning',
    'feature': '#running #runningapp #runningcoach #trainingplan #runningtech #runnersofinstagram #comingsoon #maltarunning',
    'myth': '#running #runningmyths #runningtips #runningcoach #beginnerrunner #runnersofinstagram #runningcommunity #maltarunning',
    'glossary': '#running #runningterms #runningtips #runningcoach #trainingplan #runnersofinstagram #learntorun #maltarunning',
    'number': '#running #runningtips #runningcoach #trainingplan #couchto5k #runnersofinstagram #runningcommunity #maltarunning',
    'question': '#running #runningcommunity #runnersofinstagram #runninglife #runchat #maltarunning',
    'waitlist': '#running #runningapp #runningcoach #trainingplan #comingsoon #waitlist #runnersofinstagram #maltarunning',
}
CTA = {
    'coach': ['Follow for more calm, practical training notes.', 'Save this for your next run.', 'Share it with someone who needs to hear it.'],
    'tips': ['Save this for your next run.', 'Share it with your running friends.', 'Follow for more practical training notes.'],
    'feature': ['Join the waitlist at ritmorunning.run (link in bio).', 'Be first to try it: link in bio.'],
    'myth': ['Heard any other running myths? Tell us below.', 'Follow for more training notes.', 'Share it with someone who still believes it.'],
    'glossary': ['Save it for later. More running words coming soon.', 'Which term should we explain next? Tell us below.'],
    'number': ['Save this for your next week of training.', 'Follow for more practical training notes.'],
    'question': ['We read every comment.'],
    'waitlist': ['Join at ritmorunning.run, or tap the link in our bio.'],
}
THEME_ALT = dict(orange='Orange', graphite='Dark graphite', light='Light cream')


def plain(s):
    return re.sub(r'<[^>]+>', ' ', s).replace('&amp;', '&').replace('  ', ' ').strip()


def caption(k, c, n):
    cat = c['cat']
    if k == 'statement':
        lines = [plain(c['title']), c['body']]
    elif k == 'list':
        lines = [plain(c['title'])] + [f'{i+1}. {p}' for i, p in enumerate(c['points'])]
        lines = [lines[0], '\n'.join(lines[1:])]
    elif k == 'myth':
        lines = [f'Myth: {c["myth"]}', f'Fact: {c["fact"]} {c["body"]}']
    elif k == 'glossary':
        lines = [f'{c["term"]}: {c["def"]}', f'How it feels: {c["feel"]}']
    elif k == 'number':
        lines = [f'{plain(c["big"])}. {c["title"]}', c['body']]
    else:
        lines = [c['title'], c['body']]
    if cat == 'feature':
        lines.insert(1, 'A glimpse of Ritmo, the running coach app we are getting ready to open.')
    opts = CTA[cat]
    lines.append(opts[n % len(opts)])
    return '\n\n'.join(lines)


def alt(k, c, theme):
    base = f'{THEME_ALT[theme]} graphic with the Ritmo Running logo.'
    if k == 'statement':
        return f'{base} Headline: "{plain(c["title"])}" Below it: "{c["body"]}" Illustration: {ART_ALT[c["art"]]}.'
    if k == 'list':
        pts = '; '.join(p.rstrip('.') for p in c['points'])
        return f'{base} Headline: "{plain(c["title"])}" A numbered list: {pts}.'
    if k == 'myth':
        return f'{base} Myth vs fact. Crossed out: "{c["myth"]}" Fact: "{c["fact"]}" {c["body"]}'
    if k == 'glossary':
        return f'{base} Running words. Large term: "{c["term"]}" ({c["kind"].lower()}). Definition: "{c["def"]}" How it feels: "{c["feel"]}"'
    if k == 'number':
        return f'{base} A very large figure, "{plain(c["big"])}", above the headline "{c["title"]}" {c["body"]}'
    return f'{base} Question in large type: "{c["title"]}" Below it: "{c["body"]}" Overlapping wave lines along the bottom.'


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', plain(s).lower()).strip('-')[:40].rstrip('-')


START = dt.date(2027, 1, 4)  # the first 12 posts end on Friday 1 January 2027
EVERY = 7  # one card a week, every Monday
cap_md = ['# Ritmo Running: 100 Instagram cards', '',
          'All cards are 1080 x 1350 (4:5) PNGs in `png/`. They follow the same rules as the first 12 posts: no emoji, no launch date, '
          'prices, user numbers, testimonials or named people, and Garmin is not mentioned. #maltarunning is in every hashtag set.',
          '', 'The order alternates a colour card (orange or graphite) with a light card, so the grid stays balanced if you post them in order. '
          'Paste the hashtags as the last paragraph of the caption, or as the first comment.', '',
          'Waitlist cards point to ritmorunning.run (the waitlist website). Make sure the bio link is set to https://ritmorunning.run before posting them.', '']
cal_md = ['# Ritmo Running: posting calendar for the 100 cards', '',
          f'One card a week, every Monday at 07:30 (Malta time), from {START.strftime("%A %-d %B %Y")} to the last card. This continues straight after post 12 (Friday 1 January 2027). '
          'The file names carry no date, so you can move a card. If you reorder, keep a colour card next to a light card.', '',
          '| # | Suggested date | Type | Theme | File |', '|---|---|---|---|---|']
TYPE = dict(coach="Coach's note", tips='Training tips', feature='Feature glimpse', myth='Myth vs fact', glossary='Running words',
            number='By the numbers', question='Question', waitlist='Waitlist')
manifest = []
for i, ((k, c), theme) in enumerate(CARDS):
    n = i + 1
    title = c.get('title') or c.get('term') or c.get('myth')
    name = f'card-{n:03d}-{slug(title)}'
    inner, css = TEMPLATES[k](n, c, theme)
    page(name, theme, inner, css)
    d = START + dt.timedelta(days=EVERY * i)
    cap_md += ['---', '', f'## {n:03d} · {TYPE[c["cat"]]} · {plain(title)}', '', f'**File:** `png/{name}.png`  ', f'**Suggested date:** {d.strftime("%a %-d %b %Y")}', '',
               '**Caption**', '', caption(k, c, n), '', '**Hashtags**', '', TAGS[c['cat']], '', '**Alt text**', '', alt(k, c, theme), '']
    cal_md.append(f'| {n:03d} | {d.strftime("%a %-d %b %Y")} | {TYPE[c["cat"]]} | {theme} | `png/{name}.png` |')
    manifest.append(dict(n=n, file=f'png/{name}.png', type=TYPE[c['cat']], theme=theme, date=d.isoformat(),
                         caption=caption(k, c, n), hashtags=TAGS[c['cat']], alt=alt(k, c, theme)))

open(f'{OUT}/captions.md', 'w').write('\n'.join(cap_md))
open(f'{OUT}/calendar.md', 'w').write('\n'.join(cal_md) + '\n')
json.dump(manifest, open(f'{OUT}/cards.json', 'w'), indent=1, ensure_ascii=False)
json.dump(JOBS, open(os.path.join(S, 'jobs100.json'), 'w'), indent=1)
print(len(JOBS), 'cards')
