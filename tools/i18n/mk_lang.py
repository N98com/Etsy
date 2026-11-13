"""Build tools/i18n/<lang>.json for sv and nb from src_<lang>.py (values in the key order of nl.json)."""
import importlib, json, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
nl = json.loads((HERE / 'nl.json').read_text(encoding='utf-8'))
keys = list(nl['text'])
for lang in sys.argv[1:] or ['sv', 'nb']:
    m = importlib.import_module('src_' + lang)
    assert len(m.V) == len(keys), (lang, len(m.V), len(keys))
    raw_src = nl['raw']['n98-maps-home.liquid']
    raw = [[raw_src[0][0], m.RAW_H1]] + [[raw_src[i + 1][0], v] for i, v in enumerate(m.RAW)]
    assert len(raw) == len(raw_src)
    out = {'text': dict(zip(keys, m.V)), 'raw': {'n98-maps-home.liquid': raw}}
    (HERE / (lang + '.json')).write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(lang, len(keys))
