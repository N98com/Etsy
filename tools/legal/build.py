"""Shop policies (refund, shipping, terms) in all languages.
python3 tools/legal/build.py  -> out/policies.json  (en bodies for shopPolicyUpdate, translations per locale)"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from policies_en import P as EN, UPDATED
from policies_nl_de import P as NLDE
from policies_fr import P as FR
from policies_svnb import P as SVNB
from policies_plit import P as PLIT
from contact import C as CONTACT
P = {**EN, **NLDE, **FR, **SVNB, **PLIT}
for _l, _b in CONTACT.items():
    P[_l] = {**P[_l], 'CONTACT_INFORMATION': _b}
LANGS = ['en', 'nl', 'de', 'fr', 'sv', 'nb', 'pl', 'it']
out = {}
for l in LANGS:
    for k, v in P[l].items():
        body = v + f'\n<p><em>{UPDATED[l]}</em></p>'
        assert '—' not in body and '–' not in body, (l, k)
        tags = re.findall(r'<(/?)(h2|p|a|em)\b', body)
        assert tags.count(('', 'p')) == tags.count(('/', 'p')), (l, k)
        assert re.findall(r'<(h2|p)\b', body) == re.findall(r'<(h2|p)\b', P['en'][k] + '<p>'), (l, k, 'structure')
        out.setdefault(k, {})[l] = body
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
json.dump(out, open(os.path.join(os.path.dirname(__file__), 'out', 'policies.json'), 'w'), ensure_ascii=False, indent=1)
json.dump([{'type': k, 'body': v['en']} for k, v in out.items()], open(os.path.join(os.path.dirname(__file__), 'out', 'shopify-en.json'), 'w'), ensure_ascii=False, indent=1)
print({k: {l: len(b) for l, b in v.items()} for k, v in out.items()})
