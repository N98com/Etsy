"""Translations of text stored in theme settings (announcement bar, 404, cart, ...).
These live per theme in Shopify, so run this again for every new theme copy:
  python3 tools/i18n/theme_content.py <theme_id> [<theme_id> ...]  -> prints GraphQL mutation + variables
"""
import json, sys
D = {  # resource, key, digest, {lang: value}
 ('OnlineStoreThemeSectionGroup/header-group', 'section.sections/header-group.json.header_announcements_9jGBFp.announcement_BxgCk9.text:pmxvxwkljjsj', '38fa17f437218945b689c7777b0924b538525519111e2f63bb3153a5a24e7d2c'): dict(
  nl='Op bestelling gedrukt · Gratis verzending in de EU, het VK en de VS',
  de='Auf Bestellung gedruckt · Kostenloser Versand in der EU, in Großbritannien und in den USA',
  fr='Imprimée à la commande · Livraison offerte dans l’UE, au Royaume-Uni et aux États-Unis',
  sv='Tryckt på beställning · Fri frakt inom EU, Storbritannien och USA',
  nb='Trykket på bestilling · Gratis frakt i EU, Storbritannia og USA',
  pl='Drukowane na zamówienie · Darmowa wysyłka w UE, Wielkiej Brytanii i USA', it='Stampata su ordinazione · Spedizione gratuita in UE, Regno Unito e Stati Uniti'),
 ('OnlineStoreThemeJsonTemplate/404', 'section.404.json.main.text_GqmVFf.text:2i368gao346xo', 'b93488eca6e606b6a169db2c12d968d2d973b6f2e7db9fbb3d077565131c3f40'): dict(
  nl='<h1>Pagina niet gevonden</h1>', de='<h1>Seite nicht gefunden</h1>', fr='<h1>Page introuvable</h1>',
  sv='<h1>Sidan hittades inte</h1>', nb='<h1>Siden ble ikke funnet</h1>',
  pl='<h1>Nie znaleziono strony</h1>', it='<h1>Pagina non trovata</h1>'),
 ('OnlineStoreThemeJsonTemplate/404', 'section.404.json.main.text_Ua9XAW.text:10io0lm5gwd3m', '7bd80c0e6b47cedca869c33808957de9636b15c2670d9eda0bfdb8fe028b878a'): dict(
  nl='<p>De link klopt misschien niet, of de pagina is verwijderd.</p>',
  de='<p>Der Link ist vielleicht falsch, oder die Seite wurde entfernt.</p>',
  fr='<p>Le lien est peut-être erroné, ou la page a été supprimée.</p>',
  sv='<p>Länken kan vara fel, eller så har sidan tagits bort.</p>',
  nb='<p>Lenken kan være feil, eller siden er fjernet.</p>',
  pl='<p>Link może być błędny albo strona została usunięta.</p>', it='<p>Il link potrebbe essere sbagliato, oppure la pagina è stata rimossa.</p>'),
 ('OnlineStoreThemeJsonTemplate/404', 'section.404.json.main.button_PAQMwR.label:30ry970vkw0bt', '264a224fd18a1bf56b080cb6e2087555c6144c482f7a2e3322662e90eaf1bbfe'): dict(
  nl='Verder winkelen', de='Weiter einkaufen', fr='Continuer mes achats', sv='Fortsätt handla', nb='Fortsett å handle',
  pl='Kontynuuj zakupy', it='Continua lo shopping'),
 ('OnlineStoreThemeJsonTemplate/404', 'section.404.json.product_list_iA96Tq.static-header__text_WJEa9Q.text:3gwqztskn9i3u', '1caf96190faf3e967a675afe76f4bbb422cc79ab95ba6d2e48d6a2e24e2e3317'): dict(
  nl='<p>Ontdek iets nieuws</p>', de='<p>Entdecke etwas Neues</p>', fr='<p>Découvrez quelque chose de nouveau</p>',
  sv='<p>Upptäck något nytt</p>', nb='<p>Oppdag noe nytt</p>',
  pl='<p>Odkryj coś nowego</p>', it='<p>Scopri qualcosa di nuovo</p>'),
 ('OnlineStoreThemeJsonTemplate/cart', 'section.cart.json.cart-section.cart-page-title.title:ffson5e94pnq', '6d2d59aed44f1efab446c09e60a3da7794ed1e652cd88d0a67914e72d1f9eae8'): dict(
  nl='Winkelwagen', de='Warenkorb', fr='Panier', sv='Varukorg', nb='Handlekurv',
  pl='Koszyk', it='Carrello'),
 ('OnlineStoreThemeJsonTemplate/list-collections', 'section.list-collections.json.collection_list_Wfgh3m.group_4FtiAg__text_fRMQMR.text:1vvq2zaj6zyve', '883500fc3d16ebcd07ab4a930c5b655208eb188c20e5a49bad4c7b2a328c288c'): dict(
  nl='<h1>Collecties</h1>', de='<h1>Kollektionen</h1>', fr='<h1>Collections</h1>', sv='<h1>Kollektioner</h1>', nb='<h1>Kolleksjoner</h1>',
  pl='<h1>Kolekcje</h1>', it='<h1>Collezioni</h1>'),
 ('OnlineStoreThemeJsonTemplate/page.contact', 'section.page.contact.json.form.contact_form_UwiCkQ__submit-button.label:1691dx6kcaglv', '155f816c0407310c0dab222493370773e045ee7fe04e6c9a951b07f495531264'): dict(
  nl='Versturen', de='Senden', fr='Envoyer', sv='Skicka', nb='Send',
  pl='Wyślij', it='Invia'),
 ('OnlineStoreThemeJsonTemplate/password', 'section.password.json.main.text.text:24k3p54lm9141', 'c61a4dd3e94705dee937af3aaefe01a07e37a5825801a3405face6fb9099f8cd'): dict(
  nl='<h1>Binnenkort open</h1>', de='<h1>Bald geöffnet</h1>', fr='<h1>Ouverture prochaine</h1>', sv='<h1>Öppnar snart</h1>', nb='<h1>Åpner snart</h1>',
  pl='<h1>Wkrótce otwarcie</h1>', it='<h1>Apertura a breve</h1>'),
 ('OnlineStoreThemeJsonTemplate/password', 'section.password.json.main.text-2.text:2z5rzsvzqixb2', 'a54bebffd4293878f7e0155b24df7cb656ffabfd25fa287db0edd2087b680f51'): dict(
  nl='<p>Schrijf je in voor onze nieuwsbrief en hoor als eerste wanneer we opengaan.</p>',
  de='<p>Melde dich für unseren Newsletter an und erfahre als Erstes, wann wir starten.</p>',
  fr='<p>Inscrivez-vous à notre newsletter pour savoir en premier quand nous ouvrons.</p>',
  sv='<p>Prenumerera på vårt nyhetsbrev och få veta först när vi öppnar.</p>',
  nb='<p>Meld deg på nyhetsbrevet vårt og få vite først når vi åpner.</p>',
  pl='<p>Zapisz się do naszego newslettera i dowiedz się pierwszy, kiedy ruszamy.</p>', it='<p>Iscriviti alla nostra newsletter e scopri per primo quando apriamo.</p>'),
 ('OnlineStoreThemeJsonTemplate/password', 'section.password.json.main.email-signup.label:2frgv6ufbt1g0', '5e2b8e96503d722e7ebf61b9bc3e9988e1ec7fd4eabcf25a52577f845125b31e'): dict(
  nl='Inschrijven', de='Anmelden', fr='S’inscrire', sv='Prenumerera', nb='Meld deg på',
  pl='Zapisz się', it='Iscriviti'),
 ('OnlineStoreThemeJsonTemplate/product', 'section.product.json.main.disclosures_g9mWze.heading:167y68so16c79', '6fd148a14be1d00a1b0d91f099374f670a06f1dc964758d465a72d2ef3980457'): dict(
  nl='Goed om te weten', de='Gut zu wissen', fr='Bon à savoir', sv='Bra att veta', nb='Greit å vite',
  pl='Dobrze wiedzieć', it='Buono a sapersi'),
 ('OnlineStoreThemeJsonTemplate/product', 'section.product.json.product_recommendations_qggXJq.text_cbcgyb.text:26lmab1lb8sv0', 'b772ae16501374e8b55af2b23ab292910d52e761a5c6bf1ca23943679b01de7e'): dict(
  nl='<h3>Misschien ook iets voor jou</h3>', de='<h3>Das könnte dir auch gefallen</h3>', fr='<h3>Vous aimerez peut-être aussi</h3>',
  sv='<h3>Du kanske också gillar</h3>', nb='<h3>Du liker kanskje også</h3>',
  pl='<h3>Może Ci się też spodobać</h3>', it='<h3>Potrebbe piacerti anche</h3>'),
}
for (_, _, _), v in D.items():
    for t in v.values():
        assert '—' not in t and '–' not in t, t
if __name__ == '__main__':
    groups = {}
    for theme in sys.argv[1:]:
        for (res, key, dig), v in D.items():
            rid = f'gid://shopify/{res}?theme_id={theme}'
            groups.setdefault(rid, []).extend(
                dict(locale=l, key=key, value=t, translatableContentDigest=dig) for l, t in v.items())
    parts, defs, vars_ = [], [], {}
    for i, (rid, tr) in enumerate(groups.items()):
        defs.append(f'$r{i}: ID!, $t{i}: [TranslationInput!]!')
        parts.append(f'a{i}: translationsRegister(resourceId: $r{i}, translations: $t{i}) {{ userErrors {{ field message }} translations {{ key locale }} }}')
        vars_[f'r{i}'] = rid; vars_[f't{i}'] = tr
    print(json.dumps(dict(query='mutation(' + ', '.join(defs) + ') { ' + ' '.join(parts) + ' }', variables=vars_), ensure_ascii=False))
