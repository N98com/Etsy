"""Add (or replace) language blocks in js/i18n.js.
    python3 mk_designer.py                         sv, nb from src_designer.py
    python3 mk_designer.py src_designer_plit pl it pl, it from src_designer_plit.py"""
import json, re, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'i18n'))
import importlib
MOD, LANGS = (sys.argv[1], tuple(sys.argv[2:])) if len(sys.argv) > 2 else ('src_designer', ('sv', 'nb'))
S = importlib.import_module(MOD)
keys = json.loads(subprocess.check_output(['node', '-e', r'''
const fs=require('fs');const src=fs.readFileSync(process.argv[1],'utf8');
const a=src.indexOf('var DICTS = ');const b=src.indexOf('var MONTHS');
const m={exports:{}};new Function('module',src.slice(a,b)+';module.exports=DICTS;')(m);
console.log(JSON.stringify(Object.keys(m.exports.nl)));''', str(ROOT / 'js' / 'i18n.js')]))
assert len(keys) == len(S.R), (len(keys), len(S.R))
js = (ROOT / 'js' / 'i18n.js').read_text(encoding='utf-8')
for lang in LANGS:
    js = re.sub(r'\n    %s: \{.*?\n    \},?(?=\n)' % lang, '', js, flags=re.S)
    js = re.sub(r"\n    %s: \[.*?\],?(?=\n)" % lang, '', js, flags=re.S)
for i, lang in enumerate(LANGS):
    body = ',\n'.join('      %s: %s' % (json.dumps(k, ensure_ascii=False), json.dumps(r[i], ensure_ascii=False)) for k, r in zip(keys, S.R))
    a = js.index('\n  };\n  var MONTHS')
    js = js[:a] + ',\n    %s: {\n%s\n    }' % (lang, body) + js[a:]
    a = js.index('\n  };\n  var PATTERNS')
    js = js[:a] + ',\n    %s: %s' % (lang, json.dumps(S.MONTHS[lang], ensure_ascii=False)) + js[a:]
    a = js.index('\n  };\n  var dict = DICTS[lang]')
    js = js[:a] + ',\n    %s: %s' % (lang, S.PATTERNS[lang]) + js[a:]
(ROOT / 'js' / 'i18n.js').write_text(js, encoding='utf-8')
print('ok', len(keys))
