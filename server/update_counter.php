<?php
// FASQ Counter – manuelles Speichern aus admin.html.
// Prüft das Admin-Passwort und schreibt counter.json lokal und via GitHub-API ins Repo.
// Hinweis: Ist der automatische Abgleich (sync_counter.php) aktiv, überschreibt
// der nächste Lauf manuell eingetragene Werte wieder mit den LimeSurvey-Zahlen.

declare(strict_types=1);
require __DIR__ . '/counter-lib.php';

counterCors();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  counterRespond(405, ['success' => false, 'error' => 'Nur POST erlaubt']);
}

try {
  counterLoadConfig();
} catch (RuntimeException $e) {
  counterRespond(500, ['success' => false, 'error' => $e->getMessage()]);
}

$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) {
  counterRespond(400, ['success' => false, 'error' => 'Ungültige Anfrage']);
}

if (!counterCheckPassword((string)($body['password'] ?? ''))) {
  counterRespond(401, ['success' => false, 'error' => 'Falsches Passwort']);
}

// --- Werte validieren ---
$recs = filter_var($body['totalRecommendations'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$total = filter_var($body['totalAssessments'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$since = (string)($body['since'] ?? '');
$updated = (string)($body['lastUpdated'] ?? '');
$dateRe = '/^\d{4}-\d{2}-\d{2}$/';
if ($recs === false || $total === false || !preg_match($dateRe, $since) || !preg_match($dateRe, $updated)) {
  counterRespond(400, ['success' => false, 'error' => 'Ungültige Werte']);
}
if ($recs > $total) {
  counterRespond(400, ['success' => false, 'error' => 'Empfehlungen können nicht größer als Erhebungen sein']);
}

$payload = [
  'totalRecommendations' => $recs,
  'totalAssessments' => $total,
  'since' => $since,
  'lastUpdated' => $updated,
  'source' => 'manual',
  'lastSync' => date('c'),
  'comment' => COUNTER_COMMENT,
];
$content = counterEncode($payload);

try {
  counterWriteGithub($content, 'Counter Update (manuell): ' . $recs . ' Empfehlungen / ' . $total . ' Erhebungen (' . $updated . ')');
} catch (RuntimeException $e) {
  counterRespond(502, ['success' => false, 'error' => $e->getMessage()]);
}
counterWriteLocal($content);

counterRespond(200, ['success' => true]);
