"""Build Swedish and Norwegian translations for every city page.

Writes tools/i18n/shopify/cities-sv.json and cities-nb.json: items by page handle
({page, locale, t, lede}), registered by the shopify-translate function.
"""
import importlib, json, re, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
EN = json.loads((HERE / 'cities_en.json').read_text(encoding='utf-8'))
T = {}
for g in ('nl', 'be', 'de', 'fr', 'us', 'uk', 'no', 'se'):
    T.update(importlib.import_module('tr_' + g).T)
assert set(T) == set(EN), set(EN) ^ set(T)
NAMES = {
 'the-hague': ('Haag', 'Haag'), 'antwerp': ('Antwerpen', 'Antwerpen'), 'ghent': ('Gent', 'Gent'),
 'brussels': ('Bryssel', 'Brussel'), 'bruges': ('Brygge', 'Brugge'), 'ostend': ('Oostende', 'Oostende'),
 'munich': ('München', 'München'), 'cologne': ('Köln', 'Köln'), 'hanover': ('Hannover', 'Hannover'),
 'nuremberg': ('Nürnberg', 'Nürnberg'), 'vienna': ('Wien', 'Wien'), 'prague': ('Prag', 'Praha'),
 'rome': ('Rom', 'Roma'), 'venice': ('Venedig', 'Venezia'), 'lisbon': ('Lissabon', 'Lisboa'),
 'copenhagen': ('Köpenhamn', 'København'), 'gothenburg': ('Göteborg', 'Göteborg'),
}
TPL = {
 'sv': dict(
  title='Karta över %(n)s',
  body='<h2>Därför blir %(n)s en vacker karta</h2>\n<p>%(why)s</p>\n<h2>Idéer för din karta över %(n)s</h2>\n<ul>\n%(li)s\n</ul>\n<p>Allt bestämmer du: välj bland fler än femtio paletter, en klassisk rektangel, en cirkel eller ett hjärta, och lägg till dina egna ord, ett datum och nålar på platserna som betyder något.</p>',
  meta_title='Karta över %(n)s: personlig kartaffisch',
  meta_description='Designa din egen karta över %(n)s med %(hook)s. Fler än 50 paletter, egna ord och nålar. Med eller utan ram, fri frakt i Europa, Storbritannien och USA.',
  lede='Ett personligt kartprint över %(n)s, ritat från riktiga kartdata: %(hook)s, eller bara din egen gata. Dina färger, dina ord, med eller utan ram.'),
 'nb': dict(
  title='Kart over %(n)s',
  body='<h2>Derfor blir %(n)s et vakkert kart</h2>\n<p>%(why)s</p>\n<h2>Ideer til kartet ditt over %(n)s</h2>\n<ul>\n%(li)s\n</ul>\n<p>Alt bestemmer du: velg blant mer enn femti paletter, et klassisk rektangel, en sirkel eller et hjerte, og legg til dine egne ord, en dato og nåler på stedene som betyr noe.</p>',
  meta_title='Kart over %(n)s: personlig kartplakat',
  meta_description='Design ditt eget kart over %(n)s med %(hook)s. Over 50 paletter, egne ord og nåler. Med eller uten ramme, gratis frakt i Europa, Storbritannia og USA.',
  lede='En personlig kartplakat over %(n)s, tegnet fra ekte kartdata: %(hook)s, eller bare din egen gate. Dine farger, dine ord, med eller uten ramme.'),
}
for i, lang in enumerate(('sv', 'nb')):
    out = []
    for slug, en in EN.items():
        why, ideas, hook = T[slug][lang]
        assert len(ideas) == 3, slug
        n = NAMES.get(slug, (en['name'], en['name']))[i]
        v = dict(n=n, why=why, hook=hook, li='\n'.join('<li>%s</li>' % x for x in ideas))
        tp = TPL[lang]
        out.append({'page': slug + '-map-print', 'locale': lang,
                    't': {'title': tp['title'] % v, 'body_html': tp['body'] % v,
                          'meta_title': tp['meta_title'] % v, 'meta_description': tp['meta_description'] % v},
                    'lede': tp['lede'] % v})
    txt = json.dumps(out, ensure_ascii=False)
    assert not re.search('[–—]', txt), 'dash'
    (ROOT / 'tools' / 'i18n' / 'shopify' / ('cities-%s.json' % lang)).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(lang, len(out), 'max meta', max(len(x['t']['meta_description']) for x in out))
