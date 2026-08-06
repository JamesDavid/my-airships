# Read the bug reports. Needs the service role; the anon key cannot see them.
#
# That is deliberate and supabase/schema.sql says why: "a report carries
# whatever the pilot typed and a picture of their screen, and that is for the
# works alone." So this does NOT add a read policy — it just makes the service
# role convenient, and keeps the key out of the repository and out of any
# transcript.
#
# The key comes from, in order:
#   1. the SUPABASE_SERVICE_KEY environment variable
#   2. a file .supabase_service_key beside this repo's root (gitignored)
# and is never printed.
#
#   python tools/bugs.py                 the unhandled ones, newest first
#   python tools/bugs.py --all           handled ones too
#   python tools/bugs.py --shots         write any screenshots out as files
#   python tools/bugs.py --close 42 43   mark those handled
#
# Get the key from the Supabase dashboard: Project Settings -> API -> service_role.
# Anyone holding it can read and write everything, so keep it in the env or in
# that one gitignored file and nowhere else.
import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.parse

URL = 'https://vsdzskrwzvibsnhspljl.supabase.co'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def key():
    k = os.environ.get('SUPABASE_SERVICE_KEY')
    if k:
        return k.strip()
    p = os.path.join(ROOT, '.supabase_service_key')
    if os.path.exists(p):
        return open(p, encoding='utf-8').read().strip()
    sys.exit(
        'No service key.\n'
        '  set SUPABASE_SERVICE_KEY=...   (or write it to .supabase_service_key)\n'
        '  Supabase dashboard -> Project Settings -> API -> service_role.\n'
        'The anon key in src/net_config.js cannot read bug reports by design.')


def call(path, method='GET', body=None, headers=None):
    k = key()
    h = {'apikey': k, 'Authorization': 'Bearer ' + k,
         'Content-Type': 'application/json'}
    h.update(headers or {})
    r = urllib.request.urlopen(urllib.request.Request(
        URL + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers=h), timeout=60)
    raw = r.read()
    return json.loads(raw) if raw else None


ap = argparse.ArgumentParser()
ap.add_argument('--all', action='store_true')
ap.add_argument('--shots', action='store_true')
ap.add_argument('--close', nargs='+', type=int, default=[])
a = ap.parse_args()

if a.close:
    for i in a.close:
        call('/rest/v1/bug_reports?id=eq.%d' % i, 'PATCH', {'handled': True},
             {'Prefer': 'return=minimal'})
        print('closed %d' % i)
    sys.exit(0)

q = 'select=*&order=created_at.desc&limit=200'
if not a.all:
    q += '&handled=eq.false'
rows = call('/rest/v1/bug_reports?' + q)
print('%d report%s\n' % (len(rows), '' if len(rows) == 1 else 's'))

for r in rows:
    st = r.get('state') or {}
    page = st.get('page') or {}
    print('=' * 78)
    print('#%-5s %s   %s   %s%s'
          % (r['id'], r['created_at'][:19].replace('T', ' '),
             r.get('pilot') or '(no name)', r.get('client_version') or '?',
             '   HANDLED' if r.get('handled') else ''))
    for k_, v in (('where', st.get('location')), ('ship', st.get('ship')),
                  ('course', st.get('track') or st.get('scenario')),
                  ('room', st.get('room')), ('browser', page.get('ua')),
                  ('screen', page.get('screen'))):
        if v:
            print('  %-8s %s' % (k_, str(v)[:110]))
    faults = st.get('faults') or st.get('errors')
    if faults:
        print('  faults:')
        for f in (faults if isinstance(faults, list) else [faults])[:8]:
            print('    %s' % str(f)[:160])
    print()
    for line in (r.get('body') or '').splitlines():
        print('    ' + line)
    print()
    if r.get('shot'):
        if a.shots:
            m = r['shot'].split(',', 1)
            ext = 'png' if 'png' in m[0] else 'jpg'
            out = os.path.join(ROOT, 'bug-%d.%s' % (r['id'], ext))
            open(out, 'wb').write(base64.b64decode(m[1]))
            print('    [screenshot -> %s]' % out)
        else:
            print('    [screenshot attached, %d KB — rerun with --shots]'
                  % (len(r['shot']) // 1400))
        print()
