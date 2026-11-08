# Projektprüfung und vorläufige Architekturentscheidungen

Stand: 2026-11-07

## Geprüftes Grobkonzept

Eine lokale WebApp importiert eine Excel-Arbeitsmappe, normalisiert ihre Angaben in ein bearbeitbares Genogramm, ergänzt manuelle Eingaben und erzeugt später einen skalierbaren Druckexport. Echte Familiendaten sollen ausschließlich in der laufenden App vorkommen; im Repository liegen nur synthetische Beispiele.

## Empfehlungen

### UI und Typisierung

React + TypeScript ist eine passende Basis für zustandsreiche Formulare, Importvorschau und interaktive Diagramme. TypeScript-Typen sollten fachliche Datentypen und Schnittstellen sichern; Importdaten sind bis zur Laufzeitvalidierung dennoch als nicht vertrauenswürdig zu behandeln. Komponenten sollten Darstellung/Interaktion enthalten, während Import, Fachregeln, Persistenz und Layout in getrennten Modulen bleiben.

### Lokale Persistenz

SQLite WASM + OPFS ist für relationale, lokal persistierte Daten plausibel. SQLite dokumentiert OPFS-Zugriff über Worker und mehrere VFS-Varianten mit unterschiedlichen Anforderungen. Einige Varianten benötigen SharedArrayBuffer und COOP/COEP; Mehrtabzugriff hat Sperr- und Konkurrenzgrenzen. OPFS braucht einen sicheren Kontext und unterliegt dem browserspezifischen Speicherquota. Vor einer Festlegung ist ein kleiner Kompatibilitätsprototyp sinnvoll.

Mindestanforderungen: Datenbankfehler nicht verschlucken; Quota-/OPFS-Ausfall sichtbar behandeln; Speicher nach Reload wiederöffnen; nutzerkontrollierten Export/Import einer Sicherung vorsehen; keine Annahme treffen, dass Browserablage ein Backup oder automatisch verschlüsselt ist. Konkrete Verschlüsselung ist eine offene Produktentscheidung und darf nicht als Schutzversprechen formuliert werden, bevor Schlüsselverwaltung und Wiederherstellung entworfen sind.

### Vorläufiges Excel-Format (aus Beschreibung und Screenshot)

Die fachliche Grundidee ist verständlich: Eine Zeile beschreibt einen Nachkommen in einer Generation entlang eines Abstammungspfads der Familie A; am Ende können dessen angeheirateter Partner und der Familienname des Familien-A-Mitglieds stehen. Leere Zellen in früheren Generationen setzen den zuvor begonnenen Pfad fort. Importiert werden muss dieses Format einmalig; danach kann die App mit ihrem eigenen, normalisierten Modell und später ggf. einem einfacheren Austauschformat arbeiten.

Der Screenshot zeigt acht sichtbare Spalten, nicht sechs:

| Screenshot-Spalte | Sichtbarer Inhalt | Vorläufige Bedeutung |
| --- | --- | --- |
| A–E | `Name Generation 1` bis `Name Generation 5` | Mitglied der Familie A auf dem Pfad bis zur jeweiligen Generation; es gibt keine Generation 6 |
| F | `Datum der Eheschließung` | Eheschließungsangabe zur Person dieser Zeile und dem Partner in G |
| G | `Ehepartner` | angeheirateter Partner, der aus einer anderen Familie stammt |
| H | `Familienname` | Familienname des Familien-A-Mitglieds; Screenshot-Überschrift `Familienname`, Beispielzelle `Nachname` |

Geklärt: Es gibt fünf Generationenspalten (A–E), keine Generation 6. Die zuvor als sechste Spalte gezählte Spalte F enthält bereits das Eheschließungsdatum; G ist Ehepartner und H Familienname.

**Zeilenhierarchie:** Mehrere Kinder derselben Eltern werden nacheinander in derselben Generationenspalte aufgeführt. Beispiel: Ein Eintrag in Generation 2 kann direkte Elternzeile sein; auf die folgenden Generation-3-Einträge folgen deren Geschwister, ebenfalls in Generation 3. Wenn anschließend wieder ein Generation-2-Eintrag kommt, ist dieser ein Geschwister des vorherigen Generation-2-Eintrags. Das entspricht einer hierarchischen Zeilenfolge: Ein Wechsel zu einer kleineren Generationsnummer schließt den tieferen Zweig; Einträge der nächsttieferen Generation gehören zum zuletzt offenen Elternpaar. Der Parser sollte daraus explizite Eltern-Kind-Links ableiten und Mehrdeutigkeiten in einer Importvorschau anzeigen.

Das konkretisierte Screenshot-Beispiel stützt diese Lesart: Generation 1 enthält A; in Generation 2 folgen B und später C als Geschwister. Unter B steht zunächst dessen Generation-3-Zweig; nach dem Wechsel zurück zu Generation 2 beginnt Cs Zweig mit einem eigenen Generation-3-Eintrag. Die wiederholten Generation-4-/5-Zeilen illustrieren weitere Nachkommen. Zusätze wie „Sohn von A“ / „Tochter von A“ sind nur erläuternde Beschriftungen im Screenshot, keine Namensbestandteile. Die Datei ist zeilenweise systematisch aufgebaut; der Import orientiert sich an Zellen und Reihenfolge. Die Zeilenfarben wirken im Screenshot wie visuelle Orientierung; bis zu einer anderslautenden Bestätigung werden sie nicht als Datenquelle behandelt.

**Eheschließung:** `∞ 1924` bedeutet verheiratet, Eheschließung 1924. Ein alleinstehendes `∞` bedeutet verheiratet, Datum unbekannt. Ohne Jahres- oder Datumsangabe bleibt das Datum unbekannt; leeres F bedeutet daher nicht „unverheiratet“. Bei bekannter Ehe soll grundsätzlich ein Name in G stehen. Ein Ehepartnername ohne Eheindikator oder ein Eheindikator ohne Partnername sollte als Inkonsistenz zur Prüfung angezeigt werden, nicht stillschweigend ergänzt werden.

### Geprüfte Eingabedatei

Die vom Nutzer abgelegte Beispieldatei wurde lokal strukturell geprüft. Die Datei selbst bleibt in `input/`, das von Git ignoriert wird. Es wurden keine Zellinhalte mit Namen oder Datumswerten ausgegeben oder in dieses Repository kopiert.

- Eine Tabelle, acht Spalten, Kopfzeile in der ersten Zeile, danach 17 nicht-leere Datensätze; keine leeren Zwischenzeilen.
- Alle 17 Datensätze haben genau eine befüllte Generationsspalte. Die Tiefenverteilung ist 1 Person in Generation 1, 2 in Generation 2, 2 in Generation 3, 6 in Generation 4 und 6 in Generation 5.
- Familienname-Spalte H ist pro Datensatz befüllt.
- Elf Datensätze enthalten sowohl Partner in G als auch eine Eheschließungsangabe in F; sechs enthalten beides nicht. In dieser Datei gibt es keine Zeile mit nur einem der beiden Felder.
- Die elf Eheschließungsangaben sind Textwerte mit `∞` (U+221E); drei enthalten zusätzlich eine Jahreszahl und acht nur das Symbol. Excel interpretiert sie also nicht als Datumszellen.
- Personenzellen sind Text. Fünf enthalten jeweils zwei vollständige Datumswerte im Muster `TT.MM.JJJJ`; die übrigen zwölf enthalten in der geprüften Version keine zwei extrahierbaren Datumswerte und brauchen eine nicht-invasive manuelle Prüfung im Importdialog.

Das reicht für einen ersten deterministischen Zeilenparser: Kopfzeile überspringen; pro Datenzeile genau eine Generation verlangen; nächsttiefere Generation an den zuletzt offenen Eintrag der vorherigen Generation hängen; Abstieg beendet tiefere Zweige; F/G gemeinsam als optionale Partnerschaft interpretieren. Alle geparsten Felder bleiben in einer Vorschau korrigierbar. Farben werden nicht gelesen.

### Importvorschau und erstes internes Modell

Der Parser liest `.xlsx` lokal in einem separaten Worker. Er validiert die acht erwarteten Kopfzeilen, verlangt pro Zeile genau eine Generationenspalte und ordnet Nachkommen anhand der direkt vorherigen Generation zu. Ein Generationssprung ohne Elternzeile blockiert die Übernahme. Datumswerte im Personentext werden nur bei genau zwei gültigen Werten im bekannten Tagesformat automatisch getrennt. Das `∞`-Zeichen setzt Ehestatus „verheiratet“; ein Jahr wird mit Jahresgenauigkeit gespeichert, nicht zu einem erfundenen Tag ergänzt. Nicht erkannte Texte bleiben in der Vorschau bearbeitbar.

Vor der Übernahme zeigt die App die Zeilen, vorgeschlagene Verwandtschaft und Prüfhilfen. Name, Familienname, Geburts-/Todesdatum, Partnername und Eheschließung lassen sich korrigieren. Fehler blockieren, Hinweise erfordern eine bewusste Bestätigung. Es wird nur eine Tabellenblatt-Vorschau verarbeitet (das erste Blatt); mehrere Blätter werden angezeigt und ihre Auswahl ist eine spätere Verbesserung. Die Quelldatei wird weder in OPFS noch in SQLite abgelegt.

Das erste versionierte SQLite-Modell enthält:

- `genogram`: ein importierter Fall mit neutralem Standardtitel;
- `person`: Name, optionaler Familienname und optionale Geburts-/Todesdaten mit Genauigkeit (`day` oder `year`);
- `partnership`: zwei Personen, Status (`married` oder `unknown`) und optionales Datum mit Genauigkeit;
- `parent_child`: gerichtete Eltern-Kind-Verbindung, deren Typ zunächst `unspecified` bleibt, weil die Eingabedatei keine biologische/adoptive/Pflege-Art unterscheidet.

Ein Kind wird mit dem vorherigen Familien-A-Mitglied und – falls dessen Zeile einen Partner enthält – auch mit diesem Partner verknüpft. Es wird keine Geschlechts- oder biologische Beziehung aus Namen oder Positionen abgeleitet. Jeder vollständige Import wird atomar gespeichert. Vor produktivem Einsatz sind im Zielbrowser insbesondere das OPFS-Neuöffnen nach Reload und der Umgang mit parallelen Tabs noch praktisch zu prüfen.

Personenzellen können Vorname und Geburts-/Todesdatum enthalten. Das Beispiel `TT.MM.JJJ-TT.MM.JJJJ` muss noch mit synthetischen Mustern präzisiert werden: Trennzeichen, optionale/unbekannte Daten, Jahreszahlen ohne Tag/Monat, lebende Personen und mehrteilige Vor-/Nachnamen. Familiennamen stehen separat in H und müssen beim Import regelbasiert dem Familien-A-Mitglied zugeordnet werden.

Beim Import sollte die Datei lokal ausgewählt werden. Ablauf: Arbeitsmappe lesen → erkannte Tabellen/Spalten zeigen → Werte normalisieren → Zeilenfehler und Warnungen ausweisen → Zusammenfassung zur Übernahme bestätigen → Daten in einer Transaktion anlegen. Bei späteren Importen müssen Dublettenstrategie und Aktualisieren-vs.-Ergänzen definiert sein. Bibliothekswahl und endgültiges Feldmapping warten auf die synthetische Beispieldatei. Beispieldateien werden erfunden und vor dem Commit geprüft.

**Manuelle Klärung ist vorgesehen:** Der Parser darf unsichere Namen, Beziehungen oder Datumswerte nicht erraten und stillschweigend als korrekt speichern. Die Importvorschau muss vorgeschlagene Zuordnungen editierbar machen, Warnungen und blockierende Fehler unterscheiden und Korrekturen vor der Übernahme ermöglichen. Erst nach expliziter Bestätigung werden die validierten Datensätze atomar in die saubere Zielstruktur geschrieben. Rohzeilen und ursprüngliche Zellwerte sind Import-Eingaben, nicht das dauerhafte Fachmodell; ob eine Importdatei nach erfolgreicher Übernahme temporär oder gar nicht gespeichert wird, wird bei der konkreten Umsetzung entschieden.

**Ziel der Normalisierung:** Personen erhalten stabile interne IDs; Familienname, Geburts-/Todesangaben, Partnerschaften und Eltern-Kind-Beziehungen werden als getrennte fachliche Felder/Datensätze gespeichert. Die Zeilenreihenfolge der Excel-Datei wird nur als Importhinweis genutzt und nicht zur Laufzeit als Beziehung interpretiert. Datenqualität und Herkunft einzelner Angaben sollen sich soweit praktikabel nachvollziehen lassen, ohne die Quelldatei oder unnötige sensible Inhalte dauerhaft zu behalten.

### Fachliches Modell und Notation

Genogrammnotation ist in der Praxis verbreitet, jedoch nicht für jeden Kontext universell festgelegt. Das Modell sollte deshalb semantische Fakten von grafischen Symbolen trennen. Ein sinnvoller Startpunkt umfasst:

- Personen mit stabiler interner ID und optionalen Namen, Datumsangaben, Identitäts-/Geschlechtsangaben sowie Lebensstatus;
- typisierte Eltern-Kind-Verbindungen (biologisch, adoptiv, Pflege, unbekannt oder erweiterbar), nicht nur starre Vater-/Mutter-Spalten;
- Partnerschaften/Unionen als eigenständige Datensätze mit Typ, Zeitraum und Status;
- optionale emotionale/soziale Beziehungen und freie Annotationen, mit klarer Sichtbarkeit und Legende;
- Quellen, Unsicherheitsgrad und Notizen nur, wenn der konkrete Anwendungsfall sie benötigt;
- getrennte Layoutdaten (Position, Gruppierung, Seiten-/Ansichtseinstellungen), damit Neu-Layout die Fachdaten nicht verändert.

GEDCOM 7 eignet sich als später zu prüfendes Austauschformat genealogischer Kerndaten. Genogramm-spezifische Beziehungen oder klinische Annotationen lassen sich möglicherweise nicht verlustfrei übertragen; Import/Export muss Verluste klar benennen.

### Genogramm-Notation aus der Recherche (2026-11-08)

Das gezeigte Grundbild kombiniert mehrere semantisch verschiedene Dinge: Personensymbole (klassisch Quadrat/Kreis), Partnerschaftsstatus und -datum, Eltern-/Geschwisterlinien, Todesmarkierung, einen gestrichelten Haushalt-Umriss sowie freie Kontextnotizen. Eine emotionale Beziehungslinie wäre eine weitere, davon getrennte Ebene. Diese Konzepte sollten im Modell getrennte Daten und im Diagramm unterscheidbare Linien/Symbole bleiben.

Es gibt verbreitete Konventionen, aber keine vollständig einheitliche Notation für alle Genogramm-Kontexte. GenoPro weist selbst auf Varianten zwischen Autoren hin. Praxisleitfäden empfehlen deshalb eine sichtbare Legende, die alle im konkreten Diagramm verwendeten Formen und Linien erklärt. Wir sollten uns an verbreiteten Grundformen orientieren, die Konvention benennen und eine Legende ausgeben – nicht behaupten, dass jedes Genogramm dieselbe Notation verwendet.

**Empfohlener Ausbau in Stufen:**

1. **Strukturelles Genogramm:** Personen als eigenständige Symbole, Partnerschaft/Union als horizontale Verbindung, Kinderlinie und Geschwisterbalken darunter. Kinder bleiben an der konkreten Eltern-Union. Geburtstodesmarkierung, Eheschließungsjahr und bekannte Geschwisterreihenfolge werden nur aus expliziten Daten gezeigt. Bei fehlender Reihenfolge bleibt die Importreihenfolge erhalten.
2. **Explizite Personenmerkmale:** Optionales, unbekanntes, weibliches, männliches und ggf. nichtbinäres Symbol-Mapping; Indexperson doppelt umranden. Das aktuelle Excel enthält hierfür keine Daten, daher bleibt das Symbol zunächst neutral und kann nicht aus Vorname, Familienname oder Ehepartner-Spalte erschlossen werden. GEDCOM 7 unterscheidet ausdrücklich biologisches Geschlecht bei Geburt von Gender-Identität und warnt davor, Geschlecht/Rollen aus Partnerpositionen abzuleiten.
3. **Beziehungszustände:** Partnerschaftstyp und Zeitraum (z. B. verheiratet, zusammenlebend, getrennt, geschieden, verwitwet, unbekannt) explizit speichern. Der vorhandene Datentyp `married | unknown` reicht für eine reichere Legende noch nicht.
4. **Haushalt und Elternschaft:** Haushaltszugehörigkeit als eigene, optional zeitbezogene Mitgliedschaft modellieren; ein gestrichelter Umriss zeigt Zusammenleben und nicht Abstammung. Eltern-Kind-Art (biologisch, Adoption, Pflege, Stief-/soziale Elternschaft, unbekannt) erhält eigene Linien-/Datensemantik.
5. **Optionale Beziehungsebene:** Emotionale/soziale Beziehungen und Kontextangaben wie Beruf oder bedeutsame Ereignisse nur als gesonderte, ein-/ausblendbare Ebene ergänzen. Sie dürfen nicht mit Abstammungs- oder Partnerschaftskanten verwechselt werden. Sensible klinische Angaben brauchen einen eigenen Produkt-/Datenschutzentscheid.

Für die Umsetzung eignet sich eine vektorbasierte Diagrammschicht (z. B. SVG) mit getrennten Renderern für Personen, Unionen, Kindschaft, Haushalt und optionale Beziehungen. Eine Legende muss aus genau den aktivierten Symbolen erzeugt werden. PDF sollte diese Vektoren übernehmen und nicht aus einem Screenshot der UI entstehen. Das ist eine Architektur-Empfehlung aus den Skalierungs-/Druckzielen, kein Genogramm-Standard.

**Recherchequellen:** GenoPro beschreibt Grundsymbole sowie die abweichenden Regeln von Autor zu Autor ([Symbole](https://genopro.com/genogram/symbols/), [Layoutregeln](https://genopro.com/genogram/rules/)); Research in Practice zeigt u. a. Symbole für nichtbinäre Personen, Haushalt, Partnerschaft, Elternschaft und Adoption und verlangt eine verständliche Legende ([Praxisleitfaden, S. 12–13](https://www.researchinpractice.org.uk/media/mkydyt3f/cf_pt_using-genograms-in-practice_final.pdf)); ein Genogramm-Kapitel im US-Gesundheits-/Sozialdienst-Handbuch zeigt Haushaltsumrisse, Kinderreihenfolge und Beziehungsarten ([NCBI Bookshelf, Appendix 6-A](https://www.ncbi.nlm.nih.gov/books/NBK64093/)); GEDCOM 7 ist dagegen ein genealogisches Austauschformat, kein Genogramm-Zeichenstandard, und definiert `SEX` als Geschlecht bei Geburt ([Spezifikation](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html)).

### Diagramm und Druck

Der erste PDF-Prototyp ist jetzt vorhanden: eine eigene, maßbasierte SVG-Druckansicht wird unabhängig von Bildschirmzoom und Scrollposition erzeugt und über den lokalen Browser-Druckdialog als einseitiges PDF in frei wählbarem Sonderformat ausgegeben. Der Export berücksichtigt Personenfarben und Zweighervorhebungen und warnt vor sehr kleiner resultierender Schrift. Er ist vektorbasiert, aber noch keine PDF/X-Druckvorstufendatei: Kachel-Ausgabe, verbindliche Schrift-Einbettung, CMYK-/ICC-Ausgabe, PDF-Preflight und druckereispezifischer Beschnitt sind offen. Das interne Datenmodell bleibt von Seitenkoordinaten getrennt.

## Datenschutz-Leitplanken

- `/data/` bleibt ignoriert; keine echten Personen-/Gesundheits-/Beziehungsdaten in Issues, Commits, Screenshots, Logs oder Test-Fixtures.
- Beispieldaten müssen erfunden sein, nicht bloß pseudonymisiert.
- Im Datenpfad keine Telemetrie oder externen API-Aufrufe mit Datensatzinhalten.
- UI-Fehler und Logs enthalten keine Zellwerte oder Personendetails.
- Browserablage ist an Origin und Profil gebunden; Nutzer müssen Daten sichern und wiederherstellen können.
- Bibliotheken und statische App-Auslieferung so wählen, dass unnötige externe Skripte und nachgeladene Ressourcen vermieden werden.

## Gespeicherte Fälle und erste Strukturansicht

Die Anwendung liest die gespeicherten Fälle nun über das SQLite-Worker-Protokoll aus. Die UI greift weiterhin nicht direkt auf SQLite zu. Eine Fallübersicht zeigt Erstellzeitpunkt und Zählwerte; beim Auswählen werden Personen, Partnerschaften sowie Eltern-Kind-Verbindungen geladen und lokal zu einer ausklappbaren Familienstruktur projiziert.

Die Bildschirmdarstellung ist eine navigierbare Strukturansicht und nicht selbst das Drucklayout. Jede Nachkommeneinheit wird in einer gemeinsamen Zeile als Person plus ggf. Partner dargestellt; deren Kinder erscheinen darunter. Geschlechtsangaben werden nicht importseitig geraten. Nicht gesetzte Angaben bleiben ausdrücklich unbekannt und werden entsprechend neutral dargestellt. Die Ansicht behauptet keine biologische Elternschaft. Es gibt keine automatische Layoutpersistenz oder Suche; ein erster einseitiger PDF-Export ist als separate Druckansicht ergänzt.

Für das aktuelle Excel-Mapping ist `person_a` das Familien-A-Mitglied und `person_b` der Partner aus Spalte G. Ein partnerseitiger Datensatz ohne eigene Vorfahren darf daher nicht als zusätzlicher Wurzelknoten erscheinen; er wird ausschließlich gemeinsam mit dem Familien-A-Mitglied dargestellt.

GEDCOM 7 bleibt ein genealogisches Austauschformat und ist nicht die Basis des internen Modells. Das aktuelle Schema ist weiterhin ein eigenes relationales Modell mit Personen, Partnerschaften und Eltern-Kind-Kanten. Die Baumansicht ist eine Projektion darauf; die Fachstruktur soll auch komplexere Netzfälle wie mehrere Partnerschaften und verschiedene Elternschaftsarten abbilden können. Vor weiterem Ausbau sollte ein explizites Konzept für Elternkonstellationen/Unionen und Zuordnung gemeinsamer Kinder geprüft werden.

**Praktische Einschränkung:** Ein erneuter Import legt weiterhin einen neuen Fall an. Das Fallverzeichnis listet diese Fälle getrennt. Personendaten und Partnerschaften lassen sich manuell korrigieren; Eltern-Kind-Zuordnungen und Backup-Export sind noch nicht bearbeitbar. OPFS-Neuöffnung und Anzeige im Browser des Nutzers sind noch nicht durch einen von uns ausgeführten End-to-End-Test bestätigt.

### Manuelle Korrekturen an Knoten

Jeder Personen-/Partnerknoten kann bearbeitet werden. Die erste Bearbeitungsstufe umfasst Name, Familienname, Geburts- und Todesdatum beider dargestellten Personen sowie Status und Datum der Partnerschaft. Datumswerte akzeptieren Tages- oder Jahresgenauigkeit und werden vor dem Speichern validiert. Die Felder werden im Worker in einer SQLite-Transaktion aktualisiert; Änderungen werden ausschließlich im aktuellen lokalen Fall gespeichert.

Noch nicht unterstützt werden das Hinzufügen/Entfernen von Personen oder Partnerschaften sowie das Verschieben eines Kindes zu einer anderen Elternkonstellation. Das bleibt eine getrennte Bearbeitungsfunktion, damit keine Änderung der fachlichen Struktur versehentlich durch eine reine Textkorrektur geschieht.

### Versioniertes JSON-Archiv

Für portable Sicherung/Wiederherstellung wird ein eigener, fallbezogener JSON-Container verwendet: `format: "cherware-genogram"`, `formatVersion: 1`, Metadaten zum Fall und den Exportzeitpunkt sowie getrennte Arrays für Personen, Partnerschaften und Eltern-Kind-Verbindungen. Der Vertrag ist als JSON Schema Draft 2020-12 in `src/backup/genogram-archive.schema.json` definiert und wird mit Ajv im Browser geprüft. Zusätzliche fachliche Regeln validieren eindeutige IDs, Datum/Genauigkeit und alle Beziehungsreferenzen.

Der Export enthält alle zum Fall gespeicherten Fachdatensätze, aber keine OPFS-/SQLite-Datei, Layoutpositionen oder Roh-Excel-Datei. Beim Import werden IDs neu vergeben und Beziehungen auf die neuen IDs umgebogen; der Vorgang legt einen neuen Fall an und überschreibt nie vorhandene Fälle. Speicherung erfolgt in einer Transaktion. Unbekannte/ungültige Archivversionen werden abgewiesen, statt teilweise importiert zu werden. Schemaänderungen erhalten künftig eine neue Formatversion mit expliziter Upgrade-Strategie.

Archive enthalten sensible Familiendaten als unverschlüsselten Klartext. Der Export lädt die Datei ausschließlich über den Browser herunter und sendet sie nicht an einen Server. Nutzer müssen die heruntergeladene Datei selbst an einem geschützten Ort aufbewahren.

Gespeicherte Fälle lassen sich aus der Detailansicht löschen. Zur Unterscheidung gleichnamiger Fälle nennt die Bestätigung Importzeit und Umfang. Die Löschung umfasst ausschließlich den ausgewählten Fall samt Personen und Beziehungen und wird lokal in einer Transaktion ausgeführt; sie ist endgültig.

Die Oberfläche hält die Fenster-Kopf- und Fußzeile permanent sichtbar und begrenzt den App-Shell auf die Viewport-Höhe. Fallauswahl, Excel-/JSON-Import, Export und Löschen liegen in der Aktionszeile im Kopfbereich. Der Genogrammbaum füllt den Zwischenraum und ist der primäre Scrollcontainer. Die Fußzeile zeigt KPIs des ausgewählten Falls. Auf schmalen Viewports werden die Inhalte verdichtet; die Baumfläche bleibt scrollbar.

Die Fallauswahl ist in ein überlagerndes Hamburger-Menü mit links einfahrender Seitenleiste ausgelagert. Fallname, Importzeitpunkt und Umfang dienen zur Identifikation, ohne eine zusätzliche dauerhafte Titelzeile im Arbeitsbereich zu belegen.

Dateiaktionen (JSON-Import/-Export und Löschen) sitzen in der Hauptkopfzeile neben dem Excel-Import. Eine zusätzliche dauerhafte Datei-/Datenschutz-Aktionszeile wird vermieden.

Excel-Import und JSON-Archivaktionen sind in einem einzigen Datei-Menü zusammengefasst. Das Menü schließt sich bei Klick außerhalb oder Escape; innerhalb des Menüs bleibt es für Vorschau und Bestätigung offen.

Eine vollständig synthetische Datei zum manuellen Importieren und Prüfen liegt unter `docs/examples/genogram-archive-v1.example.json`.

## Offene Fragen für die nächste Konzeptstufe

1. Sind die Zeilenfarben ausschließlich visuelle Formatierung oder kodieren sie fachliche Gruppen/Beziehungen?
2. Welche Regeln gelten für Personenzellen, deren Name/Datumsangaben nicht dem vollständigen Zweidatums-Muster entsprechen? Diese dürfen in der Importvorschau manuell aufgeteilt werden.
3. Wie werden abweichende Familiennamen, mehrere Ehepartner oder unbekannte/fehlende Partner abgebildet?
4. Welche Genogramm-Zielgruppe und welcher fachliche Zweck bestimmen Symbolik und Beziehungstypen?
5. Welcher Browser bzw. welches Betriebssystem ist verbindlich? Muss die App als installierbare PWA und vollständig offline funktionieren?
6. Soll ein Genogramm pro Browserprofil, pro Datei oder für mehrere getrennte Fälle geführt werden?
7. Welche Sicherung ist gewünscht (lesbares Format, SQLite-Datei, verschlüsseltes Archiv)? Wer soll sie öffnen können?
8. Welche Druckgrößen, Seitenaufteilung, Orientierung und Mindestlesbarkeit sind erforderlich?
9. Welche Metadaten sind wirklich nötig, besonders bei sensiblen Beziehungs- oder Gesundheitsangaben?

## Quellenbewertung

- Die SQLite-Dokumentation beschreibt Worker-Anforderung, OPFS-VFS-Varianten, Header-/SharedArrayBuffer-Bedingungen und Konkurrenzgrenzen: [SQLite WASM persistence](https://www.sqlite.org/wasm/doc/trunk/persistence.md).
- MDN beschreibt OPFS als origin-private Ablage, die bei Website-Datenlöschung verschwindet und Quota-Beschränkungen hat: [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), [storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- React stellt TypeScript-Unterstützung und Komponenten-/Hook-Typisierung in der offiziellen Dokumentation dar: [React + TypeScript](https://react.dev/learn/typescript).
- SheetJS dokumentiert lokale Browser-Dateien über `File.arrayBuffer()` und `XLSX.read()`; der npm-Registry-Eintrag ist älter als die offizielle Distribution. Für das Grundgerüst wird das offizielle gepinnte Paket verwendet: [Installation mit Bundlern](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/), [Browser-Dateiimport](https://docs.sheetjs.com/docs/demos/local/file/).
- GEDCOM 7 ist ein veröffentlichter Genealogie-Datenaustauschstandard: [Spezifikationen](https://gedcom.io/specifications/). Das macht es nicht automatisch zum Genogramm-Standard.
- Eine Praxisanleitung empfiehlt eine Legende für Symbole und markiert, dass konkrete Darstellungen variieren: [Research in Practice guide](https://www.researchinpractice.org.uk/media/mkydyt3f/cf_pt_using-genograms-in-practice_final.pdf). McGoldrick et al. beschreiben die historische Standardisierung als Konsensarbeit und weiterentwickelbar: [Genograms](https://digital.library.mcgill.ca/downloads/genograms-80019825.pdf).
## Baumansichten

Ansichtszustand wird lokal im Browser je Fall gespeichert: aktuelle Ansicht, individueller Zoom pro Ansicht, Darstellungsoptionen, Genogramm-Zweigzustände und Scrollposition. Der zuletzt verwendete Fall wird beim Neustart wieder ausgewählt. Es werden dafür keine Familiendaten in den Einstellungen dupliziert.

Die Baumfläche bietet eine horizontale und eine vertikale Darstellung desselben Datenbaums. Die vertikale Ansicht setzt die Familienwurzel nach oben und zeigt Geschwister nebeneinander sowie Nachkommen darunter. Ansicht und Klappzustand sind Darstellungszustände und ändern nicht das gespeicherte Genogramm.

### Leitlinien für große Familienbäume

- Interaktive Ansicht und Druck-/PDF-Layout getrennt entwickeln; etablierte Genealogieprogramme bieten mehrere, auf unterschiedliche Aufgaben zugeschnittene Ansichten.
- Partnerschaft/Familie als eigene Beziehungseinheit führen. Kinder gehören zu einer konkreten Eltern-Partnerschaft; dies verhindert Mehrdeutigkeit bei mehreren Partnerschaften.
- Geschwisterreihenfolge nur anhand bekannter Geburtsdaten oder einer ausdrücklich gepflegten Reihenfolge festlegen. Keine Geschlechtskodierung aus dem aktuellen Import ableiten.
- Für große interaktive Bäume Fokus, Ein-/Ausklappen, Zoom/Schwenken und Suche vorsehen; für PDF eine eigene Seitenteilungs-/Großformatstrategie mit Fortsetzungsverweisen planen.
- Vor Festlegung auf CSS-Eigenlayout oder Layoutbibliothek mit synthetischen Belastungsfällen vergleichen: breite Geschwistergruppen, tiefe Äste, Mehrfachpartnerschaften und fehlende Daten.
- Die Arbeitsfläche unterstützt Zoom von 5 bis 125 Prozent; „Gesamtansicht“ öffnet alle Äste und passt den Baum an den verfügbaren Viewport an. CSS `zoom` beeinflusst die Layoutgröße und daher auch die Scrollfläche ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom)).

Diese Leitlinien beruhen auf der Recherche in `AI_DEVELOPMENT_LOG.md`; dort sind die Quellen zu FamilySearch, Ancestry, GenoPro, D3, ELK und Gramps verzeichnet.

### Geschlecht und Personensymbol

Jede Person hat eine manuell änderbare Angabe: weiblich, männlich, nicht-binär oder unbekannt/keine Angabe. In der Genogramm-Ansicht wird die gesamte Personen-Card als Kreis (weiblich), Rechteck (männlich), gestrichelt umrandete Card (nicht-binär) oder gepunktete neutrale Card (unbekannt) dargestellt. Sie wird weder aus Namen noch aus Partnerschaftsposition abgeleitet. Bestehende Datenbanken werden auf Schema v2 migriert; ältere JSON-Archive ohne dieses Feld werden beim Import als unbekannt behandelt.

### Datumsgenauigkeit

Datumsfelder akzeptieren Jahr (`JJJJ`), Monat und Jahr (`MM.JJJJ`) sowie vollständiges Datum (`TT.MM.JJJJ`). Monat-genaue Angaben werden ohne erfundenen Tag gespeichert und im Ansichts- und JSON-Export als `JJJJ-MM` mit Genauigkeit `month` geführt. Browserdatenbanken werden auf Schema v3 migriert.

### Elternzuordnung

Jede Eltern-Kind-Verbindung wird separat gespeichert und kann im Knoteneditor einem oder beiden Partnern zugeordnet werden. Der Import bietet für jedes Kind mit einem Paar in der Elterngeneration eine prüfbare Auswahl; beide Eltern sind anhand der bisherigen Tabelleninterpretation vorausgewählt, die Partnerperson kann pro Kind abgewählt werden. Elternschaftsarten (biologisch, adoptiv, Pflege, Stief-/sozial oder ungeklärt) werden je Verbindung gespeichert. Die Genogrammlinie führt bei zwei Eltern mit gleicher Zuordnungsart von der Paarverbindung aus; bei nur einem Elternteil von dessen Card. Verschiedene Arten bekommen getrennte, unterschiedlich formatierte Linien. Fehlende Zuordnungen werden nicht ergänzt.
