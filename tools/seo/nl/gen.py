"""N°98 Maps: city pages for Dutch towns, English + Dutch only.
python3 gen.py            -> designs-add.json, pages.json, list-add.json (needs geocode-out.json)
python3 gen.py tr <ids>   -> translations file for tools/i18n/shopify/cities-nl2.json
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cities import NEW, OLD_PROV
from t_holland import T as T1
from t_mid import T as T2
from t_north import T as T3
T = {**T1, **T2, **T3}
GEO = json.load(open(os.path.join(HERE, 'geocode-out.json')))
SCALE = 18000
LANGS = 'en,nl'
PROV_EN = dict(gr='Groningen', fy='Friesland', dr='Drenthe', ov='Overijssel', fl='Flevoland', ge='Gelderland', ut='Utrecht',
               nh='North Holland', zh='South Holland', ze='Zeeland', nb='North Brabant', li='Limburg')


def fit(templates, name, hook, limit=165):
    for t in templates:
        v = t % (name, hook)
        if len(v) <= limit:
            return v
    return v


def img_id(slug):
    return 'x-' + slug


def build():
    designs, pages, lst = [], [], []
    for slug, name, prov, q, muni in NEW:
        pal, zoom, why, ideas, hook, *_ = T[slug]
        g = GEO[slug]
        lat, lon = round(g['lat'], 4), round(g['lon'], 4)
        base = {'id': img_id(slug), 'place': name, 'country': 'Netherlands', 'lat': lat, 'lon': lon, 'palette': pal, 'w': 1200, 'h': 1680}
        if zoom != 1:
            base['zoom'] = zoom
        designs.append(base)
        designs.append(dict(base, id=img_id(slug) + '--nl', country='Nederland'))
        body = ('<h2>Why %s makes a beautiful map</h2>\n<p>%s</p>\n<h2>Ideas for your %s map</h2>\n<ul>\n%s\n</ul>\n'
                '<p>Every detail is yours: choose from more than fifty palettes, a classic rectangle, a circle or a heart, and add your own words, a date and pins on the places that matter.</p>') % (
            name, why, name, '\n'.join('<li>%s</li>' % i for i in ideas))
        pages.append({'title': '%s map print' % name, 'handle': '%s-map-print' % slug, 'body': body, 'isPublished': False, 'templateSuffix': 'city',
            'metafields': [
                {'namespace': 'n98', 'key': 'city', 'type': 'json', 'value': json.dumps({'name': name, 'country': 'Netherlands', 'lat': lat, 'lon': lon, 'palette': pal, 'scale': int(round(SCALE * zoom)), 'img': img_id(slug), 'langs': LANGS}, ensure_ascii=False)},
                {'namespace': 'n98', 'key': 'lede', 'type': 'multi_line_text_field', 'value': 'A personalised map print of %s, drawn from real map data: %s, or just your own street. Your colours, your words, framed or unframed.' % (name, hook)},
                {'namespace': 'global', 'key': 'title_tag', 'type': 'single_line_text_field', 'value': '%s Map Print: Personalised City Map Poster' % name},
                {'namespace': 'global', 'key': 'description_tag', 'type': 'single_line_text_field', 'value': fit(['Design your own %s map print with %s. 50+ palettes, your own words and pins. Framed or unframed, free shipping in Europe, the UK and the US.',
                    'Design your own %s map print with %s. 50+ palettes, your own words and pins. Free shipping in Europe, the UK and the US.',
                    'Your own %s map print with %s. 50+ palettes, your words and pins, free shipping.'], name, hook)}]})
        lst.append({'s': slug, 'n': name, 'c': 'nl', 'i': img_id(slug), 'p': prov, 'o': LANGS})
    return designs, pages, lst


def tr_items(ids):
    """ids: slug -> (page gid, lede metafield gid)"""
    out = []
    for slug, name, prov, q, muni in NEW:
        pid, mid = ids[slug]
        why, ideas, hook = T[slug][5], T[slug][6], T[slug][7]
        li = '\n'.join('<li>%s</li>' % i for i in ideas)
        t = {'title': 'Stadskaart %s' % name,
             'body_html': ('<h2>Waarom %s een prachtige kaart is</h2>\n<p>%s</p>\n<h2>Ideeën voor je kaart van %s</h2>\n<ul>\n%s\n</ul>\n'
                           '<p>Alles bepaal jij: kies uit meer dan vijftig paletten, een klassieke rechthoek, een cirkel of een hart, en zet je eigen woorden, een datum en pins op de plekken die ertoe doen.</p>') % (name, why, name, li),
             'meta_title': 'Stadskaart %s: gepersonaliseerde kaartposter' % name,
             'meta_description': fit(['Ontwerp je eigen stadskaart van %s met %s. Meer dan 50 paletten, je eigen woorden en pins. Met of zonder lijst, gratis verzending in Europa, het VK en de VS.',
                 'Ontwerp je eigen stadskaart van %s met %s. Meer dan 50 paletten, je eigen woorden en pins. Gratis verzending in Europa.',
                 'Je eigen stadskaart van %s met %s. 50+ paletten, je eigen woorden en pins, gratis verzending.'], name, hook)}
        out.append({'id': pid, 'locale': 'nl', 't': t})
        out.append({'id': mid, 'locale': 'nl', 't': {'value': 'Een gepersonaliseerde kaartprint van %s, getekend uit echte kaartdata: %s, of gewoon je eigen straat. Jouw kleuren, jouw woorden, met of zonder lijst.' % (name, hook)}})
    return out


if __name__ == '__main__':
    designs, pages, lst = build()
    txt = json.dumps([pages, T], ensure_ascii=False)
    assert not re.findall('[–—]', txt), 'dash'
    json.dump(designs, open(os.path.join(HERE, 'designs-add.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(pages, open(os.path.join(HERE, 'pages.json'), 'w'), ensure_ascii=False)
    json.dump(pages[:40], open(os.path.join(HERE, 'pages-a.json'), 'w'), ensure_ascii=False)
    json.dump(pages[40:], open(os.path.join(HERE, 'pages-b.json'), 'w'), ensure_ascii=False)
    json.dump(lst, open(os.path.join(HERE, 'list-add.json'), 'w'), ensure_ascii=False, indent=1)
    print(len(pages), 'pages', len(designs), 'renders; max title', max(len(p['metafields'][2]['value']) for p in pages),
          'max desc', max(len(p['metafields'][3]['value']) for p in pages),
          'max nl desc', max(len(x['t']['meta_description']) for x in tr_items({c[0]: ('p', 'm') for c in NEW}) if 'meta_description' in x['t']))
