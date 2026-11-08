# Genogramm-WebApp

Browserbasierte Anwendung zum Importieren, Prüfen, Bearbeiten und späteren großformatigen Exportieren von Genogrammen. Die Anwendung soll ohne Anwendungsserver für Familiendaten auskommen; echte Daten bleiben im Browser des Anwenders.

## Projektstatus

Frühes MVP. React/TypeScript, SQLite-WASM/OPFS, lokale Excel-Importvorschau, eine ausklappbare Fall-/Familienstrukturansicht, manuelle Korrekturen sowie JSON-Archivimport/-export sind eingerichtet. Gespeicherte Fälle werden beim Öffnen der App wieder aus dem lokalen Speicher geladen. Änderungen an der Familienstruktur und PDF-Ausgabe sind noch nicht implementiert.

## Leitplanken

- React und TypeScript sind die bevorzugte UI-Basis.
- SQLite WASM mit OPFS ist die bevorzugte lokale Persistenzoption, vorbehaltlich eines Browser-Prototyps und dokumentierter Fallback-/Fehlerzustände.
- Personen- und Familiendaten gehören nicht in Git. `/data/` ist lokal ignoriert. Das Repository enthält ausschließlich synthetische Beispieldaten.
- Import läuft lokal im Browser und bekommt eine Vorschau mit Validierung, bevor Daten übernommen werden.
- Das fachliche Datenmodell bleibt unabhängig von der Darstellung. Layout, Symbolik und spätere PDF-Ausgabe werden getrennt behandelt.
- Genogramme erhalten eine sichtbare Legende; Abweichungen von der gewählten Symbolkonvention werden kenntlich gemacht.
- Architekturentscheidungen und wichtige KI-gestützte Arbeitsschritte werden zeitnah protokolliert.

## Konzeptbewertung

Die vorgeschlagene Richtung ist tragfähig. SQLite passt zu strukturierten Personen-, Familien- und Beziehungsdaten. OPFS ermöglicht persistente Browserablage, hat aber Browser-, Quota- und Betriebsbedingungen. SQLite empfiehlt OPFS-Zugriff aus einem Worker; VFS-Auswahl und ggf. COOP/COEP-Header beeinflussen Unterstützung und Mehrtab-Nutzung. OPFS selbst ist keine garantierte Sicherung und wird durch Löschen der Website-Daten entfernt. Deshalb braucht die App verständliche Sicherungs- und Wiederherstellungswege.

Für das Fachmodell sollte die App mindestens Personen, Eltern-Kind-Verbindungen, Partnerschaften/Unionen und deren Lebenszeiträume sowie optionale Genogramm-Beziehungsmerkmale abbilden. Eine Person darf nicht auf eine einzelne biologische oder soziale Geschlechtsannahme reduziert werden. Herkunft/Unsicherheit von Angaben und Darstellungslayout sollten separat modelliert werden. Dieses Modell wird erst nach Sichtung der Excel-Beispieldatei konkretisiert.

GEDCOM 7 ist ein etablierter Standard für Austausch genealogischer Daten und kann später für einen Teil der Daten nützlich sein. Es deckt den besonderen Zweck eines Genogramms – etwa emotionale Beziehungsmuster, frei wählbare klinische Annotationen und druckspezifische Diagrammgestaltung – nicht allein ab. GEDCOM sollte daher eine optionale Import-/Exportschnittstelle sein, nicht das interne Datenmodell.

Für Genogramm-Symbole gibt es verbreitete Konventionen, aber keine universell verbindliche Notation für alle Fachrichtungen und Anwendungsfälle. Wir sollten zu Beginn eine nachvollziehbare Grundnotation wählen, sie mit einer Legende ausgeben und kundenspezifische bzw. nicht-standardisierte Zeichen konfigurierbar halten.

## Datenschutz und Betrieb

„Nur im Browser“ bedeutet: keine Übermittlung der Familiendaten an einen Anwendungsserver. Es bedeutet nicht automatisch Verschlüsselung oder dauerhafte Verfügbarkeit. Browserprofile, Gerätezugriff, Erweiterungen, Speicherlöschung, Quota und private Fenster bleiben relevant. Für die Umsetzung sind deshalb zusätzlich zu prüfen: keine Telemetrie mit Inhaltsdaten, möglichst wenige Drittanbieter-Skripte, restriktive Sicherheitsheader, Speicherstatus, klare Warnungen bei nicht verfügbarem OPFS sowie expliziter Datenexport und Wiederherstellung. Diese Punkte sind technische Produktanforderungen, keine Behauptung rechtlicher Konformität.

## Nächste Schritte

1. Ausklappbare Fallansicht im Zielbrowser mit vorhandenen lokalen Daten praktisch prüfen.
2. Bearbeitung und Ergänzung gespeicherter Personen/Beziehungen spezifizieren und umsetzen.
3. Sicherung/Wiederherstellung entwerfen, bevor echte Daten produktiv eingesetzt werden.
4. Genogramm-Layout und großformatigen Vektorexport entwerfen.

## Entwicklung

Voraussetzung: Node.js 22.12 oder neuer.

```powershell
npm install
npm run dev
```

Produktionsbuild: `npm run build`. Die App lädt SQLite WASM im Worker und verlangt für den aktuellen Prototyp einen persistenten OPFS-Speicher. Falls er nicht verfügbar ist, nimmt sie keine Daten entgegen und fällt nicht stillschweigend auf flüchtigen Speicher zurück.

## Lokales Archiv

Im Bereich „Deine Genogramme“ lässt sich der ausgewählte Fall als versioniertes JSON-Archiv exportieren. Der Import prüft das Format und legt den Fall als zusätzlichen Datensatz an, ohne vorhandene Fälle zu überschreiben. Das Format ist durch [`genogram-archive.schema.json`](src/backup/genogram-archive.schema.json) definiert; eine erfundene Beispieldatei liegt unter [`docs/examples/genogram-archive-v1.example.json`](docs/examples/genogram-archive-v1.example.json). Archive enthalten Familiendaten unverschlüsselt und müssen entsprechend sicher aufbewahrt werden.

## Quellen und Orientierung

- [SQLite WASM: Persistenz und OPFS](https://www.sqlite.org/wasm/doc/trunk/persistence.md)
- [MDN: Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [MDN: Speicherquoten und Datenbereinigung](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [React: TypeScript](https://react.dev/learn/typescript)
- [JSON Schema: Spezifikation](https://json-schema.org/specification)
- [FamilySearch GEDCOM Spezifikation](https://gedcom.io/specifications/)
- [Research in Practice: Using genograms in practice](https://www.researchinpractice.org.uk/media/mkydyt3f/cf_pt_using-genograms-in-practice_final.pdf)
- [McGoldrick et al.: Genograms, historische Standardisierung und Weiterentwicklung](https://digital.library.mcgill.ca/downloads/genograms-80019825.pdf)

Details und offene Fragen stehen in [`docs/PROJECT_NOTES.md`](docs/PROJECT_NOTES.md); den zeitlichen Projektverlauf halten wir in [`docs/AI_DEVELOPMENT_LOG.md`](docs/AI_DEVELOPMENT_LOG.md) fest.
