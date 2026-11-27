"""Removes the UK from shipping texts (fixed rules in rules.json) in the repo sources.
python3 tools/no_uk/apply.py [--dry]"""
import json, sys, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
RULES = json.loads((ROOT / 'tools/no_uk/rules.json').read_text(encoding='utf-8'))
def fix(s):
    for a, b in RULES: s = s.replace(a, b)
    # JSON-escaped forms (e.g. ’, é) inside json files
    for a, b in RULES:
        ea, eb = json.dumps(a)[1:-1], json.dumps(b)[1:-1]
        if ea != a: s = s.replace(ea, eb)
    return s
files = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split()
skip = ('tools/home-renders/designs.json', 'tools/no_uk/')
n = 0
for f in files:
    if f.startswith(skip) or not f.endswith(('.js', '.json', '.jsonl', '.liquid', '.py', '.html', '.md', '.txt')): continue
    p = ROOT / f
    try: s = p.read_text(encoding='utf-8')
    except Exception: continue
    t = fix(s)
    if t != s:
        n += 1; print(f)
        if '--dry' not in sys.argv: p.write_text(t, encoding='utf-8')
print(n, 'files')
