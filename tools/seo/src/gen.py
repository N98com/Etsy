import json, re, sys
sys.path.insert(0, '.')
from se_en import UK
from se_tr import T
E = '/home/claude/etsy/'
designs, pages, lst = [], [], []
for slug, name, lat, lon, pal, zoom, why, ideas, hook, names in UK:
    img = 'w-' + slug
    designs.append({'id': img, 'place': name, 'country': 'Sweden', 'lat': lat, 'lon': lon, 'palette': pal, 'w': 1200, 'h': 1680, **({'zoom': zoom} if zoom != 1 else {})})
    body = '<h2>Why %s makes a beautiful map</h2>\n<p>%s</p>\n<h2>Ideas for your %s map</h2>\n<ul>\n%s\n</ul>\n<p>Every detail is yours: choose from more than fifty palettes, a classic rectangle, a circle or a heart, and add your own words, a date and pins on the places that matter.</p>' % (
        name, why, name, '\n'.join('<li>%s</li>' % i for i in ideas))
    pages.append({'title': '%s map print' % name, 'handle': '%s-map-print' % slug, 'body': body, 'isPublished': True, 'templateSuffix': 'city',
      'metafields': [
        {'namespace': 'n98', 'key': 'city', 'type': 'json', 'value': json.dumps({'name': name, 'country': 'Sweden', 'lat': lat, 'lon': lon, 'palette': pal, 'scale': int(round(18000 * zoom)), 'img': img}, ensure_ascii=False)},
        {'namespace': 'n98', 'key': 'lede', 'type': 'multi_line_text_field', 'value': 'A personalised map print of %s, drawn from real map data: %s, or just your own street. Your colours, your words, framed or unframed.' % (name, hook)},
        {'namespace': 'global', 'key': 'title_tag', 'type': 'single_line_text_field', 'value': '%s Map Print: Personalised City Map Poster' % name},
        {'namespace': 'global', 'key': 'description_tag', 'type': 'single_line_text_field', 'value': 'Design your own %s map print with %s. 50+ palettes, your own words and pins. Framed or unframed, free shipping in Europe, the UK and the US.' % (name, hook)}]})
    e = {'s': slug, 'n': name, 'c': 'se', 'i': img}
    e.update({k: v for k, v in names.items()})
    lst.append(e)

def loc(slug, lang):
    for u in UK:
        if u[0] == slug: return u[9].get(lang, u[1])

def tr_items(ids):
    """ids: slug -> (page gid, lede metafield gid)"""
    out = []
    for slug, name, *_ in UK:
        pid, mid = ids[slug]
        for lang in ('nl', 'de', 'fr'):
            why, ideas, hook = T[lang][slug]
            n = loc(slug, lang)
            li = '\n'.join('<li>%s</li>' % i for i in ideas)
            if lang == 'nl':
                t = {'title': 'Stadskaart %s' % n,
                     'body_html': '<h2>Waarom %s een prachtige kaart is</h2>\n<p>%s</p>\n<h2>Ideeën voor je kaart van %s</h2>\n<ul>\n%s\n</ul>\n<p>Alles bepaal jij: kies uit meer dan vijftig paletten, een klassieke rechthoek, een cirkel of een hart, en zet je eigen woorden, een datum en pins op de plekken die ertoe doen.</p>' % (n, why, n, li),
                     'meta_title': 'Stadskaart %s: gepersonaliseerde kaartposter' % n,
                     'meta_description': 'Ontwerp je eigen stadskaart van %s met %s. Meer dan 50 paletten, je eigen woorden en pins. Met of zonder lijst, gratis verzending in Europa, het VK en de VS.' % (n, hook)}
                lede = 'Een gepersonaliseerde kaartprint van %s, getekend uit echte kaartdata: %s, of gewoon je eigen straat. Jouw kleuren, jouw woorden, met of zonder lijst.' % (n, hook)
            elif lang == 'de':
                t = {'title': 'Stadtkarte %s' % n,
                     'body_html': '<h2>Warum %s eine wunderschöne Karte ergibt</h2>\n<p>%s</p>\n<h2>Ideen für deine Karte von %s</h2>\n<ul>\n%s\n</ul>\n<p>Alles bestimmst du: Wähle aus mehr als fünfzig Paletten, ein klassisches Rechteck, einen Kreis oder ein Herz, und setze deine eigenen Worte, ein Datum und Pins auf die Orte, die zählen.</p>' % (n, why, n, li),
                     'meta_title': 'Stadtkarte %s: personalisiertes Kartenposter' % n,
                     'meta_description': 'Gestalte deine eigene Stadtkarte von %s und zeige %s oder deine eigene Straße. Über 50 Paletten, eigene Worte und Pins. Mit oder ohne Rahmen, kostenloser Versand in Europa, nach Großbritannien und in die USA.' % (n, hook)}
                lede = 'Ein personalisierter Kartendruck von %s, gezeichnet aus echten Kartendaten. Er zeigt %s oder einfach deine eigene Straße. Deine Farben, deine Worte, mit oder ohne Rahmen.' % (n, hook)
            else:
                t = {'title': 'Carte de %s' % n,
                     'body_html': '<h2>Pourquoi %s fait une si belle carte</h2>\n<p>%s</p>\n<h2>Idées pour votre carte de %s</h2>\n<ul>\n%s\n</ul>\n<p>Tout est à vous : choisissez parmi plus de cinquante palettes, un rectangle classique, un cercle ou un cœur, et ajoutez vos propres mots, une date et des repères sur les lieux qui comptent.</p>' % (n, why, n, li),
                     'meta_title': 'Carte de %s : affiche de carte personnalisée' % n,
                     'meta_description': 'Créez votre propre carte de %s avec %s. Plus de 50 palettes, vos mots et vos repères. Avec ou sans cadre, livraison gratuite en Europe, au Royaume-Uni et aux États-Unis.' % (n, hook)}
                lede = 'Une affiche de carte personnalisée de %s, dessinée à partir de vraies données cartographiques : %s, ou simplement votre propre rue. Vos couleurs, vos mots, avec ou sans cadre.' % (n, hook)
            if lang == 'fr':
                el = lambda v: re.sub(r'\bde ([AEIOUÉÖÅÄ])', r'd’\1', v)
                t = {k: el(v) for k, v in t.items()}
                lede = el(lede)
            out.append({'id': pid, 'locale': lang, 't': t})
            out.append({'id': mid, 'locale': lang, 't': {'value': lede}})
    return out

if __name__ == '__main__':
    json.dump(designs, open('designs.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(pages, open('pages.json', 'w'), ensure_ascii=False)
    json.dump(lst, open('list.json', 'w'), ensure_ascii=False)
    txt = json.dumps([pages, T], ensure_ascii=False)
    print(len(pages), 'pages; dashes', len(re.findall('[–—]', txt)), max(len(p['metafields'][2]['value']) for p in pages), max(len(p['metafields'][3]['value']) for p in pages))
    # fr: "de Edinburgh" elision check
    for slug, name, *_ in UK:
        n = loc(slug, 'fr')
        if n[0] in 'AEIOUÉ': print('elision', n)
