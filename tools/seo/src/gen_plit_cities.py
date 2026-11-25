"""City pages for the 25 largest cities of Poland and Italy (English plus the local language).

python3 tools/seo/src/gen_plit_cities.py writes
  tools/seo/plit-pages.json                 pages to create (English, with metafields)
  tools/i18n/shopify/cities-plit-new.json   Polish / Italian translations ({page, locale, t, lede})
  tools/i18n/shopify/shop-cities6.json      the city list for v49 (cities5 + Poland + Italy; Rome and Venice move to Italy)
and adds the renders (w-<slug> plus a --pl or --it version) to tools/home-renders/designs.json.
"""
import json, re, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from plit_cities import PL, IT

EN_BODY = ('<h2>Why %(n)s makes a beautiful map</h2>\n<p>%(why)s</p>\n<h2>Ideas for your %(n)s map</h2>\n<ul>\n%(li)s\n</ul>\n'
           '<p>Every detail is yours: choose from more than fifty palettes, a classic rectangle, a circle or a heart, and add your own words, a date and pins on the places that matter.</p>')
TPL = {
 'pl': dict(
  title='Mapa %(g)s',
  body='<h2>Dlaczego %(n)s to piękna mapa</h2>\n<p>%(why)s</p>\n<h2>Pomysły na Twoją mapę %(g)s</h2>\n<ul>\n%(li)s\n</ul>\n<p>Wszystko zależy od Ciebie: wybierz spośród ponad pięćdziesięciu palet, klasyczny prostokąt, koło albo serce, i dodaj własne słowa, datę i pinezki w miejscach, które mają znaczenie.</p>',
  meta_title='Mapa %(g)s: personalizowany plakat z mapą',
  meta_description='Zaprojektuj plakat z mapą %(g)s: %(hook)s. Ponad 50 palet, własne słowa i pinezki. W ramie lub bez, darmowa wysyłka.',
  lede='Personalizowany plakat z mapą %(g)s, narysowany z prawdziwych danych: %(hook)s albo po prostu Twoja ulica. Twoje kolory, Twoje słowa, w ramie lub bez.'),
 'it': dict(
  title='Mappa %(g)s',
  body='<h2>Perché %(n)s è una mappa bellissima</h2>\n<p>%(why)s</p>\n<h2>Idee per la tua mappa %(g)s</h2>\n<ul>\n%(li)s\n</ul>\n<p>Ogni dettaglio è tuo: scegli tra più di cinquanta palette, un classico rettangolo, un cerchio o un cuore, e aggiungi le tue parole, una data e i simboli sui luoghi che contano.</p>',
  meta_title='Mappa %(g)s: stampa con mappa personalizzata',
  meta_description='Crea la tua mappa %(g)s con %(hook)s. Oltre 50 palette, parole tue e simboli. Con o senza cornice, spedizione gratuita.',
  lede='Una stampa con la mappa %(g)s, disegnata da dati cartografici reali: %(hook)s, o semplicemente la tua via. I tuoi colori, le tue parole, con o senza cornice.'),
}
COUNTRY = {'pl': ('Poland', 'Polska'), 'it': ('Italy', 'Italia')}
li = lambda xs: '\n'.join('<li>%s</li>' % x for x in xs)

pages, tr, entries, designs = [], [], [], []
for lang, rows in (('pl', PL), ('it', IT)):
    en_country, loc_country = COUNTRY[lang]
    for (slug, name, lat, lon, pal, zoom, why, ideas, hook, lname, g, lwhy, lideas, lhook) in rows:
        assert len(ideas) == 3 and len(lideas) == 3, slug
        img = 'w-' + slug
        h = slug + '-map-print'
        pages.append({'title': '%s map print' % name, 'handle': h, 'body': EN_BODY % dict(n=name, why=why, li=li(ideas)),
                      'isPublished': True, 'templateSuffix': 'city',
                      'metafields': [
            {'namespace': 'n98', 'key': 'city', 'type': 'json', 'value': json.dumps({'name': name, 'country': en_country, 'lat': lat, 'lon': lon, 'palette': pal, 'scale': int(round(18000 * zoom)), 'img': img, 'langs': 'en,' + lang}, ensure_ascii=False)},
            {'namespace': 'n98', 'key': 'lede', 'type': 'multi_line_text_field', 'value': 'A personalised map print of %s, drawn from real map data: %s, or just your own street. Your colours, your words, framed or unframed.' % (name, hook)},
            {'namespace': 'global', 'key': 'title_tag', 'type': 'single_line_text_field', 'value': '%s Map Print: Personalised City Map Poster' % name},
            {'namespace': 'global', 'key': 'description_tag', 'type': 'single_line_text_field', 'value': 'Design your own %s map print with %s. 50+ palettes, your own words and pins. Framed or unframed, free shipping.' % (name, hook)}]})
        v = dict(n=lname, g=g, why=lwhy, hook=lhook, li=li(lideas))
        tp = TPL[lang]
        tr.append({'page': h, 'locale': lang, 't': {'title': tp['title'] % v, 'body_html': tp['body'] % v,
                   'meta_title': tp['meta_title'] % v, 'meta_description': tp['meta_description'] % v}, 'lede': tp['lede'] % v})
        e = {'s': slug, 'n': name, 'c': lang, 'i': img, 'o': 'en,' + lang}
        if lname != name:
            e['pol' if lang == 'pl' else 'it'] = lname
        entries.append(e)
        base = {'id': img, 'place': name, 'country': en_country, 'lat': lat, 'lon': lon, 'palette': pal, 'w': 1200, 'h': 1680}
        if zoom != 1:
            base['zoom'] = zoom
        designs += [base, dict(base, id=img + '--' + lang, place=lname, country=loc_country)]

txt = json.dumps([pages, tr, entries], ensure_ascii=False)
assert not re.search('[–—]', txt), 'dash'
(ROOT / 'tools' / 'seo' / 'plit-pages.json').write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding='utf-8')
(ROOT / 'tools' / 'i18n' / 'shopify' / 'cities-plit-new.json').write_text(json.dumps(tr, ensure_ascii=False, indent=1), encoding='utf-8')
# city list for v49: Rome and Venice join the Italy group
c5 = json.loads((ROOT / 'tools' / 'i18n' / 'shopify' / 'shop-cities5.json').read_text(encoding='utf-8'))
have = {e['s'] for e in c5}
c6 = [dict(e, c='it') if e['s'] in ('rome', 'venice') else e for e in c5] + [e for e in entries if e['s'] not in have]
(ROOT / 'tools' / 'i18n' / 'shopify' / 'shop-cities6.json').write_text(json.dumps(c6, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
# renders
f = ROOT / 'tools' / 'home-renders' / 'designs.json'
d = json.loads(f.read_text(encoding='utf-8'))
ids = {x['id'] for x in d}
new = [x for x in designs if x['id'] not in ids]
f.write_text(json.dumps(d + new, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(len(pages), 'pages,', len(tr), 'translations,', len(c6), 'cities,', len(new), 'new renders')
print('max en meta', max(len(p['metafields'][3]['value']) for p in pages), 'max local meta', max(len(x['t']['meta_description']) for x in tr))
