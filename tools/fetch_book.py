# The memoir itself, cached, so a question about what he wrote is answered
# from what he wrote. Wikisource holds "My Airships" as page scans transcluded
# into chapters, so the chapter has to be RENDERED to get the text.
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
API = 'https://en.wikisource.org/w/api.php'


def chapter(n):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, 'book_ch%02d.txt' % n)
    if os.path.exists(p):
        return open(p, encoding='utf-8').read()
    q = {'action': 'parse', 'format': 'json', 'prop': 'text',
         'page': 'My Airships/Chapter %d' % n}
    for a in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                API + '?' + urllib.parse.urlencode(q),
                headers={'User-Agent': 'MyAirships/1.0'}), timeout=90)
            h = json.loads(r.read())['parse']['text']['*']
            break
        except Exception as e:
            print('  ch%d try %d: %s' % (n, a + 1, str(e)[:60]))
            time.sleep(5)
    else:
        return ''
    h = re.sub(r'(?s)<(script|style|sup)\b.*?</\1>', ' ', h)
    h = re.sub(r'(?s)<!--.*?-->', ' ', h)
    h = re.sub(r'</p>', '\n\n', h)
    h = re.sub(r'(?s)<[^>]+>', '', h)
    h = (h.replace('&#160;', ' ').replace('&nbsp;', ' ').replace('&amp;', '&')
          .replace('&quot;', '"').replace('&#8217;', '\u2019'))
    h = re.sub(r'[ \t]+', ' ', h)
    h = re.sub(r'\n\s*\n\s*\n+', '\n\n', h).strip()
    open(p, 'w', encoding='utf-8').write(h)
    return h


if __name__ == '__main__':
    for n in range(1, 25):
        t = chapter(n)
        print('ch %2d  %6d chars  %s' % (n, len(t), t[:60].replace('\n', ' ')))
