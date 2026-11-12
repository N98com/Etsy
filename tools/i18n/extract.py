#!/usr/bin/env python3
"""List the translatable strings in an HTML/Liquid file (text nodes and a few attributes)."""
import sys, re
from html.parser import HTMLParser
ATTRS = {'alt', 'aria-label', 'placeholder', 'title', 'data-caption', 'data-label'}
class P(HTMLParser):
    def __init__(s): super().__init__(convert_charrefs=False); s.skip = 0; s.out = []
    def handle_starttag(s, t, a):
        if t in ('script', 'style'): s.skip += 1
        for k, v in a:
            if k in ATTRS and v and re.search('[A-Za-z]{2}', v) and '{{' not in v: s.out.append(v.strip())
    def handle_endtag(s, t):
        if t in ('script', 'style'): s.skip -= 1
    def handle_data(s, d):
        if s.skip: return
        d = re.sub(r'\s+', ' ', d).strip()
        if re.search('[A-Za-z]{2}', d) and not d.startswith('{%') and not d.startswith('{{'): s.out.append(d)
def strings(src):
    src = re.sub(r'\{%-?\s*(schema|comment)\s*-?%\}.*?\{%-?\s*end(schema|comment)\s*-?%\}', '', src, flags=re.S)
    p = P(); p.feed(src); seen = []
    for x in p.out:
        if x not in seen: seen.append(x)
    return seen
if __name__ == '__main__':
    for x in strings(open(sys.argv[1], encoding='utf-8').read()): print(x)
