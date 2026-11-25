"""Contact information policy (Shopify CONTACT_INFORMATION) in every language."""
MAIL = '<a href="mailto:info@n98maps.com">info@n98maps.com</a>'
KVK = '42231154'
ADDR = 'Geelster 3<br>7577 GE Oldenzaal<br>'
C = {
'en': f"""<h2>Company details</h2>
<p>N°98 Maps<br>{ADDR}The Netherlands</p>
<p>Chamber of Commerce (KvK): {KVK}</p>
<h2>Contact</h2>
<p>Email: {MAIL}<br>Website: n98maps.com</p>
<p>We aim to reply within 2 working days. This is our business address and not a shop: orders are made online only.</p>""",
'nl': f"""<h2>Bedrijfsgegevens</h2>
<p>N°98 Maps<br>{ADDR}Nederland</p>
<p>Kamer van Koophandel (KvK): {KVK}</p>
<h2>Contact</h2>
<p>E-mail: {MAIL}<br>Website: n98maps.com</p>
<p>We reageren meestal binnen 2 werkdagen. Dit is ons bedrijfsadres en geen winkel: bestellen kan alleen online.</p>""",
'de': f"""<h2>Firmenangaben</h2>
<p>N°98 Maps<br>{ADDR}Niederlande</p>
<p>Niederländische Handelskammer (KvK): {KVK}</p>
<h2>Kontakt</h2>
<p>E-Mail: {MAIL}<br>Website: n98maps.com</p>
<p>Wir antworten in der Regel innerhalb von 2 Werktagen. Dies ist unsere Geschäftsadresse und kein Ladengeschäft: Bestellungen sind nur online möglich.</p>""",
'fr': f"""<h2>Informations sur l’entreprise</h2>
<p>N°98 Maps<br>{ADDR}Pays-Bas</p>
<p>Chambre de commerce néerlandaise (KvK) : {KVK}</p>
<h2>Contact</h2>
<p>E-mail : {MAIL}<br>Site web : n98maps.com</p>
<p>Nous répondons en général sous 2 jours ouvrés. Il s’agit de notre adresse professionnelle et non d’une boutique : les commandes se font uniquement en ligne.</p>""",
'sv': f"""<h2>Företagsuppgifter</h2>
<p>N°98 Maps<br>{ADDR}Nederländerna</p>
<p>Nederländska handelskammaren (KvK): {KVK}</p>
<h2>Kontakt</h2>
<p>E-post: {MAIL}<br>Webbplats: n98maps.com</p>
<p>Vi svarar oftast inom 2 arbetsdagar. Detta är vår företagsadress och ingen butik: beställningar görs endast online.</p>""",
'nb': f"""<h2>Firmaopplysninger</h2>
<p>N°98 Maps<br>{ADDR}Nederland</p>
<p>Det nederlandske handelskammeret (KvK): {KVK}</p>
<h2>Kontakt</h2>
<p>E-post: {MAIL}<br>Nettsted: n98maps.com</p>
<p>Vi svarer vanligvis innen 2 virkedager. Dette er vår forretningsadresse og ingen butikk: bestillinger gjøres kun på nett.</p>""",
}
