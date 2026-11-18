"""N°98 Maps: city pages for German cities, German only.
The page content is German in the source fields (no translation needed): the pages are only
listed and indexed in German (langs "de"); other languages get noindex.
python3 gen.py -> designs-add.json, pages-a.json, pages-b.json, list-add.json (needs geocode-out.json)
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cities import NEW
GEO = json.load(open(os.path.join(HERE, 'geocode-out.json')))
FIX = json.load(open(os.path.join(HERE, 'geocode-fix.json'))) if os.path.exists(os.path.join(HERE, 'geocode-fix.json')) else {}
SCALE = 18000
LANGS = 'de'


def fit(templates, *args, limit=165):
    for t in templates:
        v = t % args
        if len(v) <= limit:
            return v
    return v


def img_id(slug):
    return 'd-' + slug


def build():
    designs, pages, lst = [], [], []
    for slug, name, state, q, pal, zoom, why, ideas, hook in NEW:
        lat, lon = FIX.get(slug) or (GEO[slug]['lat'], GEO[slug]['lon'])
        lat, lon = round(lat, 4), round(lon, 4)
        d = {'id': img_id(slug) + '--de', 'place': name, 'country': 'Deutschland', 'lat': lat, 'lon': lon, 'palette': pal, 'w': 1200, 'h': 1680}
        if zoom != 1:
            d['zoom'] = zoom
        designs.append(d)
        li = '\n'.join('<li>%s</li>' % i for i in ideas)
        body = ('<h2>Warum %s eine wunderschöne Karte ergibt</h2>\n<p>%s</p>\n<h2>Ideen für deine Karte von %s</h2>\n<ul>\n%s\n</ul>\n'
                '<p>Alles bestimmst du: Wähle aus mehr als fünfzig Paletten, ein klassisches Rechteck, einen Kreis oder ein Herz, und setze deine eigenen Worte, ein Datum und Pins auf die Orte, die zählen.</p>') % (name, why, name, li)
        pages.append({'title': 'Stadtkarte %s' % name, 'handle': '%s-map-print' % slug, 'body': body, 'isPublished': False, 'templateSuffix': 'city',
            'metafields': [
                {'namespace': 'n98', 'key': 'city', 'type': 'json', 'value': json.dumps({'name': name, 'country': 'Germany', 'lat': lat, 'lon': lon, 'palette': pal, 'scale': int(round(SCALE * zoom)), 'img': img_id(slug), 'langs': LANGS}, ensure_ascii=False)},
                {'namespace': 'n98', 'key': 'lede', 'type': 'multi_line_text_field', 'value': 'Ein personalisierter Kartendruck von %s, gezeichnet aus echten Kartendaten. Er zeigt %s oder einfach deine eigene Straße. Deine Farben, deine Worte, mit oder ohne Rahmen.' % (name, hook)},
                {'namespace': 'global', 'key': 'title_tag', 'type': 'single_line_text_field', 'value': fit(['Stadtkarte %s: personalisiertes Kartenposter', 'Stadtkarte %s: Kartenposter'], name, limit=70)},
                {'namespace': 'global', 'key': 'description_tag', 'type': 'single_line_text_field', 'value': fit([
                    'Gestalte deine eigene Stadtkarte von %s und zeige %s oder deine eigene Straße. Über 50 Paletten, eigene Worte und Pins. Kostenloser Versand in Europa.',
                    'Deine eigene Stadtkarte von %s mit %s. Über 50 Paletten, eigene Worte und Pins, kostenloser Versand.',
                    'Deine eigene Stadtkarte von %s mit %s. Über 50 Paletten.'], name, hook)}]})
        lst.append({'s': slug, 'n': name, 'c': 'de', 'i': img_id(slug), 'p': state, 'o': LANGS})
    return designs, pages, lst


if __name__ == '__main__':
    designs, pages, lst = build()
    assert not re.findall('[–—]', json.dumps(pages, ensure_ascii=False)), 'dash'
    json.dump(designs, open(os.path.join(HERE, 'designs-add.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(pages[:32], open(os.path.join(HERE, 'pages-a.json'), 'w'), ensure_ascii=False)
    json.dump(pages[32:], open(os.path.join(HERE, 'pages-b.json'), 'w'), ensure_ascii=False)
    json.dump(lst, open(os.path.join(HERE, 'list-add.json'), 'w'), ensure_ascii=False, indent=1)
    print(len(pages), 'pages; max title', max(len(p['metafields'][2]['value']) for p in pages),
          'max desc', max(len(p['metafields'][3]['value']) for p in pages))
