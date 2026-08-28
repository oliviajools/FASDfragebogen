<?php
// FASQ Counter Update-Endpunkt
// Prüft ein gemeinsames Admin-Passwort und schreibt counter.json via GitHub-API ins Repo.
// Das GitHub-Token und der Passwort-Hash liegen in counter-config.php (nicht öffentlich!).

declare(strict_types=1);

// --- CORS (Admin-Seite darf von beiden Domains aus posten) ---
$allowedOrigins = [
  'https://fasd-fachzentrum.hamburg',
  'https://www.fasd-fachzentrum.hamburg',
  'https://oliviajools.github.io',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  echo json_encode(['success' => false, 'error' => 'Nur POST erlaubt']);
  exit;
}

// --- Konfiguration laden ---
$configFile = __DIR__ . '/counter-config.php';
if (!file_exists($configFile)) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Server nicht konfiguriert (counter-config.php fehlt)']);
  exit;
}
require $configFile; // definiert COUNTER_SALT, COUNTER_PASSWORD_SHA256, GITHUB_TOKEN, GITHUB_REPO, GITHUB_FILE, GITHUB_BRANCH

function respond(int $code, array $data): void {
  http_response_code($code);
  echo json_encode($data);
  exit;
}

// --- Brute-Force-Schutz: max. 8 Fehlversuche pro IP in 15 Minuten ---
$attemptsFile = __DIR__ . '/.attempts.json';
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$now = time();
$window = 15 * 60;
$maxAttempts = 8;

$attempts = [];
if (is_readable($attemptsFile)) {
  $attempts = json_decode((string)file_get_contents($attemptsFile), true) ?: [];
}
// Alte Einträge aufräumen
foreach ($attempts as $k => $times) {
  $attempts[$k] = array_values(array_filter($times, fn($t) => $now - $t < $window));
  if (!$attempts[$k]) unset($attempts[$k]);
}
if (count($attempts[$ip] ?? []) >= $maxAttempts) {
  respond(429, ['success' => false, 'error' => 'Zu viele Fehlversuche. Bitte 15 Minuten warten.']);
}

function recordFailure(string $attemptsFile, array $attempts, string $ip, int $now): void {
  $attempts[$ip][] = $now;
  file_put_contents($attemptsFile, json_encode($attempts), LOCK_EX);
}

// --- Eingabe lesen (JSON-Body) ---
$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) {
  respond(400, ['success' => false, 'error' => 'Ungültige Anfrage']);
}

// --- Passwort prüfen ---
$password = (string)($body['password'] ?? '');
usleep(300000); // 0,3s Verzögerung gegen Brute-Force
$hash = hash('sha256', COUNTER_SALT . $password);
if ($password === '' || !hash_equals(COUNTER_PASSWORD_SHA256, $hash)) {
  recordFailure($attemptsFile, $attempts, $ip, $now);
  respond(401, ['success' => false, 'error' => 'Falsches Passwort']);
}

// --- Werte validieren ---
$recs = filter_var($body['totalRecommendations'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$total = filter_var($body['totalAssessments'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$since = (string)($body['since'] ?? '');
$updated = (string)($body['lastUpdated'] ?? '');
$dateRe = '/^\d{4}-\d{2}-\d{2}$/';
if ($recs === false || $total === false || !preg_match($dateRe, $since) || !preg_match($dateRe, $updated)) {
  respond(400, ['success' => false, 'error' => 'Ungültige Werte']);
}
if ($recs > $total) {
  respond(400, ['success' => false, 'error' => 'Empfehlungen können nicht größer als Erhebungen sein']);
}

$payload = [
  'totalRecommendations' => $recs,
  'totalAssessments' => $total,
  'since' => $since,
  'lastUpdated' => $updated,
  'comment' => 'totalRecommendations = Fragebögen mit positivem Befund. totalAssessments = Gesamtanzahl Erhebungen. Aktualisierbar über admin.html.',
];
$content = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";

// --- GitHub API ---
function githubRequest(string $method, string $url, ?array $jsonBody = null): array {
  $ch = curl_init($url);
  $headers = [
    'Authorization: token ' . GITHUB_TOKEN,
    'Accept: application/vnd.github+json',
    'User-Agent: fasq-counter-admin',
  ];
  if ($jsonBody !== null) {
    $headers[] = 'Content-Type: application/json';
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($jsonBody));
  }
  curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
  ]);
  $response = curl_exec($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  return [$status, json_decode((string)$response, true) ?: []];
}

$base = 'https://api.github.com/repos/' . GITHUB_REPO . '/contents/' . GITHUB_FILE;

// Aktuelle Datei holen (SHA nötig für Update)
[$status, $file] = githubRequest('GET', $base . '?ref=' . GITHUB_BRANCH);
if ($status !== 200 || empty($file['sha'])) {
  respond(502, ['success' => false, 'error' => 'GitHub-Lesefehler (HTTP ' . $status . ')']);
}

// Datei aktualisieren
$message = 'Counter Update: ' . $recs . ' Empfehlungen / ' . $total . ' Erhebungen (' . $updated . ')';
[$status, $result] = githubRequest('PUT', $base, [
  'message' => $message,
  'content' => base64_encode($content),
  'sha' => $file['sha'],
  'branch' => GITHUB_BRANCH,
]);
if ($status !== 200 && $status !== 201) {
  respond(502, ['success' => false, 'error' => 'GitHub-Schreibfehler (HTTP ' . $status . '): ' . ($result['message'] ?? '')]);
}

// Lokale Fallback-Kopie aktualisieren, falls counter.json daneben liegt (optional)
$localCopy = dirname(__DIR__) . '/counter/counter.json';
if (is_writable($localCopy)) {
  @file_put_contents($localCopy, $content, LOCK_EX);
}

respond(200, ['success' => true]);
