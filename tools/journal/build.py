"""Journal articles: checks the texts and writes what Shopify needs.

  python3 tools/journal/build.py                 checks every article, writes out/<name>.create.json
  python3 tools/journal/build.py ids.json        also writes tools/i18n/shopify/journal-<name>.json
                                                 (ids.json = {"<name>": "gid://shopify/Article/…"})
"""
import importlib, json, os, re, sys
from html.parser import HTMLParser
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
NAMES = ['housewarming', 'wedding', 'leaving', 'sofa', 'baby']
LANGS = ['en', 'nl', 'de', 'fr']
BLOG = 'gid://shopify/Blog/128120783231'

class Check(HTMLParser):
    VOID = {'br', 'img', 'hr'}
    def __init__(s): super().__init__(); s.stack = []; s.err = []
    def handle_starttag(s, t, a):
        if t not in s.VOID: s.stack.append(t)
    def handle_endtag(s, t):
        if not s.stack or s.stack[-1] != t: s.err.append(f'</{t}> but open {s.stack[-1:]}')
        else: s.stack.pop()

def check(name, A):
    probs = []
    for l in LANGS:
        d = A[l]
        for k, v in d.items():
            if re.search('[–—]', v): probs.append(f'{l}.{k}: dash')
        c = Check(); c.feed(d['body'])
        if c.err or c.stack: probs.append(f'{l}.body html: {c.err} {c.stack}')
        for href in re.findall(r'href="([^"]+)"', d['body']):
            want = '' if l == 'en' else f'/{l}'
            if not href.startswith(want + '/pages/'): probs.append(f'{l}: link {href}')
        if name != 'housewarming' and len(d['meta_description']) > 170: probs.append(f'{l}: meta_description {len(d["meta_description"])} chars')
        if len(d['meta_title']) > 75: probs.append(f'{l}: meta_title {len(d["meta_title"])} chars')
    # same structure in every language
    tags = {l: re.findall(r'<(h2|h3|li|tr|td|a) ?', A[l]['body']) for l in LANGS}
    for l in LANGS[1:]:
        if tags[l] != tags['en']: probs.append(f'{l}: structure differs from en')
    return probs

def main():
    ids = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else {}
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    ok = True
    for n in NAMES:
        A = importlib.import_module(n).A
        p = check(n, A)
        print(n, 'OK' if not p else p); ok &= not p
        en = A['en']
        create = {'blogId': BLOG, 'title': en['title'], 'handle': A['handle'], 'body': en['body'],
                  'summary': f"<p>{en['excerpt']}</p>", 'tags': A['tags'], 'isPublished': True,
                  'templateSuffix': 'journal', 'author': {'name': 'N°98 Maps'},
                  'metafields': [{'namespace': 'n98', 'key': 'img', 'type': 'single_line_text_field', 'value': A['img']},
                                 {'namespace': 'global', 'key': 'title_tag', 'type': 'single_line_text_field', 'value': en['meta_title']},
                                 {'namespace': 'global', 'key': 'description_tag', 'type': 'multi_line_text_field', 'value': en['meta_description']}]}
        json.dump(create, open(os.path.join(HERE, 'out', n + '.create.json'), 'w'), ensure_ascii=False, indent=1)
        if n in ids:
            tr = [{'id': ids[n], 'locale': l, 't': {'title': A[l]['title'], 'body_html': A[l]['body'],
                   'summary_html': f"<p>{A[l]['excerpt']}</p>", 'meta_title': A[l]['meta_title'],
                   'meta_description': A[l]['meta_description']}} for l in LANGS[1:]]
            json.dump(tr, open(os.path.join(HERE, '..', 'i18n', 'shopify', f'journal-{n}.json'), 'w'), ensure_ascii=False, indent=1)
    sys.exit(0 if ok else 1)

main()
