<?php
// FASQ Counter – automatischer Abgleich mit LimeSurvey.
//
// Holt alle abgeschlossenen Antworten über die LimeSurvey RemoteControl-API (JSON-RPC)
// und zählt NUR Antworten, die nach der Freischaltung abgeschlossen wurden:
//   Anzeige = Startwerte (bisheriger Stand, z. B. 380 / 685) + neue Antworten.
// Beim allerersten Lauf merkt sich das Skript die IDs aller bereits abgeschlossenen
// Antworten (.sync-state.json) – diese werden nie gezählt. Der erste Lauf ändert die
// Zahlen also nicht. Dasselbe gilt für eine später hinzugefügte Umfrage-ID.
// Schreibt counter.json lokal (sofort sichtbar) und ins GitHub-Repo (nur bei Änderung).
//
// Aufrufwege:
//   1. Cronjob auf dem Server (empfohlen):   php /pfad/zu/counter-api/sync_counter.php
//   2. Externer Cron-Dienst (falls kein Cron): GET  https://…/counter-api/sync_counter.php?key=SYNC_KEY
//   3. Button „Jetzt abgleichen“ in admin.html: POST {password} an diese Datei
// Optionen: --dry-run / ?dry=1 (nur rechnen, nichts schreiben), --force / force=1 (Plausibilitätsprüfung überspringen)
//
// Empfehlungsregel (identisch mit LimeSurvey-Gleichung G05Q83 und docs/app.js):
//   Score >= 55  ODER  (Alter 2–5 Jahre UND Score >= 45)
//   Score = Summe der Antwortcodes (0–3) aller FASQ-Items (KIDS-I: G01Q…, ERW-I: r…q0)

declare(strict_types=1);
require __DIR__ . '/counter-lib.php';

date_default_timezone_set('Europe/Berlin');
$isCli = PHP_SAPI === 'cli';

// ---------------------------------------------------------------------------
// Zugriff prüfen
// ---------------------------------------------------------------------------
if (!$isCli) {
  counterCors();
  $method = $_SERVER['REQUEST_METHOD'] ?? '';
  if ($method === 'OPTIONS') { http_response_code(204); exit; }
}

try {
  counterLoadConfig();
} catch (RuntimeException $e) {
  counterRespond(500, ['success' => false, 'error' => $e->getMessage()]);
}
foreach (['LIMESURVEY_URL', 'LIMESURVEY_USER', 'LIMESURVEY_PASSWORD', 'LIMESURVEY_SURVEY_IDS'] as $const) {
  if (!defined($const)) {
    counterRespond(500, ['success' => false, 'error' => $const . ' fehlt in counter-config.php']);
  }
}

$dryRun = false;
$force = false;
if ($isCli) {
  $args = array_slice($argv ?? [], 1);
  $dryRun = in_array('--dry-run', $args, true);
  $force = in_array('--force', $args, true);
} else {
  $method = $_SERVER['REQUEST_METHOD'] ?? '';
  if ($method === 'POST') {
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body) || !counterCheckPassword((string)($body['password'] ?? ''))) {
      counterRespond(401, ['success' => false, 'error' => 'Falsches Passwort']);
    }
    $dryRun = !empty($body['dryRun']);
    $force = !empty($body['force']);
  } elseif ($method === 'GET') {
    $key = (string)($_GET['key'] ?? '');
    if (!defined('SYNC_KEY') || strlen(SYNC_KEY) < 24 || $key === '' || !hash_equals(SYNC_KEY, $key)) {
      usleep(300000);
      counterRespond(403, ['success' => false, 'error' => 'Kein Zugriff']);
    }
    $dryRun = !empty($_GET['dry']);
  } else {
    counterRespond(405, ['success' => false, 'error' => 'Methode nicht erlaubt']);
  }
}

// ---------------------------------------------------------------------------
// Nur ein Lauf gleichzeitig, und über HTTP höchstens einmal pro Minute
// ---------------------------------------------------------------------------
$lock = fopen(__DIR__ . '/.sync.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
  counterRespond(409, ['success' => false, 'error' => 'Abgleich läuft bereits']);
}
if (!$isCli && !$dryRun) {
  $prev = counterReadLocal();
  $last = isset($prev['lastSync']) ? strtotime((string)$prev['lastSync']) : false;
  if ($last && ($prev['source'] ?? '') === 'limesurvey' && time() - $last < 60) {
    counterRespond(200, ['success' => true, 'skipped' => 'Letzter Abgleich vor weniger als 1 Minute', 'counter' => $prev]);
  }
}

// ---------------------------------------------------------------------------
// LimeSurvey RemoteControl
// ---------------------------------------------------------------------------
function lsCall(string $method, array $params) {
  static $id = 0;
  $ch = curl_init(LIMESURVEY_URL);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['method' => $method, 'params' => $params, 'id' => ++$id]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'User-Agent: fasq-counter-sync'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60,
  ]);
  $raw = curl_exec($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  if ($raw === false) throw new RuntimeException('LimeSurvey nicht erreichbar: ' . $err);
  $data = json_decode((string)$raw, true);
  if (!is_array($data) || !array_key_exists('result', $data)) {
    throw new RuntimeException('Unerwartete Antwort von LimeSurvey (HTTP ' . $status . '). Ist die JSON-RPC-Schnittstelle aktiviert?');
  }
  if (!empty($data['error'])) {
    throw new RuntimeException('LimeSurvey-Fehler: ' . (is_string($data['error']) ? $data['error'] : json_encode($data['error'])));
  }
  return $data['result'];
}

/** Liefert alle abgeschlossenen Antworten einer Umfrage als Liste assoziativer Arrays. */
function lsExportComplete(string $session, int $surveyId): array {
  $result = lsCall('export_responses', [$session, $surveyId, 'json', null, 'complete', 'code', 'short']);
  if (is_array($result)) {
    $status = (string)($result['status'] ?? '');
    if (stripos($status, 'No Response') !== false || stripos($status, 'No Data') !== false) return [];
    throw new RuntimeException('Export Umfrage ' . $surveyId . ': ' . ($status ?: json_encode($result)));
  }
  $json = json_decode((string)base64_decode((string)$result), true);
  if (!is_array($json) || !isset($json['responses']) || !is_array($json['responses'])) {
    throw new RuntimeException('Export Umfrage ' . $surveyId . ' nicht lesbar');
  }
  $rows = [];
  foreach ($json['responses'] as $item) {
    // LimeSurvey < 6: [{"<id>": {...}}], LimeSurvey 6: [{...}]
    if (is_array($item) && count($item) === 1) {
      $inner = reset($item);
      if (is_array($inner)) { $rows[] = $inner; continue; }
    }
    if (is_array($item)) $rows[] = $item;
  }
  return $rows;
}

// ---------------------------------------------------------------------------
// Auswertung einer Antwort
// ---------------------------------------------------------------------------
function normKey(string $k): string {
  return strtolower(str_replace(['[', ']', '_'], '', $k));
}

function evaluateResponse(array $row, string $itemPattern, string $ageKey, string $equationKey): array {
  $score = 0;
  $items = 0;
  $age = null;
  $equation = null;
  foreach ($row as $key => $value) {
    $key = (string)$key;
    if (preg_match($itemPattern, $key)) {
      if ($value !== null && $value !== '' && is_numeric($value)) {
        $score += (int)$value;
        $items++;
      }
    } elseif (normKey($key) === $ageKey) {
      if ($value !== null && $value !== '' && is_numeric($value)) $age = (float)$value;
    } elseif (normKey($key) === $equationKey) {
      $equation = is_string($value) ? trim($value) : null;
    }
  }
  $byScore = $score >= 55 || ($age !== null && $age >= 2 && $age <= 5 && $score >= 45);
  $byEquation = null;
  if ($equation === 'Empfehlung') $byEquation = true;
  elseif ($equation === 'Keine Empfehlung') $byEquation = false;

  // Items vorhanden → selbst gerechneter Score ist maßgeblich. Sonst Gleichungsfrage.
  $recommended = $items > 0 ? $byScore : ($byEquation ?? false);
  return [
    'recommended' => $recommended,
    'items' => $items,
    'equationMismatch' => $items > 0 && $byEquation !== null && $byEquation !== $byScore,
    'unscorable' => $items === 0 && $byEquation === null,
  ];
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------
$itemPattern = defined('COUNTER_ITEM_PATTERN') ? COUNTER_ITEM_PATTERN : '/^(G01Q\d+|r\d+q0)$/i';
$ageKey = normKey(defined('COUNTER_AGE_FIELD') ? COUNTER_AGE_FIELD : 'G02Q02_SQ001');
$equationKey = normKey(defined('COUNTER_EQUATION_FIELD') ? COUNTER_EQUATION_FIELD : 'G05Q83');
$previous = counterReadLocal() ?? [];
$since = defined('COUNTER_SINCE') ? (string)COUNTER_SINCE : (string)($previous['since'] ?? '2025-12-30');

// Zustand laden bzw. beim ersten Lauf anlegen
$state = counterReadState();
$firstRun = $state === null;
if ($firstRun) {
  $baseRecs = defined('COUNTER_BASELINE_RECOMMENDATIONS') ? COUNTER_BASELINE_RECOMMENDATIONS : ($previous['totalRecommendations'] ?? null);
  $baseTotal = defined('COUNTER_BASELINE_ASSESSMENTS') ? COUNTER_BASELINE_ASSESSMENTS : ($previous['totalAssessments'] ?? null);
  if (!is_int($baseRecs) || !is_int($baseTotal)) {
    counterRespond(500, ['success' => false, 'error' => 'Startwerte fehlen: COUNTER_BASELINE_RECOMMENDATIONS und COUNTER_BASELINE_ASSESSMENTS in counter-config.php eintragen.']);
  }
  $state = [
    'startedAt' => date('c'),
    'baseline' => ['recommendations' => $baseRecs, 'assessments' => $baseTotal],
    'surveys' => [],
    'lastNew' => ['recommendations' => 0, 'assessments' => 0],
  ];
}

$newCounts = ['assessments' => 0, 'recommendations' => 0];
$perSurvey = [];
$warnings = [];
$session = null;

try {
  $session = lsCall('get_session_key', [LIMESURVEY_USER, LIMESURVEY_PASSWORD]);
  if (!is_string($session)) {
    throw new RuntimeException('Login bei LimeSurvey fehlgeschlagen: ' . (is_array($session) ? ($session['status'] ?? json_encode($session)) : 'unbekannt'));
  }

  foreach ((array)LIMESURVEY_SURVEY_IDS as $sid) {
    $sid = (string)(int)$sid;
    $rows = lsExportComplete($session, (int)$sid);
    $ids = [];
    foreach ($rows as $row) {
      if (!isset($row['id']) || !is_numeric($row['id'])) {
        throw new RuntimeException('Umfrage ' . $sid . ': Antwort ohne ID im Export');
      }
      $ids[] = (int)$row['id'];
    }

    // Neue Umfrage (oder erster Lauf): alle bisherigen Antworten als „schon gezählt“ merken
    $isNewSurvey = !isset($state['surveys'][$sid]);
    if ($isNewSurvey) {
      $state['surveys'][$sid] = ['addedAt' => date('c'), 'knownBefore' => count($ids), 'excluded' => $ids];
    }
    $excluded = array_flip($state['surveys'][$sid]['excluded']);

    // Plausibilität: bekannte Umfrage liefert weniger Antworten als beim Start → Rechte/ID prüfen
    if (!$isNewSurvey && !$force && count($ids) < (int)$state['surveys'][$sid]['knownBefore']) {
      throw new RuntimeException('Umfrage ' . $sid . ' liefert nur ' . count($ids) . ' Antworten, beim Start waren es ' .
        $state['surveys'][$sid]['knownBefore'] . '. Nichts geschrieben – Rechte des API-Benutzers prüfen (oder --force).');
    }

    $s = ['newAssessments' => 0, 'newRecommendations' => 0, 'ignoredFromBefore' => count($state['surveys'][$sid]['excluded']),
          'equationMismatch' => 0, 'unscorable' => 0];
    foreach ($rows as $row) {
      if (isset($excluded[(int)$row['id']])) continue;
      $r = evaluateResponse($row, $itemPattern, $ageKey, $equationKey);
      $s['newAssessments']++;
      if ($r['recommended']) $s['newRecommendations']++;
      if ($r['equationMismatch']) $s['equationMismatch']++;
      if ($r['unscorable']) $s['unscorable']++;
    }
    if ($s['unscorable'] > 0) {
      $warnings[] = "Umfrage $sid: {$s['unscorable']} neue Antworten ohne auswertbare FASQ-Items – Feldnamen prüfen.";
    }
    if ($s['equationMismatch'] > 0) {
      $warnings[] = "Umfrage $sid: bei {$s['equationMismatch']} Antworten weicht G05Q83 vom berechneten Score ab (Score wurde verwendet).";
    }
    if ($isNewSurvey && !$firstRun) {
      $warnings[] = "Umfrage $sid neu aufgenommen: " . count($ids) . ' bestehende Antworten werden nicht gezählt, nur künftige.';
    }
    $perSurvey[$sid] = $s;
    $newCounts['assessments'] += $s['newAssessments'];
    $newCounts['recommendations'] += $s['newRecommendations'];
  }
} catch (RuntimeException $e) {
  syncLog('FEHLER ' . $e->getMessage());
  if (is_string($session)) { try { lsCall('release_session_key', [$session]); } catch (RuntimeException $e2) {} }
  counterRespond(502, ['success' => false, 'error' => $e->getMessage()]);
}
try { lsCall('release_session_key', [$session]); } catch (RuntimeException $e) { /* egal */ }

$totalRecs = $state['baseline']['recommendations'] + $newCounts['recommendations'];
$totalAssess = $state['baseline']['assessments'] + $newCounts['assessments'];
$changed = $totalRecs !== ($previous['totalRecommendations'] ?? null) || $totalAssess !== ($previous['totalAssessments'] ?? null);

$payload = [
  'totalRecommendations' => $totalRecs,
  'totalAssessments' => $totalAssess,
  'since' => $since,
  // „Letzte Aktualisierung“ = Tag, an dem sich die Zahlen zuletzt geändert haben
  'lastUpdated' => $changed ? date('Y-m-d') : (string)($previous['lastUpdated'] ?? date('Y-m-d')),
  'source' => 'limesurvey',
  'lastSync' => date('c'),
  'comment' => COUNTER_COMMENT,
];
$info = [
  'baseline' => $state['baseline'],
  'newSinceStart' => $newCounts,
  'startedAt' => $state['startedAt'],
  'firstRun' => $firstRun,
];

if ($dryRun) {
  counterRespond(200, ['success' => true, 'dryRun' => true, 'counter' => $payload] + $info + ['surveys' => $perSurvey, 'warnings' => $warnings]);
}

$content = counterEncode($payload);
$localOk = counterWriteLocal($content);
if (!$localOk) $warnings[] = 'Lokale counter.json nicht beschreibbar: ' . counterLocalPath();

$committed = false;
$githubOk = true;
try {
  $committed = counterWriteGithub(
    $content,
    'Counter Sync: ' . $totalRecs . ' Empfehlungen / ' . $totalAssess . ' Erhebungen (' . $payload['lastUpdated'] . ')',
    true
  );
} catch (RuntimeException $e) {
  $githubOk = false;
  $warnings[] = 'GitHub: ' . $e->getMessage();
}
if (!$localOk && !$githubOk) {
  syncLog('FEHLER weder lokal noch GitHub geschrieben');
  counterRespond(502, ['success' => false, 'error' => 'Weder lokal noch auf GitHub gespeichert', 'warnings' => $warnings]);
}

$state['lastNew'] = $newCounts;
$state['lastSync'] = date('c');
if (!counterWriteState($state)) {
  syncLog('FEHLER Zustandsdatei nicht beschreibbar');
  counterRespond(500, ['success' => false, 'error' => 'Zustandsdatei .sync-state.json nicht beschreibbar (Schreibrechte im Ordner counter-api prüfen)']);
}

syncLog(sprintf('%s %d/%d (Start %d/%d + neu %d/%d)%s%s', $firstRun ? 'START' : 'OK',
  $totalRecs, $totalAssess, $state['baseline']['recommendations'], $state['baseline']['assessments'],
  $newCounts['recommendations'], $newCounts['assessments'],
  $committed ? ' (GitHub aktualisiert)' : '', $warnings ? ' | ' . implode(' | ', $warnings) : ''));

counterRespond(200, ['success' => true, 'counter' => $payload] + $info + [
  'surveys' => $perSurvey,
  'githubCommitted' => $committed,
  'warnings' => $warnings,
]);

// ---------------------------------------------------------------------------
function syncLog(string $line): void {
  $file = __DIR__ . '/.sync.log';
  $lines = is_readable($file) ? file($file, FILE_IGNORE_NEW_LINES) : [];
  $lines[] = date('Y-m-d H:i:s') . ' ' . $line;
  @file_put_contents($file, implode("\n", array_slice($lines, -300)) . "\n", LOCK_EX);
}
