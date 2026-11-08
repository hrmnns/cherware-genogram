# KI-gestütztes Entwicklungsprotokoll

Ziel dieses Protokolls ist ein später nachvollziehbarer Erfahrungsbericht. Festgehalten werden Anlass, Eingaben/Annahmen, Recherche, Entscheidungen, Änderungen und Überprüfung. Es enthält keine echten Personendaten und keine geheimen Schlüssel.

## 2026-11-07 – Projektstart und Konzeptprüfung

**Ausgangslage:** Neues Repository mit einem lokalen Verzeichnis `data/`, das nicht nach GitHub gelangen darf. Das Verzeichnis ist über `.gitignore` ausgeschlossen und wurde mit `git check-ignore` geprüft.

**Erster fachlicher Prompt (sinngemäß):** Eine browserbasierte Genogramm-App mit React/TypeScript, möglicher Speicherung über SQLite WASM + OPFS, Excel-Import als erster Eingang, späterer manueller Bearbeitung/Erweiterung und großformatigem PDF-Export. Wegen personenbezogener Daten sollen echte Datensätze nur in der App und nicht im Repository verwendet werden. Parallel soll die KI-gestützte Umsetzung vom ersten Prompt an dokumentiert werden.

**Vorgehen:** Repository-Inhalt geprüft; aktuelle Primär-/Fachquellen zu SQLite WASM/OPFS, Browser-Speicher, React/TypeScript, GEDCOM und Genogramm-Notation konsultiert.

**Erkenntnisse:**

- SQLite WASM/OPFS passt grundsätzlich, braucht aber einen Worker; VFS-Wahl, Browserunterstützung und ggf. Serverheader beeinflussen den Betrieb.
- OPFS ist keine nutzerseitige Dateiablage und kein Backup. Website-Datenlöschung, Quota, Browserwechsel und privates Browsen sind zu berücksichtigen.
- GEDCOM 7 ist für genealogischen Datenaustausch nützlich, aber kein vollständiges Format für Genogramm-Beziehungen und Layout.
- Genogramm-Symbole folgen verbreiteten Konventionen; eine überall verbindliche Gesamtstandardisierung ist nicht belegt. Eine Legende und konfigurierbare Erweiterungen sind wichtig.
- Das konkrete Excel-Schema und die fachliche Zielgruppe fehlen noch; daher wurden Importmapping und endgültiges Schema offengelassen.

**Ergebnis dieses Schritts:** Konzeptbewertung, Leitplanken und offene Fragen in `README.md` und `docs/PROJECT_NOTES.md` angelegt. Echte Daten wurden nicht gelesen oder erzeugt.

**Quellen:** Links und konkrete Einordnung siehe `README.md` und `PROJECT_NOTES.md`.

**Rückblick / für den Erfahrungsbericht:** Gute frühe KI-Unterstützung war hier Recherche plus explizites Offenhalten irreversibler Fachmodell-Entscheidungen, bis ein echtes (synthetisches) Beispieldokument vorliegt. Zu prüfen bleibt, wie sich die Empfehlungen bei Browserprototyp und Excel-Import bewähren.

## 2026-11-07 – Erstes Excel-Schema beschrieben

**Nutzerklärung:** Die Arbeitsmappe ist aus Sicht der Familie A beschrieben. Generationenspalten markieren jeweils das direkte Kind der vorherigen Generation. Weitere Spalten enthalten angeheirateten Ehepartner und Familienname. Eine Zeile gibt einen Ehepartner bzw. Nachkommen der bezeichneten Generation wieder. Ein Namensfeld kann Vorname sowie Geburts- und Todesdatum enthalten. Das Screenshot-Beispiel zeigt zusätzlich eine Spalte „Datum der Eheschließung“.

**Vorläufige Interpretation:** Sparse, hierarchische Zeilen kodieren einen Pfad durch Familie A. Am Ende einer Zeile stehen ggf. Partner und Verbindungsdatum. Beim Einlesen wird daraus ein normalisiertes Personen-/Beziehungsmodell; das Excel-Layout muss nicht das spätere Arbeitsformat bleiben.

**Erkannte Unklarheiten:** Die Beschreibung sagt „sechs Spalten“, zählt später aber bis Spalte 8. Der Screenshot zeigt A–E als fünf Generationenspalten, F als Eheschließungsdatum, G als Ehepartner und H als Familienname. Auch die Bedeutung der Beispielwerte `∞ 1924` / `∞ 1955`, das Wiederholen bzw. Fortsetzen von Pfaden, und die genaue Datums-/Namenssyntax sind noch offen.

**Ergebnis:** Vorläufige Spaltenzuordnung und Klärungspunkte in `docs/PROJECT_NOTES.md` dokumentiert. Noch kein Importmapping oder Datenbankschema festgelegt; es wurden keine realen Personendaten verwendet.

**Nächster Schritt:** Die genannten strukturellen Details anhand einer synthetischen Arbeitsmappe oder eines vollständig erfundenen Mini-Beispiels klären, bevor ein Parser geschrieben wird.

## 2026-11-07 – Generationen- und Eheschließungssemantik geklärt

**Nutzerklärung:** Es gibt fünf Generationenspalten; die sechste Spalte ist bereits das Eheschließungsdatum. `∞ 1924` steht für verheiratet seit 1924; `∞` allein bedeutet verheiratet, Datum unbekannt. Fehlt eine Datumsangabe, wird kein Jahr/Datum erfunden. Bei einer bekannten Ehe soll grundsätzlich auch ein Ehepartnername in der Partner-Spalte stehen. Geschwister stehen in derselben Generationenspalte. Kinder folgen in der nächsttieferen Spalte; nach dem Kinderzweig kann ein Geschwister in derselben Spalte wie sein Vorgänger beginnen.

**Vorläufige Parserregel:** Die Generationenspalte einer Zeile bestimmt die Tiefe. Beim Wechsel zu einer kleineren Generationstiefe wird der tiefere offene Zweig beendet. Ein Eintrag der nächsttieferen Generation wird dem zuletzt offenen Elternpaar zugeordnet. Eheschließungsstatus und Eheschließungsdatum sind getrennte Informationen: explizites `∞` setzt Status „verheiratet“, während das Datum optional bleibt; leere F-Zellen bedeuten unbekannt, nicht „unverheiratet“.

**Ergebnis:** Korrektur und Zeilenhierarchie in `docs/PROJECT_NOTES.md` erfasst. Das genaue Namens-/Datumsformat in Personenzellen und Sonderfälle wie mehrere Partner bleiben vor dem Parser zu klären.

## 2026-11-07 – Manuelle Importkorrektur als Leitlinie

**Nutzerentscheidung:** Nicht alle Sonderfälle müssen im Excel-Parser automatisch gelöst werden. Beim Import darf manuell eingegriffen werden; entscheidend ist, dass die übernommenen Daten sauber in der Zielstruktur landen.

**Umsetzungsleitlinie:** Import als Vorschau-/Korrekturworkflow behandeln. Erkannte Spalten und vorgeschlagene Personen-/Beziehungszuordnungen bleiben überprüfbar und editierbar; Unklarheiten werden sichtbar gemacht statt geraten. Erst nach Bestätigung werden validierte Daten atomar in das normalisierte Fachmodell übernommen. Die Excel-Zeilenstruktur ist Eingabeformat und wird nicht zum internen Modell.

**Ergebnis:** Importworkflow und Normalisierungsziel in `docs/PROJECT_NOTES.md` ergänzt. Keine Implementierung und keine echten Daten verwendet.

## 2026-11-07 – Hierarchie an konkretisiertem Beispiel geprüft

**Nutzerbeispiel:** Der Screenshot zeigt A in Generation 1, zwei Geschwister (B und C) in Generation 2 und jeweils einen eigenen Generation-3-Nachkommenzweig. Damit wird die Geschwisterfolge und das Zurückspringen zur Elterngeneration anschaulich. Die fünf Generationenspalten sowie Eheschließungsangabe, Ehepartner und Familienname entsprechen der bisher beschriebenen Zuordnung.

**Ergebnis:** Beispiel als Stütze für den hierarchischen Parseransatz in `docs/PROJECT_NOTES.md` erfasst. Noch offen ist, ob die erläuternden Namenszusätze „Sohn von A“ / „Tochter von A“ echte Zellinhalte oder nur Beispielbeschriftungen sind und ob die Farben irgendeine Datenbedeutung haben. Der Import soll nicht auf Zellfarben angewiesen sein, sofern sie nicht ausdrücklich als Datenquelle festgelegt werden.

## 2026-11-07 – Beispielbeschriftungen eingeordnet

**Nutzerklärung:** „Sohn von A“ / „Tochter von A“ sind nur Erläuterungen. Die Datei ist zeilenweise systematisch aufgebaut.

**Ergebnis:** In den Projektnotizen als Beispielbeschriftung festgehalten; Parsergrundlage bleibt die systematische Zeilenfolge und die Generationenspalten. Farben werden bis zu einer ausdrücklichen fachlichen Zuordnung als Darstellung behandelt.

## 2026-11-07 – Eingabearbeitsmappe strukturell geprüft

**Nutzeraktion:** Eine Excel-Beispieldatei in den lokalen Ordner `input/` gelegt. Der Ordner wurde unmittelbar zu `.gitignore` hinzugefügt, damit weder die Beispieldatei noch spätere lokale Eingaben versehentlich versioniert werden.

**Prüfung:** Die Arbeitsmappe wurde lokal mit `openpyxl` ausgewertet. Konsolenausgabe enthielt ausschließlich Strukturmerkmale und Zählungen, keine Namen, Zelltexte oder Datumswerte.

**Strukturresultat:** Eine Tabelle mit 8 Spalten, Kopfzeile plus 17 Datensätzen, ohne Leerzeilen; jede Datenzeile befüllt genau eine Generationenspalte. Generationenverteilung 1/2/2/6/6 für Generationen 1–5. Familienname ist überall befüllt. Es gibt 11 Datensätze mit Partner und Eheschließungsmarker und 6 ohne beides. Alle 11 Marker sind Text mit `∞` (U+221E); drei enthalten ein Jahr, acht nur den Marker. Fünf Personenzellen enthalten zwei volle Datumsangaben im Format `TT.MM.JJJJ`; zwölf haben kein solches Datumpaar und sollten manuell geprüft werden.

**Ergebnis:** Konkretes Formatprofil und vorläufige deterministische Parserregeln in `docs/PROJECT_NOTES.md` festgehalten. Die Arbeitsmappe bleibt im ignorierten `input/` und wurde nicht ins Repository übernommen.

**Nächster Schritt:** Importvorschau so umsetzen, dass erkannte Personenzellen editierbar sind und fehlende/unklare Datumsfelder nicht geraten werden. Dann kann das Schema anhand der tatsächlichen Importfälle finalisiert werden.

## 2026-11-07 – React/TypeScript-Grundgerüst und OPFS-Prototyp

**Ausgangslage:** Der Nutzer bat, nach der Konzept- und Formatklärung mit der Umsetzung weiterzumachen.

**Entscheidungen:** Vite + React + TypeScript als statisches Browser-Grundgerüst. SQLite WASM wird in einem dedizierten Worker initialisiert. Für den ersten Prototyp wurde `opfs-sahpool` gewählt, weil der klassische `opfs`-VFS COOP/COEP-Header benötigt. Es gibt keinen stillen flüchtigen Speicher-Fallback. Die SAH-Pool-Option `preserveOnInitFailure` schützt vorhandene Daten bei Initialisierungsproblemen. Excel-Library und endgültiges Datenschema bleiben offen bis ein synthetisches Tabellenbeispiel vorliegt.

**Umsetzung:** React-Einstiegsoberfläche mit sichtbarem lokalem Speicherstatus, Worker-Protokoll, SQLite-Paket und strikten TypeScript-Einstellungen angelegt. Projektregeln in `AGENTS.md`, Stackentscheidung in `docs/decisions/0001-client-stack.md` dokumentiert. UI verwendet Systemschriften ohne externe Font-Anfragen.

**Datenschutz:** Keine echten Daten, keine Beispielpersonen und keine Importdatei verwendet. `/data/` bleibt ignoriert. Die App sammelt noch keine Familiendaten.

**Überprüfung:** `npm install` erfolgreich (28 Pakete, 0 gemeldete Schwachstellen); `npm run build` erfolgreich. Das Build enthält den SQLite-WASM-Worker und das zugehörige WASM-Modul. Ein interaktiver Laufzeittest im Browser ist noch offen.

**Nächster Schritt:** OPFS-Wiederöffnung im Zielbrowser prüfen und eine synthetische Excel-Datei verwenden, bevor Import und Fachmodell festgelegt werden.

## 2026-11-07 – Lokale Excel-Vorschau und atomare Übernahme

**Umsetzung:** SheetJS 0.20.3 aus der offiziellen Distribution hinzugefügt. Das erste Tabellenblatt wird in einem Parser-Worker verarbeitet; die UI zeigt editierbare Personendaten, Beziehungen, Warnungen und eine Übernahmezusammenfassung. Namen werden nicht in Konsolen- oder Fehlerausgaben geschrieben. Die Excel-Datei wird nicht persistiert.

**Zielstruktur:** Version 1 des SQLite-Schemas trennt Fälle, Personen, Partnerschaften und Eltern-Kind-Verknüpfungen. Datumswerte tragen Genauigkeit (Tag/Jahr); Elternverknüpfungen werden als `unspecified` gespeichert, da die Quelle keine biologische/adoptive/Pflege-Art codiert. Übernahme erfolgt in einer SQLite-Transaktion und wird durch eine explizite Nutzerbestätigung ausgelöst.

**Sicherheits-/Qualitätsregeln:** Der Eingabeordner `/input/` ist jetzt ebenfalls ignoriert. Genau eine Generationenspalte pro Zeile ist erforderlich; fehlende Elternzeilen blockieren. Datumsfelder werden nicht geraten; ungültige manuelle Datumswerte blockieren die Übernahme. Es gibt keinen persistenten Rohdatei- oder In-Memory-Datenbank-Fallback.

**Überprüfung:** `npm install` mit der SheetJS-Distribution erfolgreich; `npm run build` erfolgreich. Keine automatisierten Tests und kein interaktiver Browser-Import wurden ausgeführt. Der lokale Dateilauf wurde nur strukturell analysiert; Zellinhalte wurden nicht in Ausgaben übernommen.

**Offen:** Laufzeitverhalten von OPFS in Zielbrowsern/Mehrtabfall, Sicherung und Wiederherstellung sowie Bildschirmansicht gespeicherter Personen.

## 2026-11-07 – Gespeicherte Fälle und aufklappbare Familienstruktur

**Nutzerentscheidung:** Als nächsten Schritt gespeicherte Daten sinnvoll visualisieren. Gewünscht ist eine Baumstruktur, deren Knoten/Äste auf- und zuklappbar sind. GEDCOM 7 wurde als mögliche Modellbasis angesprochen; zuvor wurde geklärt, dass es eher als späteres Austauschformat denn als internes Genogrammmodell dienen sollte.

**Umsetzung:** Worker-Protokoll um Abfragen für Fallübersicht und Falldetails erweitert. Beim Öffnen der App werden vorhandene Fälle aus SQLite/OPFS gelesen. Die neue Fallansicht zeigt Zählwerte und eine verschachtelte, auf- und zuklappbare Struktur aus Personen, Partnerschaften und Kindern. Nach erfolgreichem Import wird die Fallliste aktualisiert und der neueste Fall ausgewählt. Die Excel-Datei wird weiterhin nicht gespeichert.

**Modellgrenzen:** Die Familienstruktur ist eine UI-Projektion des bestehenden SQLite-Modells, keine GEDCOM-7-Implementierung und noch kein vollständiges Genogramm. Unbekanntes Geschlecht wird nicht geraten; ein neutraler Marker und ein erklärender Hinweis werden verwendet. Die Ansicht ist zunächst nur lesend. Mehrfachpartnerschaften und uneindeutige Elternkonstellationen benötigen weitere Modell-/Fixture-Prüfung, ehe die Darstellung als allgemein vollständig gelten kann.

**Datenschutz:** Es wurden keine lokalen Browserdaten, Zellinhalte oder echten Personendaten ausgelesen. Implementierung beschränkt sich auf Code und Dokumentation; alle Fallabfragen geschehen zur Laufzeit im Browser-Worker.

**Überprüfung:** `npm run build` erfolgreich (TypeScript-Projektbuild und Vite-Produktionsbuild). Kein interaktiver Laufzeittest mit dem realen Browserprofil des Nutzers; keine echten lokalen Daten zu Testzwecken angefasst.

## 2026-11-07 – Nachkommen als gemeinsame Personen-/Partnerknoten

**Nutzerfeedback:** Die erste Visualisierung zeigte einen Nachkommen (z. B. B3) mehrfach: einmal als Kind, danach erneut als Partnerknoten und nochmals in den Partnerkarten. Das war unnötig unübersichtlich. Gewünschtes mentales Modell: jeder Nachkomme ist genau ein Knoten, bei Bedarf zusammen mit dem Partner.

**Anpassung:** Person und Partner werden jetzt innerhalb einer gemeinsamen, aufklappbaren Zusammenfassungszeile mit neutralen Personenmarkern und Beziehungsdatum dargestellt. Unter diesem Knoten erscheinen nur noch die Kinder; doppelte Partnerkarten und der separate Kind-Eintrag entfallen. Auch Nachkommen ohne eigene Partnerschaft erhalten eine aufklappbare Einzelpersoneneinheit.

**Datenschutz:** Keine lokalen Falldaten ausgelesen. Anpassung erfolgte nur an Darstellung/Projektion und Styles.

**Überprüfung:** `npm run build` erfolgreich. Visueller Check im Browser mit anonymisierten Beispieldaten empfohlen; die echten lokalen Browserdaten wurden nicht geöffnet.

## 2026-11-07 – Spalte-G-Partner nicht als zusätzliche Wurzeln anzeigen

**Nutzerhinweis:** Im Screenshot erschienen Partner aus Spalte G (z. B. G3) zusätzlich als separate Wurzelkarten mit eigenem Nachkommenzweig. Gefragt wurde, ob für jeden Ehepartner ein separates Diagramm gezeichnet werde.

**Ursache und Korrektur:** Nein, das ist nicht das gewünschte Modell. Die Wurzelerkennung behandelte partnerseitige Personen ohne eingehende Elternkante fälschlich als unabhängige Wurzeln. Im aktuellen Excel-Mapping ist `person_a` das Familien-A-Mitglied und `person_b` der Partner aus Spalte G. Partnerdatensätze werden daher bei der Erzeugung von Wurzelknoten ausgeschlossen; der Partner bleibt im gemeinsamen Personen-/Partnerknoten des Nachkommen.

**Datenschutz:** Keine Browserdaten oder personenbezogenen Inhalte geöffnet. Korrektur betrifft ausschließlich die UI-Baumprojektion.

**Überprüfung:** `npm run build` erfolgreich. Visuelle Bestätigung mit der synthetischen Beispieldatei steht noch aus; die echten lokalen Browserdaten wurden nicht geöffnet.

## 2026-11-07 – Doppelte Abstammungslinie entfernt

**Nutzerfeedback:** In der Familienstruktur wurden zwei parallele vertikale Linien zur Unterebene gezeichnet; eine Linie ist ausreichend.

**Anpassung:** Die separate Verbindungslinie wurde entfernt. Die verschachtelte Kinderliste zeichnet nun allein die linke Abstammungslinie.

**Überprüfung:** `npm run build` erfolgreich. Keine Browserdaten ausgelesen.

## 2026-11-07 – Knoten lokal korrigierbar machen

**Nutzerwunsch:** Personen-/Partnerknoten sollen für manuelle Korrekturen editierbar sein.

**Umsetzung:** Jeder Knoten bietet einen Bearbeitungsdialog. Name, Familienname, Geburts-/Todesdatum beider Partner sowie Partnerschaftsstatus und -datum lassen sich ändern. Tages- und Jahresdaten werden validiert. Die Speicherung erfolgt per typisiertem Worker-Befehl in einer atomaren SQLite-Transaktion; danach wird derselbe Fall erneut ausgelesen und die Ansicht aktualisiert. Keine Netzwerkschnittstelle für Familiendaten ergänzt.

**Abgrenzung:** Eltern-Kind-Kanten und Knotenzuordnung bleiben in dieser Stufe schreibgeschützt; Personen/Partnerschaften können noch nicht hinzugefügt oder gelöscht werden. Dadurch werden Textkorrekturen nicht mit Strukturänderungen vermischt.

**Datenschutz:** Keine OPFS-Daten oder echten Personendaten durch den Entwicklungsprozess ausgelesen.

**Überprüfung:** `npm run build` erfolgreich. Interaktive Speicherung im Zielbrowser bleibt vom Nutzer zu prüfen.

## 2026-11-07 – Versioniertes JSON-Archiv für Sicherung und Austausch

**Nutzerwunsch:** Ein sauberes, erweiterbares Format implementieren, mit dem lokale Familiendaten exportiert und wieder importiert werden können.

**Entscheidung:** Eigenes fallbezogenes JSON-Archiv statt GEDCOM als internes Backup: GEDCOM bleibt eine mögliche genealogische Austauschoption; das Archiv bildet exakt das aktuelle App-Datenmodell ab. Die Struktur ist mit JSON Schema Draft 2020-12 beschrieben und wird lokal mit Ajv validiert. Das Format enthält explizite Formatkennung und Version, Falldaten, Personen, Partnerschaften und Eltern-Kind-Kanten.

**Umsetzung:** Pro Fall kann eine JSON-Datei exportiert werden. Ein Import zeigt vor dem Speichern eine Zusammenfassung und legt den Inhalt als zusätzlichen Fall an. IDs werden neu erzeugt und alle Beziehungen neu referenziert. Fremdschlüssel, IDs, Datum/Genauigkeit und Versionsschema werden geprüft; alle Datensätze landen atomar in einer SQLite-Transaktion. Kein Überschreiben bestehender Fälle.

**Datenschutz:** Exportdateien enthalten Familiendaten unverschlüsselt und werden explizit als Klartextarchive kenntlich gemacht. Dateiverarbeitung und Speicherung bleiben lokal im Browser; keine Remote-Aufrufe mit Inhalten ergänzt. Keine echten Browserdaten für Entwicklung/Build geöffnet.

**Überprüfung:** `npm install ajv` erfolgreich; `npm run build` erfolgreich. Ajv kompiliert das Archivschema, und das Schema akzeptiert die synthetische Beispieldatei. Roundtrip im Zielbrowser bleibt praktisch zu prüfen.

## 2026-11-07 – Importierte Fälle löschen

**Nutzerwunsch:** Einen importierten Fall wieder löschen können, auch wenn mehrere Fälle denselben Titel haben.

**Umsetzung:** In der Detailansicht gibt es eine Löschaktion. Vor dem Löschen zeigt ein Bestätigungsdialog Importzeitpunkt sowie Personen- und Beziehungszahlen und warnt vor der endgültigen Entfernung. Der Worker löscht ausschließlich Datensätze mit der ausgewählten Fall-ID in einer SQLite-Transaktion; die Liste wird danach aktualisiert. Bei einem Datenbankfehler wird die Transaktion zurückgerollt.

**Datenschutz:** Keine Browserdaten oder echten Falldaten für die Implementierung oder Prüfung ausgelesen. Die Löschung wirkt nur auf den ausgewählten lokalen Fall.

**Überprüfung:** `npm run build`; interaktive Löschung im Zielbrowser bleibt manuell zu prüfen.

## 2026-11-07 – Arbeitsfläche ins Zentrum der Oberfläche stellen

**Nutzerwunsch:** Header, Titel und sonstiger Overhead sollen wenig Platz verbrauchen; das Genogramm soll die zentrale, möglichst dauerhaft sichtbare Arbeitsfläche sein.

**Umsetzung:** Begrüßungs-/Marketingbereich entfernt und Speicherstatus in eine kompakte Kopfzeile verschoben. Die Fallübersicht nutzt nun nahezu die gesamte verfügbare Fensterhöhe und -breite. Fallauswahl und Genogramm erhalten getrennte scrollbare Bereiche; die Baumfläche füllt den verfügbaren Platz. Excel-Import ist in einen eingeklappten Bereich unterhalb der Arbeitsfläche verschoben. Auf schmalen Bildschirmen bleibt das Layout einspaltig und die Baumfläche separat scrollbar.

## 2026-11-07 – Feste Kopf- und Fußzeile für die Arbeitsansicht

**Nutzerwunsch:** Kopf-/Fußzeilen sollen sichtbar bleiben, während der Genogramm-Arbeitsbereich dazwischen den verfügbaren Platz nutzt. Laden, Löschen, Import und Export gehören in den Kopf; Kennzahlen des ausgewählten Falls in den Fuß.

**Umsetzung:** Die Anwendungsshell ist auf die Fensterhöhe begrenzt und selbst nicht scrollbar. Kopfzeile und Aktionszeile enthalten Speicherstatus, Excel-Import, Fallauswahl sowie JSON-Import/-Export und Löschen. Der Baum füllt den Zwischenraum und ist der primäre Scrollcontainer. Die feste Fußzeile zeigt Kennzahlen des aktiven Falls. Die bisherige Fallseitenleiste entfällt; gleichnamige Fälle bleiben im Auswahlmenü durch Importzeit und Umfang unterscheidbar.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Visuelle Prüfung im Zielbrowser steht noch aus.

## 2026-11-07 – Fallauswahl in linkes Hamburger-Menü verschoben

**Nutzerwunsch:** Mehr Platz sparen und die wiederholte Fallbezeichnung aus der Aktionszeile herausnehmen; Fallwechsel über ein von links einblendendes, überlagerndes Burger-Menü ermöglichen.

**Umsetzung:** Ein Hamburger-Button öffnet nun eine halbtransparente Überlagerung mit links einfahrender Seitenleiste. Darin werden gespeicherte Fälle mit Importzeitpunkt und Umfang aufgelistet; die Auswahl schließt das Menü und lädt den Fall in die Arbeitsfläche. Die separate Titel-/Fallauswahlzeile entfällt, Dateiaktionen bleiben kompakt in der schmalen Aktionszeile.

**Überprüfung:** `npm run build` und `git diff --check`; visuelle/bedienbare Prüfung im Zielbrowser steht noch aus.

## 2026-11-07 – Dateiaktionen in die Hauptkopfzeile verschoben

**Nutzerwunsch:** „Nur lokal“ entfernen, Datei-Menü neben Excel-Import in die Hauptkopfzeile setzen und die separate Aktionszeile beseitigen.

**Umsetzung:** Das Datei-Menü wird nun in die globale Kopfzeile neben „Importieren“ gerendert. Die zusätzliche Zeile mit „Datei“ und „Nur lokal“ entfällt; dadurch beginnt die Arbeitsfläche direkt unter der Hauptkopfzeile.

**Überprüfung:** `npm run build` und `git diff --check`; visuelle Prüfung im Zielbrowser steht noch aus.

## 2026-11-07 – Import und Dateiaktionen vereinheitlicht

**Nutzerwunsch:** Excel-Import und Datei-Menü sollen stärker zu einem Menü verschmelzen; offene Menüs sollen sich auch durch Klick außerhalb schließen.

**Umsetzung:** Excel-Import (Vorschau und Übernahme) und JSON-Archivaktionen befinden sich jetzt gemeinsam im Kopfmenü „Datei“. Ein Klick außerhalb oder Escape schließt das Menü. Interaktionen innerhalb des Menüs – etwa die Importvorschau – bleiben geöffnet.

**Überprüfung:** `npm run build` und `git diff --check`; visuelle Bedienprüfung im Zielbrowser steht noch aus.

## 2026-11-07 – Datei-Menü verständlicher gestaltet

**Nutzerfeedback:** Das zusammengeführte Import-/Dateimenü wirkte gedrängt und seine Aktionen waren nicht klar genug gegliedert.

**Umsetzung:** Excel-Import hat nun eine sichtbare Überschrift und eine kürzere Erklärung. JSON-Sicherung und -Wiederherstellung bilden einen eigenen Abschnitt mit deutlich beschrifteten Schaltflächen. Das irreversible Löschen ist separat und zurückhaltend rot markiert; die Bestätigungsstufe bleibt bestehen. Menübreite und Layout passen sich an schmale Bildschirme an.

**Überprüfung:** `npm run build` und `git diff --check`; visuelle Prüfung im Zielbrowser steht noch aus.

## 2026-11-07 – Hinweiszeile unter dem Genogramm entfernt

**Nutzerwunsch:** Den erklärenden Text direkt unterhalb der Baumansicht aus der Arbeitsfläche entfernen.

**Umsetzung:** Die Hinweiszeile zu editierbaren Personendaten und unveränderter Eltern-Kind-Zuordnung wird nicht mehr im Arbeitsbereich angezeigt. Die Funktionsgrenze bleibt in den Projektnotizen festgehalten.

**Überprüfung:** `npm run build` und `git diff --check`.

## 2026-11-07 – Arbeitsfläche randlos über die Fensterbreite führen

**Nutzerwunsch:** Seitliche Ränder der Arbeitsfläche entfernen, den Baum-Scrollbar bis an den rechten Fensterrand führen und den Falltitel als eigene Zeile statt innerhalb einer umgebenden Card zeigen.

**Umsetzung:** Die App-Shell nutzt nun die gesamte Fensterbreite; seitliche Begrenzung, Außenabstand und Containerrahmen sind entfernt. Titel und Legende bilden eine separate, einfache Kopfzeile. Der Genogramm-Scrollcontainer reicht rechts bis an den Fensterrand; die innere Baumdarstellung behält einen lesbaren Seitenabstand.

**Überprüfung:** `npm run build` und `git diff --check`; visuelle Kontrolle im Zielbrowser steht noch aus.

## 2026-11-07 – Knotenbearbeitung als kompaktes Icon

**Nutzerwunsch:** Pro Genogrammknoten ein kleines Bearbeitungsmenü bzw. einen Edit-Button statt des breiten Textbuttons; rechts neben der Kinderanzahl.

**Umsetzung:** Der Textbutton unter dem Knoten wurde durch ein kompaktes Stiftsymbol in der rechten Kopfzeile ersetzt. Ein zugänglicher Name und Tooltip erhalten die Erklärung. Das Symbol sitzt außerhalb des Klapp-Elements, damit die Bearbeitung nicht gleichzeitig den Ast umschaltet.

**Überprüfung:** `npm run build` und `git diff --check`; visuelle Prüfung in Desktop- und Mobillayout steht noch aus.

**Nachkorrektur:** Die erste Buttonposition außerhalb des `<summary>` wurde von `<details>` im geschlossenen Zustand ausgeblendet. Der Button sitzt jetzt in der Knotenkopfzeile; `preventDefault` und `stopPropagation` verhindern das unbeabsichtigte Auf-/Zuklappen beim Bearbeiten. Build erneut ausführen.

## 2026-11-07 – Baumansicht vereinfachen und Spalten ausrichten

**Nutzerwunsch:** Kinderzahlen, Edit-Icons und Partnerschaftsstatus sollen generationenübergreifend in klaren Spalten stehen; verschachtelte Card-Rahmen sollen reduziert werden.

**Umsetzung:** Knotenzeilen verwenden nun ein gemeinsames Grid mit Spalten für Auf-/Zuklappen, Paar, Partnerschaft, Kinderzahl und Bearbeitung. Die Kinderzahl und Edit-Icons stehen dadurch übereinander, ebenso der Partnerschaftsstatus. Paar- und Personenkarten wurden durch rahmenlose, kompakte Inhalte ersetzt; dezente Zeilentrenner und Abstammungslinien erhalten die Orientierung.

**Überprüfung:** `npm run build` und `git diff --check`; Desktop-/Mobilansicht visuell noch im Zielbrowser prüfen.

## 2026-11-07 – Ansicht-Menü mit globalen und knotenbezogenen Klappbefehlen

**Nutzerwunsch:** Neben dem Datei-Menü globale Befehle zum Auf-/Zuklappen anbieten und dieselben Befehle ab einem markierten Knoten auf dessen Teilbaum anwenden.

**Umsetzung:** Ein „Ansicht“-Menü in der Kopfzeile bietet „Alles auf-/zuklappen“ sowie „Ab hier auf-/zuklappen“. Jeder Knoten hat dafür eine zugängliche Markierungsschaltfläche. Die Teilbaumoperation umfasst den markierten Knoten und alle darunter verschachtelten Knoten. Ohne Markierung sind nur die globalen Befehle aktiv.

**Überprüfung:** `npm run build` und `git diff --check`; interaktive Baumtests im Zielbrowser stehen noch aus.

## 2026-11-07 – Kopfmenüs als erweiterbare Menüleiste gruppiert

**Nutzerwunsch:** Die Menüpunkte in der Kopfzeile sollen eine zusammenhängende Leiste bilden, die später weitere Punkte aufnehmen kann.

**Umsetzung:** Datei- und Ansicht-Menü sind in einer semantischen Hauptnavigation mit gemeinsamem Rahmen, gleicher Höhe und Trennlinie gruppiert. Weitere Kopfmenüs können als zusätzliche Segmente ergänzt werden.

**Überprüfung:** `npm run build` und `git diff --check`.

## 2026-11-07 – Markieren und Bearbeiten als Knotentoolbar gruppiert

**Nutzerwunsch:** Die Aktionen zum Markieren und Editieren eines Knotens sollen – wie die Hauptmenüpunkte – als zusammenhängende kleine Leiste erscheinen.

**Umsetzung:** Beide Icons sind in einer gemeinsamen, abgerundeten Werkzeugleiste mit Trennlinie gruppiert. Markierungszustand, Tastaturfokus und getrennte zugängliche Aktionsnamen bleiben erkennbar.

**Überprüfung:** `npm run build` und `git diff --check`.

## 2026-11-07 – Teilbaumsteuerung direkt an jedem Knoten

**Nutzerwunsch:** In der Knotentoolbar zwei zusätzliche Icons zum Auf- und Zuklappen des Baums ab genau diesem Knoten ergänzen.

**Umsetzung:** Zwei Pfeilsymbole steuern den jeweiligen Knoten einschließlich aller Nachkommen direkt. Bei Knoten ohne Kinder sind die Aktionen deaktiviert. Die globalen und markierungsbasierten Funktionen im Ansicht-Menü bleiben parallel verfügbar.

**Überprüfung:** `npm run build` und `git diff --check`; Teilbaumverhalten im Zielbrowser noch interaktiv prüfen.
## 2026-11-07 – Vertikale alternative Baumansicht

**Nutzerwunsch:** Eine zweite Darstellung ergänzen, bei der die Familienwurzel oben und Nachkommen darunter angeordnet werden. Umschalten über das vorhandene Ansichtsmenü; beide Scrollrichtungen sind akzeptabel.

**Umsetzung:** Im Ansichtsmenü kann zwischen horizontaler und vertikaler Anordnung gewechselt werden. Beide Ansichten verwenden unverändert dieselben Familien- und Beziehungsdaten sowie dieselben Auf-/Zuklapp-, Markier- und Bearbeitungsfunktionen. Die vertikale Ansicht ordnet Geschwister nebeneinander und die Nachkommenschaft in darunterliegenden Ebenen an; bei breiten Familien ist die Baumfläche horizontal scrollbar.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Visuelle Prüfung im Zielbrowser noch ausstehend.

**Nachbesserung:** Auf Rückmeldung zur Lesbarkeit wurden die Beziehungsknoten in der vertikalen Ansicht als klar abgegrenzte Karten gestaltet. Partner, Partnerschaftsstatus, Kinderzahl und Aktionen erhalten getrennte Flächen; Partnerkarten verhindern das Überlappen langer Namen und Datumsangaben. Die horizontale Ansicht bleibt unverändert.

**Layoutkorrektur:** Bei tiefen Bäumen reicht eine feste Kartenbreite pro Kind nicht aus, weil ein Kind seinerseits einen breiten Nachkommenzweig haben kann. Die Breite der vertikalen Knoten und Nachkommenreihen richtet sich nun nach ihrem Inhalt und den darunterliegenden Zweigen. Die Baumfläche wächst in der Breite und bleibt scrollbar, statt Zweige übereinanderzuschieben.

## 2026-11-07 – Zoomen und Gesamtansicht

**Nutzerwunsch:** Weit herauszoomen können, um den gesamten Baum überblicken zu können.

**Umsetzung:** Das Ansichtsmenü erhält einen Zoomregler von 5 bis 125 Prozent, Plus/Minus-Schritte und eine Rückkehr auf 100 Prozent. „Gesamtansicht“ klappt alle Äste auf, misst die vollständige Baumfläche und passt sie in den sichtbaren Arbeitsbereich ein. Die Scrollfläche bleibt für anschließendes Navigieren verfügbar. Dafür wird die CSS-`zoom`-Eigenschaft genutzt, die im Unterschied zu `transform: scale()` auch die Layoutgröße und damit die Scrollfläche beeinflusst.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Zoom-/Fit-Verhalten im Zielbrowser noch visuell und mit großen Testbäumen prüfen.

## 2026-11-07 – Recherche zu Darstellungen großer Familienstrukturen

**Fragestellung:** Wie stellen etablierte Genealogie- und Genogrammprogramme große, verzweigte Familien und die dazugehörigen Beziehungen dar?

**Befunde:** FamilySearch und Ancestry bieten mehrere Ansichten für unterschiedliche Aufgaben (u. a. Vorfahren-/Nachkommen-/vertikale Ansichten), nicht nur einen universellen Baum. GenoPro modelliert eine Partnerschaft als eigenes Familien-/Union-Objekt: Eltern werden mit dieser Union verbunden, und Kinder hängen an derselben Union. Das macht Geschwister und mehrere Partnerschaften strukturell eindeutig. GenoPros Regeln nennen ältestes Kind links und jüngstes rechts; solche fachlichen Ordnungsregeln sollten wir nur übernehmen, wenn Reihenfolge bekannt ist, und keine Geschlechtsannahmen machen, da unser Import diese Information nicht liefert. GenoPro weist außerdem selbst auf Grenzen automatischer Anordnung und mögliche Überlappungen hin. Für Layoutalgorithmen bieten D3 einen kompakten „tidy tree“-Ansatz und Eclipse ELK Layered ein generisches mehrstufiges Verfahren mit Kreuzungsminimierung und orthogonaler Kantenführung. Gramps trennt interaktive/inhaltliche Genealogie von spezialisierten druckbaren Diagrammberichten und bietet eigene Optionen für große Nachkommen- und Wanddiagramme.

**Konsequenz für das Projekt:** Datenmodell, interaktive Arbeitsansicht und Drucklayout bleiben getrennte Verantwortlichkeiten. Beziehungen werden als eigene Knoten/Verbindungen modelliert, nicht durch visuelle Nähe allein. Für interaktive Erkundung sind fokussierbare Ausschnitte, Ein-/Ausklappen, Zoom/Schwenken und Such-/Zentrierfunktionen besser skalierbar als eine stets vollständig sichtbare Riesenfläche. Für Druck/PDF sind eine eigene Layoutpipeline, Seitenteilung oder gezielte Großformate sowie Querverweise zwischen Teilblättern vorzusehen. Ein Layoutalgorithmus ist noch nicht ausgewählt: Der nächste sinnvolle Schritt ist ein synthetischer Testdatensatz mit mehreren Partnerschaften, vielen Geschwistern, tiefen Unterbäumen und unbekannten Angaben, an dem wir die aktuelle CSS-Ansicht gegen einen maßbasierten Graphlayout-Prototyp vergleichen.

**Quellen:** [FamilySearch – Pedigree views](https://articles.familysearch.org/hc/en-us/articles/41618272689051-What-are-the-different-pedigree-views-in-Family-Tree), [Ancestry – Tree layouts](https://help.ancestry.com/hc/en-us/articles/53933302401299-Tree-Layouts-Horizontal-Vertical-Fan-and-Map-Views), [GenoPro – Union/Marriage model](https://genopro.com/help/families/), [GenoPro – Genogram layout rules](https://genopro.com/genogram/rules/), [GenoPro – AutoArrange limitations](https://genopro.com/help/autoarrange/), [D3 tree layout](https://d3js.org/d3-hierarchy/tree), [Eclipse ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html), [Gramps – graphical reports](https://www.gramps-project.org/wiki/index.php/Gramps_3.0_Wiki_Manual_-_Reports), [Gramps – pedigree print chart](https://www.gramps-project.org/wiki/index.php/PedigreeChart).

## 2026-11-08 – Editor-Dialog vom Klappzustand entkoppelt

**Problem:** Der Editor wurde innerhalb des einklappbaren `<details>`-Knotens gerendert. Native `<summary>`-Aktivierung konnte den Knoten beim Klick auf eine Aktion zusätzlich schließen und dadurch den Dialog verbergen.

**Umsetzung:** Aktionsklicks verhindern die native Summary-Aktivierung in der Capture-Phase. Der Editor wird außerdem als React-Portal direkt unter `document.body` gerendert und ist damit unabhängig von Sichtbarkeit und Clipping des Kartenbaums.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich; Dialogverhalten nach wiederholtem Auf-/Zuklappen noch manuell prüfen.

## 2026-11-08 – Eingeklappte Zweige aus dem Layoutfluss entfernen

**Beobachtung:** Die vertikale Kartenansicht ließ zwischen Zweigen viel Platz frei, obwohl die betreffenden Nachkommen eingeklappt waren.

**Ursache und Umsetzung:** Eine explizite `display: flex`-Regel am Inhaltscontainer konnte die native Ausblendung geschlossener `<details>`-Inhalte überstimmen. Geschlossene Familienknoten blieben dadurch im Layoutfluss und reservierten Fläche für unsichtbare Nachkommen. Eine gezielte CSS-Regel blendet nun deren direkten Inhaltsbereich aus; aufgeklappte Kinder werden weiterhin regulär angeordnet.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Kompaktheit und Verbindungslinien nach dem Auf-/Zuklappen noch visuell prüfen.

## 2026-11-08 – Überlappende Karten in der vertikalen Ansicht verhindern

**Beobachtung:** Bei breiten, aufgeklappten Unterbäumen konnten Karten mit benachbarten Zweigen überlappen.

**Ursache und Umsetzung:** `person-branch` war auf eine Viewport-abhängige maximale Breite begrenzt, obwohl darin liegende Nachkommen breiter sein konnten. Die sichtbare Überbreite floss so nicht in den Platzbedarf des Eltern-Zweigs ein. Die Begrenzung wurde entfernt; Zweigcontainer behalten nun ihre intrinsische `max-content`-Breite, sodass benachbarte Zweige entsprechend weiter rücken und die Baumfläche bei Bedarf horizontal wächst.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Die überlappende Beispielkonstellation muss im Browser erneut geprüft werden.

## 2026-11-08 – Optionale Stapelung von Kindern ohne sichtbare Nachkommen

**Nutzerwunsch:** In der vertikalen Ansicht sollen alle Kinder einer Geschwistergruppe optional untereinander stehen können, sobald keines davon aktuell sichtbare Nachkommen zeigt. Der Familien-/Partnerschaftsstatus ist dabei nicht entscheidend.

**Umsetzung:** Im Ansichtsmenü gibt es eine separate Option. Geschwister werden aufsteigend nach bekannten Geburtsdaten sortiert; fehlende Daten stehen stabil am Ende. Per CSS `:has()` richtet sich die Stapelung dynamisch nach dem aktuellen Klappzustand: Sobald ein Kindknoten geöffnet ist und Nachkommen zeigt, wird die Gruppe wieder horizontal dargestellt. Das funktioniert auch zusammen mit dem allgemeinen Nachkommen-Umbruch.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Sortierung, dynamischer Layoutwechsel und Verbindungslinien nach Auf-/Zuklappen noch visuell prüfen.

## 2026-11-08 – Vertikale Kartenbreite reduzieren

**Nutzerwunsch:** In der vertikalen Ansicht beanspruchen die Knoten zu viel horizontale Fläche.

**Umsetzung:** Die zuvor einheitliche Kartenbreite wurde von 380 auf 280 CSS-Pixel reduziert. Eine CSS-Variable steuert Karten, Personen-Zusammenfassungen und Zweig-Mindestbreiten gemeinsam. Namen und Datumszeilen bleiben einzeilig und werden bei Bedarf gekürzt; Kartenhöhe und Bedienleiste bleiben stabil.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Lesbarkeit längerer Namen und Datumsangaben im Browser noch prüfen.

## 2026-11-08 – Geburts- und Sterbedaten in Karten trennen

**Nutzerwunsch:** Geburts- und Sterbeangaben sollen in den Karten separat untereinander statt in einer gemeinsamen Zeile stehen.

**Umsetzung:** Die Personenzusammenfassung rendert beide Angaben nun als eigene Zeilen. In der vertikalen Kartenansicht werden lange Werte innerhalb der Zeile gekürzt, ohne die feste Kartenhöhe zu verändern.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich.

## 2026-11-08 – Verbindung zum Geschwisterbalken schließen

**Nutzerwunsch:** Die Verbindungslinie von der Partnerschaft bis zur unteren Kinder-/Geschwisterlinie durchzeichnen.

**Umsetzung:** Den senkrechten Verbindungsabschnitt über der Kinderreihe bis zum Geschwisterbalken verlängert, sodass die zuvor sichtbare Lücke geschlossen wird.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich; Browserdarstellung noch nicht visuell geprüft.

## 2026-11-08 – Kinder einzeln anbinden

**Nutzerwunsch:** Abstammungslinien sollen einzeln zu den Kindern führen, ohne seitlich überstehende Verbindungslinie.

**Umsetzung:** Den gemeinsamen Geschwisterbalken entfernt. Die Genogramm-Ansicht misst nun lokal die Positionen der Partnerschaft und der direkt zugehörigen Kindknoten und zeichnet für jedes Kind eine eigene geschwungene SVG-Verbindung. Die Linie endet jeweils am Personen-Knoten.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich; neue Linienführung im Browser noch visuell zu prüfen.

## 2026-11-08 – Eltern pro Kind zuordnen

**Nutzerwunsch:** Kinder können gemeinsame Kinder beider Eltern oder nur einem Elternteil zugeordnet sein; diese Information soll in Daten und Diagramm unterscheidbar werden.

**Befund:** Die Datenbank speicherte Eltern-Kind-Links bereits einzeln. Der Excel-Import fügte jedoch automatisch auch den Partner der erkannten Elternperson hinzu, und die Genogrammzeichnung verband jedes Kind mit dem Paar. Damit wurde eine Annahme als Tatsache dargestellt.

**Umsetzung:** In der Excel-Vorschau kann pro Kind die Partnerperson als zweiter Elternteil abgewählt werden; die bisherige Zuordnung zu beiden bleibt als sichtbare, vorgewählte Interpretation erhalten. Im Knoteneditor kann für jedes angezeigte Kind jede Elternperson einzeln zu- oder abgewählt und die Art der Elternschaft (ungeklärt, biologisch, adoptiv, Pflege, Stief- oder sozial) separat festgelegt werden. Das Speichern ersetzt nur die Links zu den gerade bearbeiteten Eltern; andere Elternverbindungen bleiben unangetastet. Die Genogrammlinien gehen bei gemeinsamer Elternschaft gleicher Art von der Paarverbindung, bei nur einem Elternteil von dessen Card aus. Unterschiedliche Elternschaftsarten werden als getrennte, entsprechend formatierte Linien gezeichnet. Archivformat und Tabellenschema waren bereits für einzelne Links und Typangaben vorbereitet.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Ein interaktiver Browser-Test der Vorschau, Bearbeitung und Linienführung steht noch aus.

## 2026-11-08 – Generationenabstand vergrößern

**Nutzerwunsch:** Den Abstand zwischen den Generationen-Zeilen ungefähr verdoppeln.

**Umsetzung:** Vertikalen Abstand zwischen Eltern- und Kinderreihe in der Genogramm-Ansicht von 30 auf 60 Pixel erhöht. Die dynamisch berechneten Verbindungskurven folgen dem größeren Abstand.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich.

## 2026-11-08 – Erste strukturelle Genogramm-Ansicht

**Nutzerwunsch:** Die bestehende Baumdarstellung in Richtung einer fachlich lesbaren Genogramm-Darstellung weiterentwickeln.

**Umsetzung:** Im Ansichtsmenü gibt es nun eine zusätzliche Genogramm-Ansicht neben Horizontal und Vertikal. Sie zeichnet Partnerschaften als Paar mit Status und ggf. Datum, ordnet die Kinder darunter an und erhält auf- und zuklappbare Familienzweige. Todesdaten werden zusätzlich durch einen Schrägstrich am neutralen Personensymbol markiert. Eine Legende erläutert die Linien und weist ausdrücklich darauf hin, dass unbekanntes Geschlecht und Elternschaft nicht interpretiert werden. Die bisherigen Ansichten bleiben erhalten.

**Abgrenzung:** Da die Quelldaten keine belastbare Information zur Personensymbolik enthalten, verwendet die erste Stufe für alle Personen ein neutrales Fragezeichen-Symbol. Symbolauswahl zur manuellen Korrektur sowie differenzierte Partnerschafts- und Elternschaftsarten benötigen noch eine versionierte Datenbankmigration und folgen als eigener Schritt. Haushaltsgrenzen und emotionale Beziehungen bleiben optionale, separate Erweiterungsebenen.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich; visuelle Prüfung im Browser steht noch aus.

## 2026-11-08 – Geschlechtsangabe pro Person

**Nutzerwunsch:** Für jede Person eine Geschlechtsangabe ergänzen.

**Umsetzung:** Der Knotendialog enthält nun ein Feld „Geschlecht (für Genogramm-Symbol)“ mit den Optionen weiblich, männlich, nicht-binär und unbekannt/keine Angabe. Die Genogramm-Ansicht nutzt Kreis, Quadrat, Raute bzw. ein neutrales Fragezeichen. Excel-Daten werden nicht automatisch klassifiziert. Die lokale Datenbank erhält eine versionierte Migration auf Schema v2; alte Datensätze und JSON-Archive ohne Angabe werden auf „unbekannt“ gesetzt.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Migrationen und Archivkompatibilität sind im Code berücksichtigt; für die laufende lokale Browserdatenbank sollte nach App-Neustart die Migration visuell bzw. durch Bearbeiten/Speichern eines Knotens geprüft werden.

## 2026-11-08 – Geschlechtsformen als Personen-Cards

**Nutzerwunsch:** Weibliche Personen rund, männliche Personen rechteckig abbilden.

**Umsetzung:** Die Genogramm-Ansicht stellt jetzt die gesamte Personen-Card rund bzw. rechteckig dar, statt nur ein kleines Symbol anzuzeigen. Nicht-binäre und unbekannte Angaben haben eigene gestrichelte bzw. gepunktete neutrale Formen; die Legende wurde entsprechend erweitert.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich; Browserdarstellung noch nicht visuell geprüft.

## 2026-11-08 – Partnerschaftssymbol im Genogramm

**Nutzerwunsch:** Die Beschriftung „verheiratet“ durch das Unendlichkeitszeichen ersetzen.

**Umsetzung:** Bei verheirateten Partnerschaften zeigt die Genogramm-Ansicht nun `∞` und – falls erfasst – weiterhin das Datum. Unbekannter Partnerschaftsstatus bleibt ausgeschrieben, damit er nicht als Eheschließung missverstanden wird.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich.

## 2026-11-08 – Eingangslinie am linken Partner ausrichten

**Nutzerwunsch:** Die von oben kommende Abstammungslinie soll am linken Personen-Knoten des Paares anschließen.

**Umsetzung:** Der vertikale Anschluss eines Kindknotens mit Partnerschaft ist nun auf die Mitte der linken Card versetzt. Für neutrale Cards mit abweichender Breite wird der Versatz angepasst; die horizontale Partnerschaftslinie bleibt unverändert.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich; Browserdarstellung noch nicht visuell geprüft.

## 2026-11-08 – Recherche: Vom Familienbaum zum Genogramm

**Fragestellung:** Welche Konventionen aus dem gezeigten Genogramm sind übertragbar, und welche Daten fehlen im jetzigen Diagramm?

**Befunde:** Es existiert keine vollständig einheitliche Notation; GenoPro weist auf Varianten hin. Verbreitete Grundformen sind geschlechtsspezifische Symbole, Partnerlinie, Kindschaftslinie und Kennzeichnungen für Status/Trennung/Tod. Praxisleitfäden betonen eine Legende, die auch abweichende oder zusätzliche Symbole erklärt. Beispielgrafiken können außerdem Haushalt, Indexperson, Elternschaftsart, emotionale Beziehungen und Kontextnotizen darstellen. Das sind unterschiedliche Bedeutungen und sollten nicht in dieselbe Kante codiert werden. GEDCOM 7 dient genealogischem Datenaustausch, nicht als Genogramm-Zeichenstandard; `SEX` bezeichnet darin Geschlecht bei Geburt, und Rollen sollen nicht aus Partnerpositionen abgeleitet werden.

**Konsequenz:** Das bestehende Modell mit `person`, `partnership` und `parent_child` ist eine brauchbare strukturelle Basis. Für eine fachlich reichere Genogramm-Darstellung fehlen explizite Personen-Symbolmerkmale, differenzierte Partnerschaftszustände, Haushaltsmitgliedschaften sowie optional Elternschaftstypen und emotionale Beziehungen. Weil diese Angaben im Excel fehlen, nichts aus Namen oder Spaltenposition erraten. Empfehlung: zunächst strukturelles Diagramm mit neutralen unbekannten Symbolen und Legende; danach bewusst ausgewählte Erweiterungsebenen. Vollständige Einordnung und Quellen stehen in `PROJECT_NOTES.md`.

**Quellen:** [GenoPro Symbole](https://genopro.com/genogram/symbols/), [GenoPro Layoutregeln](https://genopro.com/genogram/rules/), [Research in Practice Leitfaden](https://www.researchinpractice.org.uk/media/mkydyt3f/cf_pt_using-genograms-in-practice_final.pdf), [NCBI Bookshelf, Genogramm-Notation](https://www.ncbi.nlm.nih.gov/books/NBK64093/), [FamilySearch GEDCOM 7](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html).

## 2026-11-08 – Kartenbreite weiter reduzieren

**Nutzerwunsch:** Nach dem Vergrößern der Kartenhöhe sollte die horizontale Breite weiter schrumpfen.

**Umsetzung:** Die einheitliche Breite der vertikalen Karten wurde von 280 auf 240 Pixel angepasst. Layoutcontainer verwenden dieselbe Breitenvariable, damit keine unsichtbaren Mindestbreiten die Ersparnis aufheben.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich. Längere Namen und die Bedienleiste im Browser prüfen.

## 2026-11-08 – Kartenhöhe an getrennte Datumszeilen anpassen

**Beobachtung:** Nach der Trennung von Geburts- und Sterbedatum in zwei Zeilen war die bisherige Höhe der Personenfelder zu knapp.

**Umsetzung:** Die Partnerfelder erhalten nun 48 statt 38 Pixel Höhe; die einheitliche vertikale Kartenhöhe steigt von 180 auf 190 Pixel. Dadurch passen Name und beide Datumszeilen in die Karten, ohne variable Kartenhöhen zu erzeugen.

**Überprüfung:** `npm run build` und `git diff --check` erfolgreich.
## 2026-11-08 - Monat-genaue Datumsangaben

**Umsetzung:** Datumsangaben akzeptieren nun Jahr, Monat/Jahr (`MM.JJJJ`, zusätzlich ausgeschriebene deutsche Monatsnamen) und vollständigen Tag. Genauigkeit `month` wird in der bestehenden Browserdatenbank per Schema-v3-Erweiterung verlustfrei erhalten und im JSON-Archiv abgebildet; bei der Speicherung wird kein konkreter Tag fingiert.
## 2026-11-08 - Ansichts- und Fallzustand lokal merken

**Umsetzung:** Der zuletzt aktive Fall wird lokal im Browser wiederhergestellt. Je Fall werden Ansicht, eigener Zoom pro Darstellungsmodus, Layoutoptionen, Genogramm-Einklappzustände und Scrollposition gespeichert. Die Einstellungen enthalten keine Familiendaten.

## 2026-11-08 - Änderungen bis zum JSON-Export kenntlich machen

**Umsetzung:** Erfolgreich gespeicherte Bearbeitungen und neu angelegte Personen erhöhen nun je Fall einen lokal persistierten Zähler. Der auffällige Footer-Badge öffnet einen JSON-Exportdialog; erst nach ausgelöstem Download wird der Zähler dieses Falls zurückgesetzt. Die Oberfläche unterscheidet damit lokale Autospeicherung von einer extern gesicherten JSON-Kopie.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Ansichtsmenü überarbeiten

**Umsetzung:** Das Ansichtsmenü ist in Darstellung, Zoom, Gesamtbaum und markierten Zweig gegliedert. Darstellungsarten und Zoomaktionen haben klare Symbole und Zustände; Aufklappaktionen sind als kompakte Schaltflächen angeordnet. Menügröße und Bedienung wurden für schmale Bildschirme angepasst.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Begrüßungs- und Startübersicht

**Umsetzung:** Wenn kein zuletzt geöffneter Fall vorhanden ist, zeigt die App eine Startseite mit kurzer Erklärung, direktem Einstieg zum Erstellen eines Genogramms oder Öffnen eines JSON-Archivs sowie einer Liste lokal gespeicherter Fälle. Ein gültiger zuletzt geöffneter Fall wird weiterhin direkt geladen. Die Startseite erklärt außerdem die lokale Speicherung und Archivübertragung.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Verwaiste Gestaltungsdaten in Archiven tolerieren

**Korrektur:** Beim Export und bei der Archivprüfung werden Farbzuordnungen zu inzwischen gelöschten Personen herausgefiltert. Solche veralteten Einträge blockieren den Import nicht mehr; gültige Gestaltungsdaten bleiben erhalten.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Gestaltung in JSON-Archiven sichern

**Umsetzung:** JSON-Export v2 enthält optionale Personenfarben und Zweigfarben. Die Archivvalidierung prüft Farbwerte und Personenverweise; Archive v1 ohne Gestaltungsdaten bleiben importierbar. Beim Import werden die Farbzuordnungen anhand der neu erzeugten Personen-IDs wiederhergestellt.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Zweighervorhebung um markierten Knoten erweitern

**Umsetzung:** Die farbige Fläche und Umrandung eines Zweigs umfasst nun auch den markierten Knoten (in der Genogramm-Ansicht einschließlich seiner Partnerschaftsgruppe) statt erst bei den Kindknoten zu beginnen. Das gilt ebenso für die Zeitachse und den PDF-Export. Die Option im Gestalten-Dialog benennt den erweiterten Umfang eindeutig.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Partner gezielt hinzufügen

**Umsetzung:** Das Knoten-Kontextmenü bietet „Partner hinzufügen“ nur für Personen ohne bestehende Partnerschaft an. Die Prüfung erfolgt zusätzlich im Datenbank-Worker, sodass auch über parallele oder direkte Aufrufe keine zweite Partnerschaft für dieselbe Person entsteht.

**Überprüfung:** Produktionsbuild erfolgreich.

## 2026-11-08 - Erste Genogramm-Gestaltung

**Umsetzung:** Im Knoten-Kontextmenü gibt es nun „Gestaltung …“. Eine kompakte Farbpalette weist einer Person einen dezenten Farbton zu, optional auch allen über Eltern-Kind-Verknüpfungen erreichbaren Nachkommen. Zusätzlich lässt sich der Kindzweig farblich hinterlegen und umranden. Einstellungen werden je Fall lokal im Browser gespeichert und verändern keine Familiendaten.

**Hinweis:** Diese erste Ausbaustufe ist eine lokale Darstellungspräferenz und noch nicht Bestandteil des JSON-Archivs. Schatten, Verläufe und frei benennbare Gruppierungen bleiben mögliche nächste Schritte.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Knoten-Kontextmenü und Zweig löschen

**Umsetzung:** Das Genogramm-Kontextmenü ist visuell gruppiert und enthält einen deutlich abgesetzten Löschbefehl. Vor dem Entfernen eines Knotens samt Nachkommen zeigt eine Bestätigung die betroffenen Personen, Partnerschaften und Elternzuordnungen. Das Löschen erfolgt lokal und transaktional; Beziehungen mit Personen außerhalb des Zweigs werden ebenfalls entfernt, damit keine verwaisten Verknüpfungen zurückbleiben. Erfolgreiches Löschen zählt als Änderung bis zum nächsten JSON-Export.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

**Nachtrag:** Unicode-Zeichen im Kontextmenü durch passende Lucide-React-Icons (Kind, Partnerschaft, Auf-/Zuklappen, Löschen) ersetzt.

## 2026-11-08 - Partner hinzufügen vorerst pausiert

**Umsetzung:** Der Befehl zum Hinzufügen eines weiteren Partners wurde aus dem Knoten-Kontextmenü entfernt, bis Mehrfachpartnerschaften zuverlässig sichtbar und zeitlich einordenbar sind. Bereits gespeicherte Beziehungen werden nicht verändert.

## 2026-11-08 - Endknoten-Löschumfang korrekt erkennen

**Beobachtung:** Beim Rechtsklick auf eine alleinstehende Person wurde durch DOM-Vorfahren-Suche irrtümlich die übergeordnete Partnerschaft als Löschwurzel gewählt.

**Umsetzung:** Ein Knoten gilt nur dann als Mitglied der nächstgelegenen Partnerschaft, wenn seine Karte tatsächlich in deren Partnerschaftszeile liegt. Einzelne Endknoten verwenden nun ihre eigene Personen-ID. Der Bestätigungsdialog unterscheidet außerdem zwischen einem Zweig mit Nachkommen und einem einzelnen Endknoten.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Familienmitglieder direkt im Genogramm hinzufügen

**Umsetzung:** Das Knoten-Kontextmenü bietet jetzt „Kind hinzufügen“ und „Partner hinzufügen“. Das Formular erfasst Personendaten, Geschlecht und optionale Datumsangaben. Bei Kindern können ein oder mehrere Eltern samt Elternschaftsart ausgewählt werden; bei Partnern bleiben Beziehungsstatus und Datum explizit editierbar. Neue Datensätze werden über ein eng typisiertes Worker-Kommando in einer Transaktion lokal gespeichert; Familiendaten verlassen den Browser nicht.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Genogramm umbenennen

**Umsetzung:** Der Titel im Genogramm-Kopf kann nun inline geändert werden. Die Änderung wird über den Datenbank-Worker dauerhaft in der lokalen SQLite-Datenbank gespeichert und zugleich in der Fallliste aktualisiert. Der JSON-Export enthält dadurch den neuen Namen; die Umbenennung wird als noch nicht extern gesicherte Änderung gezählt. Leere Namen und Namen über 200 Zeichen werden abgewiesen.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Erste großformatige PDF-Druckausgabe

**Umsetzung:** Das Genogramm kann über „PDF exportieren“ als einseitige Vektor-Druckansicht ausgegeben werden. Dafür wird aus dem Familienbaum eine separate, zoomunabhängige SVG-Geometrie aufgebaut; Namen, Datumsangaben, Partnerschaften, Abstammungslinien, Grundsymbole sowie lokale Personenfarben und Zweighervorhebungen werden in diese Ausgabe übernommen. Der Exportdialog nimmt ein frei wählbares Sonderformat in Millimetern an, zeigt eine Vorschau und warnt, wenn die Schrift rechnerisch unter 8 pt fällt. „PDF erstellen“ öffnet ein lokal erzeugtes Druckdokument und den Browserdialog; der Nutzer wählt dort „Als PDF speichern“. Familiendaten verlassen den Browser nicht.

**Einschränkungen:** Dies ist ein erster Einseiten-Prototyp, kein PDF/X-zertifizierter Druckvorstufenexport. Kachel-/Mehrseitenausgabe, garantierte Schrift-Einbettung, CMYK/ICC, PDF-Preflight und druckereispezifische Bleed-/Trim-Vorgaben bleiben offen. Vor Druckbeauftragung müssen Format und Produktionsanforderungen mit der Druckerei abgeglichen werden.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - PDF-Ausgabe: Namen und Verbindungslinien korrigiert

**Umsetzung:** Die Einstellung „Nachnamen ausblenden“ wird nun auch an den Druckrenderer übergeben. Eheschließungssymbol und Datum stehen größer und mit kontrastreicher Unterlage direkt am Partnerschaftsstrich. Eltern-Kind-Verbindungen werden mit gemeinsamem Stamm und geschwungen auffächernden Kurven ausgegeben.

**Überprüfung:** Produktionsbuild, `git diff --check` und synthetischer Test mit versteckten Familiennamen, Partnerschaftsmarkierung und zwei Geschwistern erfolgreich.

## 2026-11-08 - PDF-Linienform verfeinert

**Beobachtung:** Die kantige Geschwisterverbindung wirkte gegenüber der Genogramm-Arbeitsansicht wie ein optischer Rückschritt. Der weiße Hintergrund der Partnerschaftsbeschriftung ragte außerdem in die angrenzenden Karten.

**Umsetzung:** Die Abstammungslinien nutzen wieder eine gemeinsame senkrechte Stammverbindung mit sanft geschwungenen Abzweigungen. Der Partnerschaftstext erhält statt einer weißen Box nur noch eine schmale weiße Kontur; sie bleibt innerhalb des Verbindungsspalts und schneidet die Karten nicht mehr an.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Druckexportdialog nach Start schließen

**Beobachtung:** Nach dem Start des Browser-Druckdialogs blieb der Exportdialog in der Anwendung geöffnet. Je nach Druckdialog-/Fensterfokus konnte er anschließend nicht mehr bedient oder geschlossen werden.

**Umsetzung:** Sobald das separate Druckfenster erfolgreich geöffnet und mit dem Genogramm befüllt wurde, schließt sich der Exportdialog der Anwendung. Wird das Popup blockiert, bleibt der Dialog für einen erneuten Versuch geöffnet und zeigt weiterhin den Fehlerhinweis.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - PDF-Elternverbindungen an Personenkarte anbinden

**Beobachtung:** Bei Kindern mit eigener Partnerschaft zielten PDF-Abstammungslinien auf die Mitte des gesamten Zweigs. Diese liegt häufig zwischen den Partnerkarten statt auf der Karte des tatsächlichen Kindes.

**Umsetzung:** Der Druckrenderer löst die Zielposition jetzt anhand der tatsächlich platzierten Personenkarte auf. Für unverpartnerte Kinder bleibt die bisherige Position erhalten; verbundene Kinder werden direkt an ihrer Karte getroffen.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - PDF-Zweigrahmen gleichmäßig ausrichten

**Beobachtung:** Farbige Zweigrahmen saßen bislang direkt an der Unterkante der letzten Kinderkarten, während oben und seitlich Abstand sichtbar war.

**Umsetzung:** Zweigrahmen erhalten nun eine einheitliche Innenluft auf allen Seiten und umfassen die tatsächliche Höhe der Kindgenerationen. Dadurch bleibt auch unter der letzten Karte derselbe klare Abstand wie seitlich.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Fiktives Fünf-Generationen-Beispiel

**Umsetzung:** Unter `docs/examples/` liegt nun ein zweites Genogramm-Archiv mit 28 vollständig erfundenen Personen aus fünf Generationen. Namen, Lebensdaten und Partnerschaftsjahre sind generationstypisch und chronologisch plausibel; Eltern-Kind-Zuordnungen bilden mehrere Seitenzweige ab.

**Überprüfung:** JSON- und Schema-Validierung sowie Prüfung der Generationentiefe und Datumsreihenfolge erfolgreich.

## 2026-11-08 - GitHub-Pages-Pfad und automatischer Build

**Beobachtung:** Die Projektseite wurde ohne korrekten Vite-Basispfad ausgeliefert; Assets wurden von der Domainwurzel statt aus `/cherware-genogram/` angefordert. Im Repository fehlte außerdem ein Workflow, der die Vite-Anwendung vor der Veröffentlichung baut.

**Umsetzung:** GitHub-Actions-Builds verwenden nun den Repository-Unterpfad als Vite-Basis; lokal bleibt der Standardpfad `/`. Ein Pages-Workflow installiert Abhängigkeiten, baut `dist` und veröffentlicht dieses Build-Artefakt bei Pushes auf `main`.

**Überprüfung:** Produktionsbuild mit simuliertem GitHub-Actions-Umfeld und Prüfung der erzeugten Asset-URLs erfolgreich.

## 2026-11-08 - Genogramm ohne Import neu anlegen

**Umsetzung:** Fallübersicht und Datei-Menü bieten nun „Neues Genogramm“. Das Formular erfasst Titel und erste Person; Fall und Wurzelperson werden gemeinsam in einer Worker-Transaktion lokal gespeichert. Der neue Fall wird direkt geöffnet und als noch nicht extern gesichert gezählt; weitere Personen können anschließend über die Knotenaktionen ergänzt werden.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Generationen im Genogramm hervorheben

**Umsetzung:** Die Genogramm-Ansicht bietet nun editierbare Geburtsjahr-Zeiträume für Stille Generation, Babyboomer, Generation X, Millennials/Generation Y, Generation Z und Alpha. Eine optionale Ansichtssteuerung markiert passende Personenkarten mit einem dezenten farbigen Hintergrund und Generationsnamen. Schalter und Definitionen werden pro Fall lokal im Browser gespeichert. Die Grenzen sind an verbreiteten Kohorteneinteilungen orientiert und ausdrücklich bearbeitbar.

**Ergänzung:** Bei aktivierter Hervorhebung führt die Legende die Generationen mit Farbfeld und jeweiligem Geburtszeitraum auf.

**PDF-Ergänzung:** Wenn die Generationen-Hervorhebung in der Ansicht aktiviert ist, übernimmt der vektorbasierte Druckexport die Farbtönung und Bezeichnung an den Personen sowie die Generationenliste mit Zeiträumen in die PDF-Legende.

## 2026-11-08 - Geburtsbasierte Zeitachsenansicht

**Umsetzung:** Die Darstellungsoption „Zeitachse“ ordnet Personen nach Geburtsjahr an einer vertikalen Jahresachse an und zeichnet Partnerschafts- und Elternverbindungen. Personen ohne Geburtsjahr erscheinen in einem separat markierten Bereich. Die bisherige Genogramm-Ansicht bleibt als unabhängige Option erhalten; Darstellung, Zoom und Scrollposition werden pro Fall und Ansicht gespeichert.

**Ausrichtung:** Die Zeitachse läuft chronologisch von älteren Jahrgängen oben zu jüngeren unten, damit Eltern-Kind-Verbindungen der üblichen Leserichtung im Genogramm folgen.

**Verbindungsdarstellung:** Gemeinsam zugeordnete Eltern werden im Zeitstrahl als gemeinsamer Beziehungsausgangspunkt behandelt; pro Kind wird nur eine Elternverbindung gezeichnet statt einer Linie je Elternzuordnung.

**Generationen:** Die optionalen Generationseinstellungen gelten jetzt auch im Zeitstrahl. Sichtbare Geburtsjahresbereiche erhalten dezente, beschriftete Hintergrundbänder; der bestehende Schalter und Dialog steuern sie.

**Bedienung und Gestaltung:** Auch im Zeitstrahl kann die Arbeitsfläche per Mausrad gezoomt und durch Ziehen verschoben werden. Knoten lassen sich markieren und per Kontextmenü bearbeiten, gestalten, erweitern oder löschen; Ein- und Ausklappbefehle sind dort nicht vorgesehen. Personenfarben und farbig umrahmte Kindzweige werden in dieser Ansicht ebenfalls dargestellt.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

**Überprüfung:** Produktionsbuild erfolgreich.

## 2026-11-08 - Kinderreihenfolge anpassen

**Umsetzung:** Im Knoten-Kontextmenü können Geschwisterknoten jeweils eine Position nach links oder rechts verschoben werden. Die gewählte Reihenfolge wird pro Fall lokal als Ansichtspräferenz gespeichert und in Genogramm, Zeitachse, Listenansichten und Drucklayout berücksichtigt. Die Familienbeziehungen selbst werden dabei nicht verändert.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Verbindungslinien beim Generationenabstand aktualisieren

**Korrektur:** Die Connector-Neuberechnung reagiert jetzt explizit auf Änderungen des Generationenabstands. So werden die Eltern-Kind-Linien im Genogramm direkt nach der Layoutänderung an die neuen Kartenpositionen angepasst.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - About-Fenster und Commit-Buildnummer

**Umsetzung:** Die Kopfzeile enthält ein About-Fenster mit Kurzbeschreibung, lokalen Speicher-/Sicherungshinweisen und Versionsanzeige. Die Buildversion wird aus `package.json`-Major/Minor und der Anzahl der Git-Commits ermittelt; GitHub Pages lädt dafür die vollständige Historie. Bei fehlenden Git-Metadaten wird die Paketversion verwendet.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.

## 2026-11-08 - Menü-Hoverflächen bündig ausrichten

**Korrektur:** Die Hover- und Fokusflächen der Datei-, Ansicht- und Über-Menüpunkte füllen jetzt jeweils bündig ihre gesamte Höhe aus. Innenabstände und Rundungen folgen der gemeinsamen Menükontur; die Trenner bleiben konsistent.

**Überprüfung:** Produktionsbuild und `git diff --check` erfolgreich.
