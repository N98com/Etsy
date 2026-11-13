# Swedish and Norwegian: product, options, menu links.
import json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
M = {}
M['gid://shopify/Product/15894559293823'] = {
 'sv': {'title': 'Kartprint efter din design',
  'body_html': '<p>Din plats, ritad som ett kartprint av konstkvalitet. Välj plats, stil, ord och storlek i vår studio. Varje tryck görs på beställning, med fri frakt till Europa, Storbritannien och USA.</p><p><strong>Papper &amp; tryck</strong><br>Premium matt papper, 200 g/m², 0,22 mm tjockt. Slät yta utan reflexer. FSC certifierat eller likvärdigt papper. Tryckt ända ut i kanten, i standardstorlekar för ramar.</p><p><strong>Ram (valfri)</strong><br>Ram av massiv furu i svart, vitt, naturträ eller mörkt trä, 2 till 2,5 cm djup, med splitterfritt plexiglas framför. Levereras inramad och redo att hängas upp, upphängningssats ingår. Eller välj bara trycket och rama in det själv.</p><p><strong>Produktsäkerhet (EU GPSR)</strong><br>Tillverkare: Gelato, Dronning Eufemias gate 8, 0191 Oslo, Norge, support@gelato.com<br>Ålder: för vuxna<br>Garanti (konsumentköp): 2 år</p>',
  'product_type': 'Kartprint',
  'meta_title': 'Kartprint efter din design: personlig stadskarta som affisch',
  'meta_description': 'Designa ett kartprint av platsen som betyder något: din stad, din gata, där ni träffades. Fler än 50 paletter, hjärta eller cirkel, dina egna ord. Med eller utan ram, fri frakt.'},
 'nb': {'title': 'Kartplakat etter ditt design',
  'body_html': '<p>Ditt sted, tegnet som en kartplakat av kunstkvalitet. Velg sted, stil, ord og størrelse i studioet vårt. Hvert trykk lages på bestilling, med gratis frakt til Europa, Storbritannia og USA.</p><p><strong>Papir &amp; trykk</strong><br>Premium matt papir, 200 g/m², 0,22 mm tykt. Glatt overflate uten gjenskinn. FSC sertifisert eller tilsvarende papir. Trykket helt ut i kanten, i standard rammestørrelser.</p><p><strong>Ramme (valgfri)</strong><br>Ramme av massiv furu i svart, hvitt, naturtre eller mørkt tre, 2 til 2,5 cm dyp, med knusesikkert pleksiglass foran. Leveres innrammet og klar til å henges opp, opphengssett inkludert. Eller velg bare trykket og ramm det inn selv.</p><p><strong>Produktsikkerhet (EU GPSR)</strong><br>Produsent: Gelato, Dronning Eufemias gate 8, 0191 Oslo, Norge, support@gelato.com<br>Alder: for voksne<br>Garanti (forbrukerkjøp): 2 år</p>',
  'product_type': 'Kartplakat',
  'meta_title': 'Kartplakat etter ditt design: personlig bykart som plakat',
  'meta_description': 'Design en kartplakat av stedet som betyr noe: byen din, gaten din, der dere møttes. Over 50 paletter, hjerte eller sirkel, dine egne ord. Med eller uten ramme, gratis frakt.'}}
simple = {
 'gid://shopify/ProductOption/18593109475711': ('Storlek', 'Størrelse'),
 'gid://shopify/ProductOption/18813018177919': ('Ram', 'Ramme'),
}
values = {
 'gid://shopify/ProductOptionValue/14146813854079': ('Utan ram', 'Uten ramme'),
 'gid://shopify/ProductOptionValue/14146813886847': ('Svart', 'Svart'),
 'gid://shopify/ProductOptionValue/14146813919615': ('Vit', 'Hvit'),
 'gid://shopify/ProductOptionValue/14146813952383': ('Naturträ', 'Naturtre'),
 'gid://shopify/ProductOptionValue/14146813985151': ('Mörkt trä', 'Mørkt tre'),
}
links = {
 '863985041791': ('Sök', 'Søk'), '876890227071': ('Designa din karta', 'Design kartet ditt'), '876890292607': ('Presenter', 'Gaver'),
 '877249986943': ('Dina integritetsval', 'Dine personvernvalg'), '877775520127': ('Designa din karta', 'Design kartet ditt'),
 '877775552895': ('Inspiration', 'Inspirasjon'), '877775585663': ('Presenter', 'Gaver'), '877775618431': ('Storlekar & ramar', 'Størrelser & rammer'),
 '877775651199': ('Vår historia', 'Vår historie'), '877775683967': ('Så fungerar det', 'Slik fungerer det'), '877775716735': ('Frågor', 'Spørsmål'),
 '877775749503': ('Frakt & returer', 'Frakt & retur'), '863985009023': ('Kontakt', 'Kontakt'), '876890325375': ('Kontakt', 'Kontakt'), '877775782271': ('Kontakt', 'Kontakt'),
}
out = []
for i, l in enumerate(('sv', 'nb')):
    for k, d in M.items(): out.append({'id': k, 'locale': l, 't': d[l]})
    for k, v in {**simple, **values}.items(): out.append({'id': k, 'locale': l, 't': {'name': v[i]}})
    for k, v in links.items(): out.append({'id': 'gid://shopify/Link/' + k, 'locale': l, 't': {'title': v[i]}})
s = json.dumps(out, ensure_ascii=False); assert not re.search('[–—]', s)
(ROOT / 'tools' / 'i18n' / 'shopify' / 'misc-svnb.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(out))
