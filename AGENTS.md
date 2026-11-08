# Projektregeln für KI-gestützte Änderungen

- Personenbezogene, familiäre oder gesundheitliche Echtdaten dürfen nie in Repository, Beispieldateien, Screenshots, Konsolenausgaben oder Fehlerberichte aufgenommen werden. Fixtures sind vollständig erfunden.
- Daten bleiben im Browser. Keine API-Aufrufe, Telemetrie oder externen Dienste mit Inhalten des Genogramms ergänzen.
- UI-Code greift nicht direkt auf SQLite zu. Persistenz läuft über ein eng typisiertes Worker-Protokoll.
- Importdaten sind vor Laufzeitvalidierung nicht vertrauenswürdig. Mehrdeutige Werte werden sichtbar zur manuellen Klärung gestellt, nicht geraten.
- Fachliche Daten, Beziehungen, Diagrammlayout und PDF-Ausgabe getrennt halten.
- Neue Abhängigkeiten begründen und möglichst wenige Runtime-Pakete verwenden.
- Datenmigrationen versionieren und bestehende Browserdaten bei Initialisierungsfehlern bewahren.
- Architekturänderungen und relevante KI-Arbeitsschritte in `docs/AI_DEVELOPMENT_LOG.md` und gegebenenfalls `docs/decisions/` dokumentieren.
