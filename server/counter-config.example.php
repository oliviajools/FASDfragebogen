<?php
// Vorlage für counter-config.php – ausfüllen, in counter-config.php umbenennen
// und NUR auf den Server hochladen. NIEMALS ins Git-Repo committen!

// Zufälliger Salt (beliebige lange Zeichenkette, einmal festlegen)
define('COUNTER_SALT', 'HIER_ZUFAELLIGEN_SALT_EINTRAGEN');

// SHA-256-Hash von (Salt + Passwort).
// Erzeugen z.B. mit: echo -n "SALTpasswort" | shasum -a 256
define('COUNTER_PASSWORD_SHA256', 'HIER_HASH_EINTRAGEN');

// GitHub Fine-grained Token (nur Contents: Read/Write auf das Repo)
define('GITHUB_TOKEN', 'github_pat_...');

define('GITHUB_REPO', 'oliviajools/FASDfragebogen');
define('GITHUB_FILE', 'docs/counter.json');
define('GITHUB_BRANCH', 'main');
