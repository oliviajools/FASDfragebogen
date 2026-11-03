<?php
// Vorlage für counter-config.php – ausfüllen, in counter-config.php umbenennen
// und NUR auf den Server hochladen. NIEMALS ins Git-Repo committen!

// ---------------------------------------------------------------------------
// Admin-Passwort (admin.html: manuell speichern + „Jetzt abgleichen“)
// ---------------------------------------------------------------------------

// Zufälliger Salt (beliebige lange Zeichenkette, einmal festlegen)
define('COUNTER_SALT', 'HIER_ZUFAELLIGEN_SALT_EINTRAGEN');

// SHA-256-Hash von (Salt + Passwort).
// Erzeugen z.B. mit: echo -n "SALTpasswort" | shasum -a 256
define('COUNTER_PASSWORD_SHA256', 'HIER_HASH_EINTRAGEN');

// ---------------------------------------------------------------------------
// GitHub (Quelle für oliviajools.github.io und Fallback)
// ---------------------------------------------------------------------------

// GitHub Fine-grained Token (nur Contents: Read/Write auf das Repo)
define('GITHUB_TOKEN', 'github_pat_...');

define('GITHUB_REPO', 'oliviajools/FASDfragebogen');
define('GITHUB_FILE', 'docs/counter.json');
define('GITHUB_BRANCH', 'main');

// ---------------------------------------------------------------------------
// LimeSurvey – automatischer Abgleich (sync_counter.php)
// ---------------------------------------------------------------------------

// RemoteControl-Endpunkt. Vorher in LimeSurvey aktivieren:
// Konfiguration → Globale Einstellungen → Schnittstellen → RPC-Schnittstelle = JSON-RPC
define('LIMESURVEY_URL', 'https://fasd-fz-hh.limesurvey.net/index.php/admin/remotecontrol');

// Eigener LimeSurvey-Benutzer nur für den Counter, mit Leserecht auf die Antworten
// der unten genannten Umfragen (Berechtigung „Antworten: Ansehen/Exportieren“).
define('LIMESURVEY_USER', 'counter-bot');
define('LIMESURVEY_PASSWORD', 'HIER_PASSWORT_EINTRAGEN');

// Alle Umfragen, deren NEUE Antworten gezählt werden. Die ID ist die Zahl in der Umfrage-URL:
//   https://fasd-fz-hh.limesurvey.net/299374 → 299374
// Antworten, die beim ersten Lauf schon da sind, werden nie gezählt – auch wenn eine ID
// später ergänzt wird. Eine Umfrage zu viel aufzunehmen schadet also nicht.
define('LIMESURVEY_SURVEY_IDS', [299374, 655176]);

// Startwerte = Stand bei Freischaltung. Gezählt wird ab dann: Startwert + neue Antworten.
define('COUNTER_BASELINE_RECOMMENDATIONS', 380);
define('COUNTER_BASELINE_ASSESSMENTS', 685);

// Anzeige „Seit“ auf der Counter-Seite
define('COUNTER_SINCE', '2025-12-30');

// Geheimer Schlüssel für externe Cron-Dienste (?key=…), mind. 24 Zeichen.
// Erzeugen z.B. mit: openssl rand -hex 24   – leer lassen, wenn ein echter Cronjob läuft.
define('SYNC_KEY', '');

// Feldnamen (nur ändern, wenn die Umfrage umgebaut wird)
// define('COUNTER_ITEM_PATTERN', '/^(G01Q\d+|r\d+q0)$/i'); // FASQ-Items, Antwortcode = Punktwert 0–3
// define('COUNTER_AGE_FIELD', 'G02Q02_SQ001');              // Alter
// define('COUNTER_EQUATION_FIELD', 'G05Q83');               // Gleichung „Empfehlung“/„Keine Empfehlung“
// define('COUNTER_LOCAL_JSON', '/pfad/zu/counter/counter.json');
