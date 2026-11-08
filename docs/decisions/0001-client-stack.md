# ADR 0001: Browser-Stack und lokaler Datenbank-Prototyp

- Status: angenommen für das Grundgerüst; Persistenzdetails bleiben prototypisch
- Datum: 2026-11-07

## Kontext

Die App soll Familiendaten lokal im Browser bearbeiten. Die UI soll React und TypeScript verwenden. Excel wird zunächst einmalig importiert, anschließend werden Daten in einer sauberen internen Struktur bearbeitet. Echte Daten dürfen das Browsergerät nicht verlassen.

## Entscheidung

- Vite stellt eine statische React-/TypeScript-App bereit.
- SQLite WASM läuft in einem dedizierten Web Worker, damit SQLite-/OPFS-Arbeit den UI-Thread nicht blockiert.
- Der erste Prototyp verwendet SQLite `opfs-sahpool`. Das vermeidet die COOP/COEP-Header-Anforderung des klassischen `opfs` VFS. Für die erwartete lokale Einzelbenutzer-App ist der fehlende automatische Mehrtabzugriff zunächst akzeptabel.
- Die SAH-Pool-Initialisierung setzt `preserveOnInitFailure`, damit ein Startfehler nicht automatisch vorhandenen OPFS-Inhalt löscht.
- Bei nicht verfügbarem persistentem Speicher wird ein sichtbarer Fehler gezeigt; es gibt keinen stillen In-Memory-Fallback für Familiendaten.
- Der UI-Code kommuniziert ausschließlich über ein typisiertes Worker-Protokoll mit der Datenbankschicht.
- SheetJS wird im Import-Worker aus der offiziellen, gepinnten 0.20.3-Distribution verwendet. Der veraltete npm-Registry-Eintrag wird nicht verwendet. Der Browser liest `File.arrayBuffer()` lokal; es gibt keinen Upload-Endpunkt.
- Die erste Importvorschau verarbeitet das erste Tabellenblatt und das bekannte Achtspaltenformat. Datenfelder sind vor dem Commit editierbar; die Quelldatei selbst wird nicht gespeichert.
- Das initiale SQLite-Schema trennt Fälle (`genogram`), Personen, Partnerschaften und Eltern-Kind-Verknüpfungen. Datenmigrationen verwenden `PRAGMA user_version`.

## Konsequenzen

- OPFS ist browser- und originbezogen; das Löschen der Websitedaten entfernt die Daten. Sicherungs-/Wiederherstellungsfunktionen sind vor produktivem Einsatz erforderlich.
- Der SAH-Pool kann nicht mehrere unabhängige Zugriffe auf dieselbe Datenbankdatei zuverlässig parallel bedienen. Eine zweite App-Registerkarte muss erkannt bzw. mit verständlicher Fehlermeldung behandelt werden.
- Der erste Import unterstützt vollständige Tagesdaten im Format `TT.MM.JJJJ` für Geburts-/Todesangaben und Tag bzw. Jahr für Eheschließungen. Unklare Namen oder Datumsangaben werden vor dem Commit manuell geprüft; ein späteres Teil-/Unsicherheitsmodell bleibt offen.
- Browserkompatibilität, Wiederöffnung nach Neuladen, Datenbankschema und Speicherfehler müssen im Zielbrowser validiert werden, bevor die Persistenz als einsatzbereit gilt.
- UI und Worker schreiben keine Zell- oder Personendaten in Logs.

## Quellen

- [SQLite WASM: Persistenz und OPFS-VFS](https://www.sqlite.org/wasm/doc/trunk/persistence.md)
- [SQLite WASM npm-Paket: Worker-Integration](https://www.sqlite.org/wasm/doc/trunk/npm.md)
- [Vite: Getting Started und TypeScript-Templates](https://vite.dev/guide/)
- [SheetJS: Bundler-Installation](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/)
