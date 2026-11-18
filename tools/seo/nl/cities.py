# Dutch municipalities with 50,000+ inhabitants (CBS, 1 Jan 2026, provisional) plus Twente,
# as a page per recognisable town. (slug, name, province code, geocode query, municipality)
# Provinces: gr fy dr ov fl ge ut nh zh ze nb li
NEW = [
 # Noord-Holland
 ('hoofddorp','Hoofddorp','nh','Hoofddorp','Haarlemmermeer'),
 ('zaandam','Zaandam','nh','Zaandam','Zaanstad'),
 ('alkmaar','Alkmaar','nh','Alkmaar','Alkmaar'),
 ('purmerend','Purmerend','nh','Purmerend','Purmerend'),
 ('amstelveen','Amstelveen','nh','Amstelveen','Amstelveen'),
 ('hilversum','Hilversum','nh','Hilversum','Hilversum'),
 ('heerhugowaard','Heerhugowaard','nh','Heerhugowaard','Dijk en Waard'),
 ('hoorn','Hoorn','nh','Hoorn, Noord-Holland','Hoorn'),
 ('ijmuiden','IJmuiden','nh','IJmuiden','Velsen'),
 ('bussum','Bussum','nh','Bussum','Gooise Meren'),
 ('den-helder','Den Helder','nh','Den Helder','Den Helder'),
 # Zuid-Holland
 ('naaldwijk','Naaldwijk','zh','Naaldwijk','Westland'),
 ('alphen-aan-den-rijn','Alphen aan den Rijn','zh','Alphen aan den Rijn','Alphen aan den Rijn'),
 ('spijkenisse','Spijkenisse','zh','Spijkenisse','Nissewaard'),
 ('schiedam','Schiedam','zh','Schiedam','Schiedam'),
 ('voorburg','Voorburg','zh','Voorburg','Leidschendam-Voorburg'),
 ('gouda','Gouda','zh','Gouda','Gouda'),
 ('vlaardingen','Vlaardingen','zh','Vlaardingen','Vlaardingen'),
 ('hellevoetsluis','Hellevoetsluis','zh','Hellevoetsluis','Voorne aan Zee'),
 ('capelle-aan-den-ijssel','Capelle aan den IJssel','zh','Capelle aan den IJssel','Capelle aan den IJssel'),
 ('katwijk','Katwijk','zh','Katwijk aan Zee','Katwijk'),
 ('rijswijk','Rijswijk','zh','Rijswijk, Zuid-Holland','Rijswijk'),
 ('pijnacker','Pijnacker','zh','Pijnacker','Pijnacker-Nootdorp'),
 ('berkel-en-rodenrijs','Berkel en Rodenrijs','zh','Berkel en Rodenrijs','Lansingerland'),
 ('oud-beijerland','Oud-Beijerland','zh','Oud-Beijerland','Hoeksche Waard'),
 # Utrecht
 ('veenendaal','Veenendaal','ut','Veenendaal','Veenendaal'),
 ('nieuwegein','Nieuwegein','ut','Nieuwegein','Nieuwegein'),
 ('zeist','Zeist','ut','Zeist','Zeist'),
 ('maarssen','Maarssen','ut','Maarssen','Stichtse Vecht'),
 ('vianen','Vianen','ut','Vianen, Utrecht','Vijfheerenlanden'),
 ('woerden','Woerden','ut','Woerden','Woerden'),
 ('houten','Houten','ut','Houten','Houten'),
 ('driebergen','Driebergen','ut','Driebergen-Rijsenburg','Utrechtse Heuvelrug'),
 # Gelderland
 ('ede','Ede','ge','Ede, Gelderland','Ede'),
 ('doetinchem','Doetinchem','ge','Doetinchem','Doetinchem'),
 ('barneveld','Barneveld','ge','Barneveld','Barneveld'),
 ('harderwijk','Harderwijk','ge','Harderwijk','Harderwijk'),
 ('zutphen','Zutphen','ge','Zutphen','Zutphen'),
 # Noord-Brabant
 ('helmond','Helmond','nb','Helmond','Helmond'),
 ('oss','Oss','nb','Oss','Oss'),
 ('cuijk','Cuijk','nb','Cuijk','Land van Cuijk'),
 ('veghel','Veghel','nb','Veghel','Meierijstad'),
 ('roosendaal','Roosendaal','nb','Roosendaal','Roosendaal'),
 ('bergen-op-zoom','Bergen op Zoom','nb','Bergen op Zoom','Bergen op Zoom'),
 ('uden','Uden','nb','Uden','Maashorst'),
 ('oosterhout','Oosterhout','nb','Oosterhout, Noord-Brabant','Oosterhout'),
 ('waalwijk','Waalwijk','nb','Waalwijk','Waalwijk'),
 # Limburg
 ('venlo','Venlo','li','Venlo','Venlo'),
 ('sittard','Sittard','li','Sittard','Sittard-Geleen'),
 ('heerlen','Heerlen','li','Heerlen','Heerlen'),
 ('roermond','Roermond','li','Roermond','Roermond'),
 ('weert','Weert','li','Weert','Weert'),
 # Overijssel
 ('deventer','Deventer','ov','Deventer','Deventer'),
 ('almelo','Almelo','ov','Almelo','Almelo'),
 ('hengelo','Hengelo','ov','Hengelo, Overijssel','Hengelo'),
 ('hardenberg','Hardenberg','ov','Hardenberg','Hardenberg'),
 ('kampen','Kampen','ov','Kampen, Overijssel','Kampen'),
 # Twente
 ('borne','Borne','ov','Borne, Overijssel','Borne'),
 ('oldenzaal','Oldenzaal','ov','Oldenzaal','Oldenzaal'),
 ('haaksbergen','Haaksbergen','ov','Haaksbergen','Haaksbergen'),
 ('losser','Losser','ov','Losser','Losser'),
 ('rijssen','Rijssen','ov','Rijssen','Rijssen-Holten'),
 ('nijverdal','Nijverdal','ov','Nijverdal','Hellendoorn'),
 ('goor','Goor','ov','Goor','Hof van Twente'),
 ('vriezenveen','Vriezenveen','ov','Vriezenveen','Twenterand'),
 ('tubbergen','Tubbergen','ov','Tubbergen','Tubbergen'),
 ('ootmarsum','Ootmarsum','ov','Ootmarsum','Dinkelland'),
 ('wierden','Wierden','ov','Wierden','Wierden'),
 # Drenthe
 ('emmen','Emmen','dr','Emmen, Drenthe','Emmen'),
 ('assen','Assen','dr','Assen','Assen'),
 ('hoogeveen','Hoogeveen','dr','Hoogeveen','Hoogeveen'),
 # Friesland
 ('sneek','Sneek','fy','Sneek','Súdwest-Fryslân'),
 ('drachten','Drachten','fy','Drachten','Smallingerland'),
 ('heerenveen','Heerenveen','fy','Heerenveen','Heerenveen'),
 ('joure','Joure','fy','Joure','De Fryske Marren'),
 # Groningen
 ('hoogezand','Hoogezand','gr','Hoogezand','Midden-Groningen'),
 # Flevoland
 ('lelystad','Lelystad','fl','Lelystad','Lelystad'),
 ('emmeloord','Emmeloord','fl','Emmeloord','Noordoostpolder'),
 # Zeeland
 ('terneuzen','Terneuzen','ze','Terneuzen','Terneuzen'),
 ('middelburg','Middelburg','ze','Middelburg, Zeeland','Middelburg'),
]
OLD_PROV = {'amsterdam':'nh','rotterdam':'zh','the-hague':'zh','utrecht':'ut','eindhoven':'nb','groningen':'gr','tilburg':'nb',
 'almere':'fl','breda':'nb','nijmegen':'ge','apeldoorn':'ge','arnhem':'ge','haarlem':'nh','enschede':'ov','amersfoort':'ut',
 'den-bosch':'nb','zwolle':'ov','leiden':'zh','zoetermeer':'zh','leeuwarden':'fy','maastricht':'li','dordrecht':'zh','delft':'zh'}
if __name__ == '__main__':
    print(len(NEW), len({c[0] for c in NEW}))
