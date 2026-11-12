// N°98 Maps: translations of the designer (shop.html).
// The language comes from ?lang=xx (the Shopify section passes the shop language).
// English is the source: every text node and the attributes aria-label, title,
// placeholder and alt are looked up in the dictionary below, also when the
// designer adds or changes texts later (MutationObserver). Data that ends up ON
// the poster (gift words, month names) is translated in shop.js with N98T().
// Adding a language: add a block to DICTS (and MONTHS), nothing else.
(function () {
  'use strict';
  var m = /[?&]lang=([a-z]{2})(?:-[A-Za-z]+)?\b/.exec(location.search);
  var lang = m ? m[1] : 'en';
  var DICTS = {
    nl: {
      // steps
      'Place': 'Plek', 'Colours': 'Kleuren', 'Shape': 'Vorm', 'Text': 'Tekst', 'Pins': 'Pins', 'Size': 'Formaat', 'Style': 'Stijl',
      'Steps': 'Stappen', 'Back': 'Terug', 'Add to cart': 'In winkelwagen', 'Skip, no pins': 'Overslaan, geen pins',
      'Design your map, step by step': 'Ontwerp je kaart, stap voor stap',
      'Where shall we': 'Waar zullen we', 'draw?': 'tekenen?',
      'Search a city, a street or an address, then drag and zoom until the framing feels right. Check the words below: you can change them right here.': 'Zoek een stad, een straat of een adres en sleep en zoom tot het goed voelt. Kijk de woorden hieronder na: je kunt ze hier meteen aanpassen.',
      'Search a city, a street or the address of a doorstep, then drag and zoom until the framing feels right.': 'Zoek een stad, een straat of het adres van een voordeur en sleep en zoom tot het goed voelt.',
      'Choose your': 'Kies je', 'colours': 'kleuren', 'palette': 'palet',
      'Each palette is composed to live on a wall. You can still drag the map.': 'Elk palet is gemaakt om aan de muur te hangen. Je kunt de kaart nog steeds verslepen.',
      'Each palette is composed to live on a wall. Your map changes the moment you choose.': 'Elk palet is gemaakt om aan de muur te hangen. Je kaart verandert meteen als je kiest.',
      'Shape &': 'Vorm &', 'layout': 'opmaak', 'Layout &': 'Opmaak &', 'shape': 'vorm',
      'Give your map a shape and a layout. Drag the map so nothing important falls away.': 'Geef je kaart een vorm en een opmaak. Versleep de kaart zodat er niets belangrijks wegvalt.',
      'Make the words': 'Maak de woorden', 'yours': 'van jou', 'Make it': 'Maak hem', 'personal': 'persoonlijk',
      'Choose a typeface, a text size and, if you like, your own colour.': 'Kies een lettertype, een tekstgrootte en, als je wilt, je eigen kleur.',
      'Keep the place name we found, or write your own: a name, a date, a line that matters.': 'Houd de plaatsnaam die we vonden, of schrijf je eigen woorden: een naam, een datum, een zin die ertoe doet.',
      'Mark where it': 'Markeer waar het', 'happened': 'gebeurde',
      'Optional. Choose an icon, then tap the spot on the map. You can drag it afterwards.': 'Niet verplicht. Kies een icoon en tik dan op de plek op de kaart. Je kunt hem daarna nog verslepen.',
      'Choose an icon, then tap the spot on the map. You can drag it afterwards.': 'Kies een icoon en tik dan op de plek op de kaart. Je kunt hem daarna nog verslepen.',
      'Size &': 'Formaat &', 'frame': 'lijst', 'size': 'formaat',
      'Eight gallery sizes, as a print or in a solid pine frame that arrives ready to hang.': 'Acht galerieformaten, als losse print of in een lijst van massief grenen, klaar om op te hangen.',
      'Printed to order in eight gallery sizes, as a print or in a solid wood frame that arrives ready to hang. The preview takes the exact shape of the size you choose.': 'Op bestelling gedrukt in acht galerieformaten, als losse print of in een lijst van massief hout, klaar om op te hangen. De preview krijgt precies de vorm van het formaat dat je kiest.',
      'Mark a special spot': 'Markeer een bijzondere plek', 'optional': 'niet verplicht',
      // preview
      'Live preview of your map': 'Live preview van je kaart', 'Preview mode': 'Weergave', 'Studio': 'Studio', 'On the wall': 'Aan de muur',
      'Enlarge the map': 'Kaart vergroten', 'Close the enlarged map': 'Vergrote kaart sluiten', 'Done': 'Klaar',
      'Your map, framed and to scale on a dark green wall': 'Je kaart, ingelijst en op schaal aan een donkergroene muur',
      'Your map': 'Je kaart', 'Drag to move · Pinch or scroll to zoom': 'Sleep om te verplaatsen · Knijp of scroll om te zoomen',
      'Show the map larger': 'Toon de kaart groter', 'Show larger': 'Groter tonen',
      'Shown to scale · Switch to Studio to move the map': 'Op schaal getoond · Ga naar Studio om de kaart te verplaatsen',
      'Drawing your map…': 'Je kaart wordt getekend…',
      'We couldn\'t load this area. Try zooming in a little, or search again.': 'We konden dit gebied niet laden. Zoom iets in, of zoek opnieuw.',
      'Map fixed · Tap the map to place a pin': 'Kaart staat vast · Tik op de kaart om een pin te zetten',
      'Map fixed · Go back to step 1 to move it': 'Kaart staat vast · Ga terug naar stap 1 om hem te verplaatsen',
      // place
      'Search for a place': 'Zoek een plek', 'e.g. Paris, France': 'bijv. Amsterdam, Nederland', 'Search': 'Zoeken',
      'Searching…': 'Zoeken…', 'Nothing found.': 'Niets gevonden.',
      'Your map will say': 'Op je kaart komt te staan',
      'Title': 'Titel', 'Place name (automatic)': 'Plaatsnaam (automatisch)', 'State / province': 'Provincie of staat',
      'State / province (automatic)': 'Provincie of staat (automatisch)', 'State or province': 'Provincie of staat',
      'Subtitle': 'Ondertitel', 'Country (automatic)': 'Land (automatisch)', 'Coordinates': 'Coördinaten',
      // colours
      'Palette groups': 'Paletgroepen', 'Solid colours': 'Effen kleuren', 'Background colour': 'Achtergrondkleur',
      'Choose my own text colour': 'Kies zelf een tekstkleur', 'Text colour': 'Tekstkleur',
      // shape
      'Layout': 'Opmaak', 'None': 'Geen', 'Circle': 'Cirkel', 'Heart': 'Hart', 'Diamond': 'Ruit', 'Hexagon': 'Zeshoek',
      'Frame': 'Lijst', 'Layout: Frame': 'Kader', 'Fade': 'Vervaging', 'Gallery': 'Galerie', 'Stamp': 'Stempel', 'Ledger': 'Strook',
      // text
      'Typeface': 'Lettertype', 'Text size': 'Tekstgrootte', 'Small': 'Klein', 'Medium': 'Middel', 'Large': 'Groot',
      'Fine-tune each line': 'Elke regel apart afstellen', 'Default': 'Standaard',
      'Change the words': 'Verander de woorden', 'Tap the words you like': 'Tik op de woorden die je mooi vindt',
      'More words': 'Meer woorden', 'Or type your own': 'Of typ je eigen woorden', '+ Add a date': '+ Voeg een datum toe',
      'Add a date': 'Voeg een datum toe', 'Remove the date': 'Datum weghalen', 'Date style': 'Datumnotatie',
      // pins
      'Place a pin on the map': 'Zet een pin op de kaart', 'Remove pins': 'Pins weghalen', 'Pin colour': 'Pinkleur',
      'Your letters, e.g. B&M': 'Je letters, bijv. B&M', 'Letters (up to 3: A–Z, 0–9, &)': 'Letters (maximaal 3: A tot Z, 0 tot 9, &)',
      'Pin size': 'Pingrootte', 'Tap "Place a pin", then tap the spot on the map. You can drag it afterwards.': 'Tik op "Zet een pin" en tik dan op de plek op de kaart. Je kunt hem daarna nog verslepen.',
      '…or type an address': '…of typ een adres', '…or type the address': '…of typ het adres', 'Pin address': 'Adres van de pin', 'Add': 'Toevoegen',
      'Your pin': 'Je pin', 'Your pins': 'Je pins', 'Remove this pin': 'Deze pin weghalen', 'Tap the map…': 'Tik op de kaart…', 'Click the map…': 'Klik op de kaart…',
      'Basic': 'Pin', 'House': 'Huisje', 'Heart pin': 'Hartpin', 'Rings': 'Ringen', 'Paw': 'Pootje', 'Tree': 'Boom', 'Star': 'Ster', 'Letters': 'Letters',
      'This address is outside your map. Go back to step 1 and move the map to include it.': 'Dit adres valt buiten je kaart. Ga terug naar stap 1 en verschuif de kaart zodat het erop past.',
      // size & frame
      'Sizes': 'Formaten', 'Print only': 'Alleen print', 'No frame': 'Zonder lijst', 'Black': 'Zwart', 'White': 'Wit',
      'Natural wood': 'Naturel hout', 'Dark wood': 'Donker hout', 'wooden, ready to hang': 'hout, klaar om op te hangen',
      'solid pine, ready to hang': 'massief grenen, klaar om op te hangen',
      'In the box': 'In de doos', 'Solid pine frame': 'Lijst van massief grenen', ', 2 cm deep, built to last': ', 2 cm diep, gemaakt om lang mee te gaan',
      'Shatterproof plexiglass': 'Onbreekbaar plexiglas', 'in front: clear, light and safe on any wall': 'ervoor: helder, licht en veilig aan elke muur',
      'Heavyweight 200 gsm matte paper': 'Stevig mat papier van 200 gsm', ', FSC certified, with no glare': ', FSC gecertificeerd, zonder glans',
      'Hanging kit included, for portrait or landscape': 'Ophangset inbegrepen, staand of liggend',
      'Hook attached on the back, ready for the wall': 'Haakje zit al aan de achterkant, klaar voor de muur',
      'A stand on the back, so it can also sit on a shelf': 'Een standaard op de achterkant, zodat hij ook op een plank kan staan',
      'Arrives ready to hang, no framer needed': 'Komt klaar om op te hangen, geen lijstenmaker nodig',
      'Our promise': 'Onze belofte', 'Free shipping': 'Gratis verzending', 'across Europe, the UK and the US': 'in Europa, het VK en de VS',
      'A new print': 'Een nieuwe print', 'if it arrives damaged or wrong': 'als hij beschadigd of verkeerd aankomt',
      'Made to give.': 'Gemaakt om te geven.', 'A gift they keep for decades, not a season': 'Een cadeau dat ze jarenlang bewaren, niet één seizoen',
      'Paper': 'Papier', 'print': 'druk', 'Premium matte, 200 gsm (80 lb)': 'Premium mat, 200 gsm', 'Finish': 'Afwerking',
      'Smooth, non-reflective surface': 'Glad oppervlak zonder glans', 'Thickness': 'Dikte', 'Sustainability': 'Duurzaamheid',
      'FSC-certified or equivalent paper': 'FSC gecertificeerd of gelijkwaardig papier', 'Format': 'Formaat',
      'Edge to edge, made to standard frame sizes': 'Tot aan de rand, op standaard lijstmaten', 'Optional, solid wood, ready to hang': 'Optioneel, massief hout, klaar om op te hangen',
      'Product safety (EU GPSR)': 'Productveiligheid (EU GPSR)', 'Manufacturer': 'Fabrikant', 'Address': 'Adres',
      'Dronning Eufemias gate 8, 0191 Oslo, Norway': 'Dronning Eufemias gate 8, 0191 Oslo, Noorwegen', 'Age': 'Leeftijd', 'For adults': 'Voor volwassenen',
      'Warranty': 'Garantie', '2 years (consumer sales)': '2 jaar (consumentenkoop)', 'Contact': 'Contact',
      // cart
      'Free shipping in Europe, the UK and the US · Your preview is the exact file we print': 'Gratis verzending in Europa, het VK en de VS · Je preview is precies het bestand dat we drukken',
      'Printed to order · Free shipping in Europe, the UK and the US': 'Op bestelling gedrukt · Gratis verzending in Europa, het VK en de VS',
      'Added to your cart': 'Toegevoegd aan je winkelwagen', 'Beautifully': 'Prachtig', 'chosen.': 'gekozen.',
      'View cart': 'Bekijk winkelwagen', 'checkout': 'afrekenen', 'View cart & checkout': 'Bekijk winkelwagen en reken af',
      'Design another map': 'Ontwerp nog een kaart',
      'Your design stays on screen as a starting point. Change the place, words or size, and add it as a new print.': 'Je ontwerp blijft staan als startpunt. Verander de plek, de woorden of het formaat en voeg hem toe als nieuwe print.',
      'Opening your cart…': 'Je winkelwagen gaat open…', 'Design your next map. Your first one is safe in the cart.': 'Ontwerp je volgende kaart. De eerste ligt veilig in je winkelwagen.',
      'Your map is still being drawn, one moment please.': 'Je kaart wordt nog getekend, een ogenblik.',
      'Something went wrong. Please try again.': 'Er ging iets mis. Probeer het opnieuw.',
      'Something went wrong preparing your design. Please try again.': 'Er ging iets mis bij het klaarmaken van je ontwerp. Probeer het opnieuw.',
      'Preparing preview…': 'Preview wordt klaargemaakt…', 'White border around the print': 'Witte rand rond de print',
      // gifts
      'A wedding gift': 'Een huwelijkscadeau', 'A new home': 'Een nieuw huis', 'An anniversary': 'Een jubileum', 'A new baby': 'Een geboorte',
      'Valentine\'s Day': 'Valentijnsdag', 'In memory': 'Ter nagedachtenis',
      'Search the place where you said yes. We have set the words for you.': 'Zoek de plek waar jullie ja zeiden. De woorden hebben we al voor je klaargezet.',
      'Search the address of the new home. We have set the words for you.': 'Zoek het adres van het nieuwe huis. De woorden hebben we al voor je klaargezet.',
      'Search the place where your story began. We have set the words and a heart for you.': 'Zoek de plek waar jullie verhaal begon. De woorden en een hart hebben we al voor je klaargezet.',
      'Search the place where your little one was born. We have set the words for you.': 'Zoek de plek waar jullie kleintje geboren is. De woorden hebben we al voor je klaargezet.',
      'Search the place where you met. We have set the words and a heart for you.': 'Zoek de plek waar jullie elkaar ontmoetten. De woorden en een hart hebben we al voor je klaargezet.',
      'Search a place that holds their memory. We have set the words for you.': 'Zoek een plek die de herinnering vasthoudt. De woorden hebben we al voor je klaargezet.',
      // more
      'A city, a street, an address…': 'Een stad, een straat, een adres…', 'All': 'Alle', 'Light': 'Licht', 'Colourful': 'Kleurrijk',
      'Dark & Gold': 'Donker & goud', 'Night': 'Nacht', 'Palette': 'Palet', 'Paper & print': 'Papier & druk', 'Free': 'Gratis', 'Shipping': 'Verzending',
      'Bespoke map prints': 'Kaartprints op maat', 'Netherlands · Est. 2026': 'Nederland · Sinds 2026',
      'The map sits above a plain mat that holds the caption.': 'De kaart staat boven een effen passe-partout met de tekst.',
      'Full-bleed map. The caption sits directly on it, over a dark fade at the bottom.': 'Kaart tot aan de rand. De tekst staat er direct op, boven een donkere vervaging onderaan.',
      'Like Frame, with a thin frame line and museum-label rules around the caption.': 'Zoals Kader, met een dunne kaderlijn en museumlijnen rond de tekst.',
      'Full-bleed map with a small captioned label tucked in the bottom-left corner.': 'Kaart tot aan de rand met een klein label met tekst linksonder.',
      'Full-bleed map with a slim, left-aligned caption strip along the bottom edge.': 'Kaart tot aan de rand met een smalle tekststrook langs de onderrand.',
      // words on the poster (also used by N98T in shop.js)
      'Where we met': 'Waar we elkaar ontmoetten', 'Where we said yes': 'Waar we ja zeiden', 'Our first home': 'Ons eerste huis',
      'Where you were born': 'Waar je geboren bent', 'Where it all began': 'Waar het allemaal begon',
      'Home is wherever you are': 'Thuis is waar jij bent', 'Forever in our hearts': 'Voor altijd in ons hart'
    }
  };
  var MONTHS = {
    nl: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
  };
  var PATTERNS = {
    nl: [
      [/^Next: (.+)$/, function (m, t) { return 'Volgende: ' + t(m[1]); }],
      [/^Step ([IVX]+|\d+) of ([IVX]+|\d+)$/, function (m) { return 'Stap ' + m[1] + ' van ' + m[2]; }],
      [/^Your pins \((\d+)\)$/, function (m) { return 'Je pins (' + m[1] + ')'; }],
      [/^View cart \((\d+)\) & checkout$/, function (m) { return 'Bekijk winkelwagen (' + m[1] + ') en reken af'; }],
      [/^Remove (.+)$/, function (m, t) { return t(m[1]) + ' weghalen'; }],
      [/^Letters “(.*)”\. Drag them to move, or type new letters below\.$/, function (m) { return 'Letters “' + m[1] + '”. Sleep ze om te verplaatsen, of typ hieronder nieuwe letters.'; }],
      [/^(.+) pin\. Drag it to move it, or pick another icon to change it\.$/, function (m, t) { return t(m[1]) + ': sleep om te verplaatsen, of kies een ander icoon om te wisselen.'; }],
      [/^(Tap|Click) a pin to select it, or drag it to move it\.$/, function (m) { return (m[1] === 'Tap' ? 'Tik' : 'Klik') + ' op een pin om hem te kiezen, of sleep hem om hem te verplaatsen.'; }],
      [/^Step (\d+): (.+)$/, function (m, t) { return 'Stap ' + m[1] + ': ' + t(m[2]); }],
      [/^Search failed: (.*)$/, function (m) { return 'Zoeken mislukt: ' + m[1]; }]
    ]
  };
  var dict = DICTS[lang];
  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function T(s) {
    if (!dict || s == null) return s;
    var k = norm(String(s));
    if (Object.prototype.hasOwnProperty.call(dict, k)) return dict[k];
    var pats = PATTERNS[lang] || [];
    for (var i = 0; i < pats.length; i++) {
      var mm = pats[i][0].exec(k);
      if (mm) return pats[i][1](mm, T);
    }
    return s;
  }
  window.N98_LANG = lang;
  window.N98T = T;
  window.N98Months = MONTHS[lang] || null;
  if (!dict) return;
  document.documentElement.lang = lang;

  var SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|CANVAS|SVG)$/;   // no text inside these
  var NOATTR = /^(SCRIPT|STYLE)$/;
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  function skipped(el) {
    return el && el.closest && el.closest('[data-no-i18n], .gift-preview, .gift-chips, .location-search-results, #searchResults');
  }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || !/[A-Za-z]{2}/.test(v)) return;
    var t = T(v);
    if (t !== v) {
      var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
      n.nodeValue = lead + t + trail;
    }
  }
  function doEl(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute && el.getAttribute(ATTRS[i]);
      if (a && /[A-Za-z]{2}/.test(a)) { var t = T(a); if (t !== a) el.setAttribute(ATTRS[i], t); }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root.parentElement) && !SKIP.test(root.parentElement ? root.parentElement.nodeName : '')) doText(root); return; }
    if (root.nodeType !== 1 || NOATTR.test(root.nodeName.toUpperCase()) || skipped(root)) return;
    if (SKIP.test(root.nodeName.toUpperCase())) { doEl(root); return; }
    doEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (skipped(n) || NOATTR.test(n.nodeName.toUpperCase())) return NodeFilter.FILTER_REJECT;
          if (SKIP.test(n.nodeName.toUpperCase())) { doEl(n); return NodeFilter.FILTER_REJECT; }
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  function start() {
    walk(document.body);
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === 'characterData') { if (!skipped(r.target.parentElement)) doText(r.target); }
        else if (r.type === 'attributes') { if (!skipped(r.target)) doEl(r.target); }
        else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
