"""Builds notes.json for the shopify-translate action city_notes.
python3 build.py  -> notes.json  [{handle, notes: {en: html, nl: html, ...}}]
Each block: <h2>{city} on the map</h2> + three paragraphs (neighbourhoods, water, streets)."""
import json, os, re, sys, html
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from en_world import T as EN_W
from en_nl import T as EN_N
from nl_world import T as NL_W
from nl_nl import T as NL_N
from en_nl2 import T as EN_N2
from nl_nl2 import T as NL_N2
from de_world import T as DE_W
from fr_world import T as FR_W
from sv_world import T as SV_W
from nb_world import T as NB_W
from pl_world import T as PL_W
from it_world import T as IT_W

HEAD = {'en': '%s on the map', 'nl': '%s op de kaart', 'de': '%s auf der Karte', 'fr': '%s sur la carte', 'sv': '%s på kartan', 'nb': '%s på kartet', 'pl': '%s na mapie', 'it': '%s sulla mappa'}
LAB = {'en': ('Neighbourhoods', 'Water', 'Streets'), 'nl': ('Wijken', 'Water', 'Straten'), 'de': ('Viertel', 'Wasser', 'Straßen'),
       'fr': ('Quartiers', 'L’eau', 'Les rues'), 'sv': ('Stadsdelar', 'Vatten', 'Gator'), 'nb': ('Bydeler', 'Vann', 'Gater'),
       'pl': ('Dzielnice', 'Woda', 'Ulice'), 'it': ('Quartieri', 'Acqua', 'Strade')}
# localized names (from the shop metafield n98.cities5); default is the English name
NAME = json.load(open(os.path.join(HERE, 'names.json')))


def block(lang, slug, parts):
    # Polish names are stored as "pol": "pl" is the palette field in n98.cities5
    name = NAME[slug].get('pol' if lang == 'pl' else lang) or NAME[slug]['n']
    lab = LAB[lang]
    ps = '\n'.join('<p><strong>%s.</strong>%s%s</p>' % (lab[i], ' ', html.escape(parts[i], quote=False)) for i in range(3))
    return '<h2>%s</h2>\n%s' % (html.escape(HEAD[lang] % name, quote=False), ps)


def build():
    out = []
    world = {'en': EN_W, 'nl': NL_W, 'de': DE_W, 'fr': FR_W, 'sv': SV_W, 'nb': NB_W, 'pl': PL_W, 'it': IT_W}
    for slug in EN_W:
        out.append({'handle': slug + '-map-print', 'notes': {l: block(l, slug, t[slug]) for l, t in world.items()}})
    for en, nl in ((EN_N, NL_N), (EN_N2, NL_N2)):
        for slug in en:
            out.append({'handle': slug + '-map-print', 'notes': {'en': block('en', slug, en[slug]), 'nl': block('nl', slug, nl[slug])}})
    return out


if __name__ == '__main__':
    for name, t in [('nl_world', NL_W), ('de', DE_W), ('fr', FR_W), ('sv', SV_W), ('nb', NB_W), ('pl', PL_W), ('it', IT_W)]:
        assert set(t) == set(EN_W), (name, set(EN_W) ^ set(t))
    assert set(NL_N) == set(EN_N), set(EN_N) ^ set(NL_N)
    assert set(NL_N2) == set(EN_N2), set(EN_N2) ^ set(NL_N2)
    out = build()
    txt = json.dumps(out, ensure_ascii=False)
    assert not re.findall('[–—]', txt), 'dash'
    for it in out:
        for l, h in it['notes'].items():
            assert h.count('<p>') == 3 and '</div>' not in h
    json.dump(out, open(os.path.join(HERE, 'notes.json'), 'w'), ensure_ascii=False, indent=1)
    words = sum(len(re.sub('<[^>]+>', ' ', h).split()) for it in out for h in it['notes'].values())
    print(len(out), 'pages,', sum(len(it['notes']) for it in out), 'blocks,', words, 'words')
