"""Polish and Italian city pages: only the 30 world cities (the others are English plus their own language).

Writes tools/i18n/shopify/cities-pl.json and cities-it.json ({page, locale, t, lede}), registered by the
shopify-translate function. The body already holds the map notes block (tools/seo/notes), in the same
place the city_notes action puts it, so a later city_notes run changes nothing.
"""
import json, re, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from tr_pl import T as PL
from tr_it import T as IT
NOTES = {x['handle']: x['notes'] for x in json.loads((ROOT / 'tools' / 'seo' / 'notes' / 'notes.json').read_text(encoding='utf-8'))}
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


def put_notes(body, block):
    """Same as putNotes in supabase/functions/shopify-translate: the block goes before the last <p>."""
    wrapped = '<div class="n98-notes">\n%s\n</div>\n' % block
    i = body.rfind('<p>')
    return body + '\n' + wrapped if i < 0 else body[:i] + wrapped + body[i:]


for lang, T in (('pl', PL), ('it', IT)):
    out = []
    for slug, (why, ideas, hook, n, g) in T.items():
        assert len(ideas) == 3, slug
        v = dict(n=n, g=g, why=why, hook=hook, li='\n'.join('<li>%s</li>' % x for x in ideas))
        tp = TPL[lang]
        h = slug + '-map-print'
        body = put_notes(tp['body'] % v, NOTES[h][lang])
        out.append({'page': h, 'locale': lang,
                    't': {'title': tp['title'] % v, 'body_html': body,
                          'meta_title': tp['meta_title'] % v, 'meta_description': tp['meta_description'] % v},
                    'lede': tp['lede'] % v})
    txt = json.dumps(out, ensure_ascii=False)
    assert not re.search('[–—]', txt), 'dash'
    (ROOT / 'tools' / 'i18n' / 'shopify' / ('cities-%s.json' % lang)).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(lang, len(out), 'max meta', max(len(x['t']['meta_description']) for x in out))
