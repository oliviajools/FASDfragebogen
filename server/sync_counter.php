<?php
// FASQ Counter – automatischer Abgleich mit LimeSurvey.
//
// Holt alle abgeschlossenen Antworten über die LimeSurvey RemoteControl-API (JSON-RPC),
// zählt Erhebungen und Empfehlungen und schreibt counter.json lokal (sofort sichtbar)
// sowie ins GitHub-Repo (nur wenn sich die Zahlen geändert haben).
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
    'submitdate' => (string)($row['submitdate'] ?? ''),
  ];
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------
$itemPattern = defined('COUNTER_ITEM_PATTERN') ? COUNTER_ITEM_PATTERN : '/^(G01Q\d+|r\d+q0)$/i';
$ageKey = normKey(defined('COUNTER_AGE_FIELD') ? COUNTER_AGE_FIELD : 'G02Q02_SQ001');
$equationKey = normKey(defined('COUNTER_EQUATION_FIELD') ? COUNTER_EQUATION_FIELD : 'G05Q83');
$countFrom = defined('COUNTER_COUNT_FROM') ? (string)COUNTER_COUNT_FROM : '';
$previous = counterReadLocal() ?? [];
$since = defined('COUNTER_SINCE') ? (string)COUNTER_SINCE : (string)($previous['since'] ?? '2025-12-30');

$totals = ['assessments' => 0, 'recommendations' => 0];
$perSurvey = [];
$warnings = [];
$session = null;

try {
  $session = lsCall('get_session_key', [LIMESURVEY_USER, LIMESURVEY_PASSWORD]);
  if (!is_string($session)) {
    throw new RuntimeException('Login bei LimeSurvey fehlgeschlagen: ' . (is_array($session) ? ($session['status'] ?? json_encode($session)) : 'unbekannt'));
  }

  foreach ((array)LIMESURVEY_SURVEY_IDS as $sid) {
    $sid = (int)$sid;
    $rows = lsExportComplete($session, $sid);
    $s = ['assessments' => 0, 'recommendations' => 0, 'equationMismatch' => 0, 'unscorable' => 0];
    foreach ($rows as $row) {
      $r = evaluateResponse($row, $itemPattern, $ageKey, $equationKey);
      if ($countFrom !== '' && $r['submitdate'] !== '' && substr($r['submitdate'], 0, 10) < $countFrom) continue;
      $s['assessments']++;
      if ($r['recommended']) $s['recommendations']++;
      if ($r['equationMismatch']) $s['equationMismatch']++;
      if ($r['unscorable']) $s['unscorable']++;
    }
    if ($s['assessments'] > 0 && $s['unscorable'] === $s['assessments']) {
      $warnings[] = "Umfrage $sid: keine FASQ-Items und keine Gleichungsfrage gefunden – Feldnamen prüfen.";
    } elseif ($s['unscorable'] > 0) {
      $warnings[] = "Umfrage $sid: {$s['unscorable']} Antworten ohne auswertbare Items.";
    }
    if ($s['equationMismatch'] > 0) {
      $warnings[] = "Umfrage $sid: bei {$s['equationMismatch']} Antworten weicht G05Q83 vom berechneten Score ab (Score wurde verwendet).";
    }
    $perSurvey[$sid] = $s;
    $totals['assessments'] += $s['assessments'];
    $totals['recommendations'] += $s['recommendations'];
  }
} catch (RuntimeException $e) {
  syncLog('FEHLER ' . $e->getMessage());
  counterRespond(502, ['success' => false, 'error' => $e->getMessage()]);
} finally {
  if (is_string($session)) {
    try { lsCall('release_session_key', [$session]); } catch (RuntimeException $e) { /* egal */ }
  }
}

// Plausibilität: Ein Absturz auf 0 deutet auf falsche Umfrage-ID oder Rechte hin.
$prevTotal = (int)($previous['totalAssessments'] ?? 0);
if (!$force && $totals['assessments'] === 0 && $prevTotal > 0) {
  $msg = 'LimeSurvey liefert 0 Erhebungen (bisher ' . $prevTotal . '). Nichts geschrieben – Umfrage-IDs und Rechte des API-Benutzers prüfen, oder mit --force erzwingen.';
  syncLog('ABBRUCH ' . $msg);
  counterRespond(422, ['success' => false, 'error' => $msg, 'surveys' => $perSurvey]);
}

$payload = [
  'totalRecommendations' => $totals['recommendations'],
  'totalAssessments' => $totals['assessments'],
  'since' => $since,
  'lastUpdated' => date('Y-m-d'),
  'source' => 'limesurvey',
  'lastSync' => date('c'),
  'comment' => COUNTER_COMMENT,
];

if ($dryRun) {
  counterRespond(200, ['success' => true, 'dryRun' => true, 'counter' => $payload, 'surveys' => $perSurvey, 'warnings' => $warnings]);
}

$content = counterEncode($payload);
$localOk = counterWriteLocal($content);
if (!$localOk) $warnings[] = 'Lokale counter.json nicht beschreibbar: ' . counterLocalPath();

$committed = false;
try {
  $committed = counterWriteGithub(
    $content,
    'Counter Sync: ' . $payload['totalRecommendations'] . ' Empfehlungen / ' . $payload['totalAssessments'] . ' Erhebungen (' . $payload['lastUpdated'] . ')',
    true
  );
} catch (RuntimeException $e) {
  $warnings[] = 'GitHub: ' . $e->getMessage();
  if (!$localOk) {
    syncLog('FEHLER weder lokal noch GitHub geschrieben: ' . $e->getMessage());
    counterRespond(502, ['success' => false, 'error' => 'Weder lokal noch auf GitHub gespeichert', 'warnings' => $warnings]);
  }
}

syncLog(sprintf('OK %d/%d%s%s', $payload['totalRecommendations'], $payload['totalAssessments'],
  $committed ? ' (GitHub aktualisiert)' : '', $warnings ? ' | ' . implode(' | ', $warnings) : ''));

counterRespond(200, [
  'success' => true,
  'counter' => $payload,
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
