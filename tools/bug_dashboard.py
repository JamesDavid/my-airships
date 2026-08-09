# The bug dashboard — look at what the pilot saw, and draw on it.
#
# Twenty-two of the open reports say the same eleven words: "Looks wrong here.
# (Filed from the headset...)". That is the FAUTE button working exactly as
# intended — a pilot in a headset cannot type, so the button files the picture
# and the state and nothing else. It is a good way to REPORT and a hopeless way
# to EXPLAIN, and the gap between the two is this tool: the picture comes up
# full size, you draw an arrow at the thing that is wrong, write a line about
# it, and it is saved where the works can read it.
#
#   python tools/bug_dashboard.py            browser opens itself
#   filter in the page: open / handled / all, and headset / phone / desktop
#   python tools/bug_dashboard.py --port 8123
#
# WHY THIS IS A SERVER AND NOT A FILE. The reports are readable only with the
# service role — tools/bugs.py explains why, and it is deliberate. A page that
# talked to Supabase directly would need that key inside it, where a browser
# extension, a screenshot or a stray Ctrl-S could carry it off. So the key stays
# here, in the process, and the page never sees it or the Supabase URL: it talks
# to 127.0.0.1 only. The server binds the loopback address explicitly for the
# same reason.
#
# WHERE THE ANNOTATIONS GO. Not back to Supabase. They land in bug-notes/ beside
# the repo, one PNG and one Markdown file per report, plus a NOTES.md index —
# so they are readable offline, diffable, and need no schema change to a table
# that pilots write to. Point the works at bug-notes/ and everything you marked
# is there in one read.
import argparse
import base64
import json
import os
import re
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bugs import call, ROOT   # the key handling and the URL live there, once

NOTES = os.path.join(ROOT, 'bug-notes')
HERE = os.path.dirname(os.path.abspath(__file__))


# What filed it. Derived here rather than in the page because it is a judgement
# about the data and it belongs beside the data — and because the page must be
# able to say "headset only" without knowing what a Quest's user agent looks
# like. A report from a headset is the one that most needs a picture drawn on:
# the pilot could not type when they filed it.
HEADSET = re.compile(r'OculusBrowser|Quest|Pico Browser|Wolvic|SteamVR', re.I)
HANDHELD = re.compile(r'Android|iPhone|iPad|Mobile', re.I)


def kind_of(r):
    st = r.get('state') or {}
    page = st.get('page') or {}
    ua = page.get('ua') or ''
    if 'from the headset' in (r.get('body') or '') or HEADSET.search(ua):
        return 'headset'
    if page.get('touch') or HANDHELD.search(ua):
        return 'phone'
    return 'desktop'


def load():
    """EVERY report, newest first — but WITHOUT the pictures.

    All of them, always, handled or not: the filtering is the page's business
    now, and asking the server again every time you want to see what has already
    been dealt with makes a round trip out of a question the browser can answer
    from what it is holding.

    The pictures are the reason for the split. A shot is 200-900 KB of base64
    and there are thirty-odd reports; sent all at once the page waits half a
    minute on a blank screen before it can show a list. The list arrives at
    once, and each picture is fetched when its report is opened.
    """
    rows = call('/rest/v1/bug_reports?select=id,created_at,pilot,client_version,'
                'handled,body,state&order=created_at.desc&limit=500')
    for r in rows:
        r['note'] = read_note(r['id'])
        r['kind'] = kind_of(r)
    return rows


def read_note(rid):
    """What was already written about this one, so a second pass can edit it."""
    p = os.path.join(NOTES, 'bug-%d.md' % rid)
    if not os.path.exists(p):
        return None
    txt = open(p, encoding='utf-8').read()
    m = re.search(r'\n---\n\n(.*)$', txt, re.S)
    return (m.group(1) if m else txt).strip()


def write_note(rid, note, png, marks, meta):
    os.makedirs(NOTES, exist_ok=True)
    wrote = []
    if png:
        head, _, b64 = png.partition(',')
        ext = 'png' if 'png' in head else 'jpg'
        path = os.path.join(NOTES, 'bug-%d.%s' % (rid, ext))
        open(path, 'wb').write(base64.b64decode(b64))
        wrote.append(os.path.basename(path))
    md = os.path.join(NOTES, 'bug-%d.md' % rid)
    body = ['# Report #%d' % rid]
    for k, v in (('filed', meta.get('created_at')), ('pilot', meta.get('pilot')),
                 ('place', meta.get('place')), ('ship', meta.get('ship')),
                 ('at', meta.get('at')), ('camera', meta.get('camera')),
                 ('what the pilot filed', meta.get('body'))):
        if v:
            body.append('%-22s %s' % (k + ':', str(v).replace('\n', ' ')))
    if wrote:
        body.append('%-22s %s' % ('marked picture:', wrote[0]))
    if marks:
        body.append('%-22s %d' % ('marks drawn:', len(marks)))
    body.append('')
    body.append('---')
    body.append('')
    body.append(note.strip() or '(no words — see the marked picture)')
    body.append('')
    open(md, 'w', encoding='utf-8').write('\n'.join(body))
    reindex()
    return os.path.basename(md)


def reindex():
    """One file the works can read to see every note at once."""
    rows = []
    for f in sorted(os.listdir(NOTES)):
        m = re.fullmatch(r'bug-(\d+)\.md', f)
        if not m:
            continue
        rid = int(m.group(1))
        txt = open(os.path.join(NOTES, f), encoding='utf-8').read()
        note = re.search(r'\n---\n\n(.*)$', txt, re.S)
        first = (note.group(1).strip().splitlines() or [''])[0] if note else ''
        rows.append((rid, first))
    rows.sort(key=lambda r: -r[0])
    out = ['# What is actually wrong in each report',
           '',
           'Written on the pictures with tools/bug_dashboard.py. One .md and one',
           'marked .png per report, in this folder.',
           '']
    for rid, first in rows:
        out.append('- **#%d** — %s  ·  [note](bug-%d.md)' % (rid, first[:150], rid))
    out.append('')
    open(os.path.join(NOTES, 'NOTES.md'), 'w', encoding='utf-8').write('\n'.join(out))


class Handler(BaseHTTPRequestHandler):

    def log_message(self, *a):
        pass                                    # the console is for the notes

    def send(self, code, body, ctype='application/json'):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            if self.path in ('/', '/index.html'):
                page = open(os.path.join(HERE, 'bug_dashboard.html'), encoding='utf-8').read()
                return self.send(200, page, 'text/html; charset=utf-8')
            if self.path.startswith('/api/reports'):
                return self.send(200, load())
            m = re.fullmatch(r'/api/shot/(\d+)', self.path)
            if m:
                rows = call('/rest/v1/bug_reports?select=shot&id=eq.' + m.group(1))
                return self.send(200, {'shot': rows[0]['shot'] if rows else None})
            m = re.fullmatch(r'/api/marked/(\d+)\.(png|jpg)', self.path)
            if m:
                p = os.path.join(NOTES, 'bug-%s.%s' % (m.group(1), m.group(2)))
                if not os.path.exists(p):
                    return self.send(404, {'error': 'no marked picture'})
                return self.send(200, open(p, 'rb').read(), 'image/' + m.group(2))
            self.send(404, {'error': 'no such thing'})
        except Exception as e:                  # a dead server helps nobody
            self.send(500, {'error': str(e)})

    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
            req = json.loads(self.rfile.read(n) or b'{}')
            if self.path == '/api/note':
                f = write_note(int(req['id']), req.get('note') or '', req.get('png'),
                               req.get('marks') or [], req.get('meta') or {})
                print('  wrote bug-notes/%s' % f)
                return self.send(200, {'ok': True, 'file': f})
            if self.path in ('/api/close', '/api/reopen'):
                handled = self.path == '/api/close'
                for i in req.get('ids') or []:
                    call('/rest/v1/bug_reports?id=eq.%d' % int(i), 'PATCH',
                         {'handled': handled}, {'Prefer': 'return=minimal'})
                    print('  #%d %s' % (int(i), 'closed' if handled else 'reopened'))
                return self.send(200, {'ok': True})
            self.send(404, {'error': 'no such thing'})
        except Exception as e:
            self.send(500, {'error': str(e)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8123)
    ap.add_argument('--no-open', action='store_true')
    a = ap.parse_args()

    rows = load()                               # fail loudly here, not in the page
    open_n = sum(1 for r in rows if not r.get('handled'))
    print('%d report%s, %d still open. Dashboard on http://127.0.0.1:%d/'
          % (len(rows), '' if len(rows) == 1 else 's', open_n, a.port))
    print('Notes are written to bug-notes/ — nothing is sent back to Supabase')
    print('except closing a report. Ctrl-C to stop.')
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    if not a.no_open:
        threading.Timer(0.4, lambda: webbrowser.open('http://127.0.0.1:%d/' % a.port)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')


if __name__ == '__main__':
    main()
