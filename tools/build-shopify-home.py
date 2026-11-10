#!/usr/bin/env python3
"""Maak de Shopify-versie van de landingspagina uit home.html.

    python3 tools/build-shopify-home.py

Schrijft:
  shopify/sections/n98-maps-home.liquid  — de hele pagina als één thema-sectie
  shopify/templates/index.json           — homepage-template met alleen die sectie

home.html blijft de bron: pas daar iets aan en draai dit script opnieuw.
Verschillen met de losse pagina:
  - aankondiging/header/footer (tussen chrome:start/end) vallen weg: die
    levert het Shopify-thema zelf;
  - afbeeldingen komen uit de thema-assets (assets/n98-<naam>.jpg);
  - alle "Design your map"-knoppen gaan naar de configurator-productpagina
    (product-handle instelbaar in de thema-editor);
  - het nieuwsbriefformulier wordt Shopify's eigen klantformulier (tag
    "newsletter"), zodat inschrijvingen echt in Shopify binnenkomen.
"""
import json
import os, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "home.html"
OUT_SECTION = ROOT / "shopify" / "sections" / "n98-maps-home.liquid"
OUT_TEMPLATE = ROOT / "shopify" / "templates" / "index.json"
DEFAULT_HANDLE = "design-your-map"

html = SRC.read_text(encoding="utf-8")

# 1. alleen de pagina-inhoud: van <div class="n98h"> tot vlak voor </body>
start = html.index('<div class="n98h">')
end = html.rindex("</body>")
body = html[start:end].rstrip()

# 2. thema levert header/footer/aankondiging zelf
body = re.sub(r"\s*<!--chrome:start-->.*?<!--chrome:end-->", "", body, flags=re.S)

# 3. nieuwsbrief -> Shopify-klantformulier
newsletter = """{%- form 'customer', id: 'n98h-newsletter' -%}
          <input type="hidden" name="contact[tags]" value="newsletter">
          {%- if form.posted_successfully? -%}
            <p class="msg">Thank you, you're on the list.</p>
          {%- else -%}
            <label for="n98h-email-{{ section.id }}" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Email address</label>
            <input id="n98h-email-{{ section.id }}" type="email" name="contact[email]" placeholder="Your email address" autocomplete="email" required>
            <button type="submit">Subscribe</button>
            {%- if form.errors -%}<p class="msg">{{ form.errors.translated_fields.email | capitalize }} {{ form.errors.messages.email }}</p>{%- endif -%}
          {%- endif -%}
        {%- endform -%}"""
body, n = re.subn(r"<!--newsletter:start-->.*?<!--newsletter:end-->", newsletter, body, flags=re.S)
assert n == 1, "newsletter block not found"

# 4. afbeeldingen uit de thema-assets
images = sorted(set(re.findall(r'src="img/home/([a-z0-9-]+\.jpg)"', body)))
body = re.sub(r'src="img/home/([a-z0-9-]+\.jpg)"', lambda m: "src=\"{{ 'n98-" + m.group(1) + "' | asset_url }}\"", body)

# 5. knoppen naar de configurator-productpagina
body = body.replace('href="shop.html"', 'href="{{ n98_configurator_url }}"')
body = body.replace('data-shop-url="shop.html"', 'data-shop-url="{{ n98_configurator_url }}"')
# potlood-hero: de opgenomen lijnen staan op GitHub Pages (Shopify-assets kennen geen .json)
import subprocess
_trace_commit = subprocess.run(['git', 'log', '-1', '--format=%H', '--', 'img/home'], capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__)) + '/..').stdout.strip()
_trace_bases = '{{ n98_app_url | split: \'shop.html\' | first }}img/home/'
if _trace_commit:
    _trace_bases += ' https://cdn.jsdelivr.net/gh/N98com/Etsy@%s/img/home/ https://raw.githubusercontent.com/N98com/Etsy/%s/img/home/' % (_trace_commit, _trace_commit)
body = body.replace('data-trace-base="img/home/"', 'data-trace-base="' + _trace_bases + '"')
# hero: de kaartmotor op GitHub Pages in hero-modus (tekent steden, zoekt plekken)
body = body.replace('data-src="shop.html?hero=1"', 'data-src="{{ n98_app_url }}?hero=1&v={{ \'now\' | date: \'%Y%m%d%H\' }}"')
_check = re.sub(r'data-trace-base="[^"]*"', "", body).replace("|| 'img/home/'", "")
left = re.findall(r".{50}(?:shop\.html|img/).{30}", _check)
assert not left, "unconverted links left: " + repr(left)

schema = {
    "name": "N°98 Maps home",
    "tag": "section",
    "class": "n98-maps-home",
    "settings": [
        {
            "type": "text",
            "id": "configurator_handle",
            "label": "Configurator product (handle)",
            "default": DEFAULT_HANDLE,
            "info": "All 'Design your map' buttons go to /products/<this handle>.",
        },
        {
            "type": "text",
            "id": "app_url",
            "label": "Map designer address (hero)",
            "default": "https://n98com.github.io/Etsy/shop.html",
            "info": "The homepage hero draws maps with the designer on this address.",
        }
    ],
    "presets": [{"name": "N°98 Maps home"}],
}

section = f"""{{%- comment -%}}
  N°98 Maps — landingspagina. GEGENEREERD uit home.html door
  tools/build-shopify-home.py; pas home.html aan en draai het script opnieuw.
{{%- endcomment -%}}
{{%- liquid
  assign n98_handle = section.settings.configurator_handle | default: '{DEFAULT_HANDLE}'
  assign n98_configurator_url = routes.root_url | append: '/products/' | append: n98_handle | replace: '//', '/'
  assign n98_app_url = section.settings.app_url | default: 'https://n98com.github.io/Etsy/shop.html'
-%}}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Hanken+Grotesk:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400&display=swap">
{body}

{{% schema %}}
{json.dumps(schema, indent=2, ensure_ascii=False)}
{{% endschema %}}
"""

template = {"sections": {"n98_maps_home": {"type": "n98-maps-home", "settings": {}}}, "order": ["n98_maps_home"]}

OUT_SECTION.parent.mkdir(parents=True, exist_ok=True)
OUT_TEMPLATE.parent.mkdir(parents=True, exist_ok=True)
OUT_SECTION.write_text(section, encoding="utf-8")
OUT_TEMPLATE.write_text(json.dumps(template, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT_SECTION.relative_to(ROOT)} ({len(section)} bytes)")
print(f"wrote {OUT_TEMPLATE.relative_to(ROOT)}")
print("theme assets needed:", ", ".join(f"assets/n98-{i}" for i in images))
