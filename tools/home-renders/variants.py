#!/usr/bin/env python3
"""N°98 Maps: add a version of every render per language to designs.json.

The words on the prints (place, country, gift words) are written in the
language of the visitor: n98-<id>--nl.jpg, --de.jpg, --fr.jpg. Names come
from tools/i18n/places.json. Run after editing the English designs:

    python3 tools/home-renders/variants.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
LANGS = ['nl', 'de', 'fr']
PLACES = json.loads((HERE.parent / 'i18n' / 'places.json').read_text(encoding='utf-8'))


def tr(text, lang):
    return ' · '.join(PLACES.get(p, {}).get(lang, p) for p in text.split(' · '))


def main():
    f = HERE / 'designs.json'
    base = [d for d in json.loads(f.read_text(encoding='utf-8')) if '--' not in d['id']]
    out = []
    for d in base:
        out.append(d)
        if d.get('crop'):
            continue  # close-up without words
        for lang in LANGS:
            v = dict(d, id=d['id'] + '--' + lang, place=tr(d['place'], lang), country=tr(d['country'], lang))
            v.pop('trace', None)  # the pencil drawing has no words, the English one is reused
            out.append(v)
    f.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(len(base), 'designs,', len(out), 'renders')


if __name__ == '__main__':
    main()
