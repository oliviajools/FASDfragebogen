<?php
// Gemeinsame Funktionen für update_counter.php (manuell) und sync_counter.php (automatisch).
// Einzige Datenquelle der Counter-Seite ist counter/counter.json auf diesem Server.

declare(strict_types=1);

const COUNTER_COMMENT = 'totalRecommendations = Fragebögen mit Empfehlung zur FASD-Diagnostik. totalAssessments = abgeschlossene Erhebungen. Wird automatisch aus LimeSurvey abgeglichen (sync_counter.php).';

function counterLoadConfig(): void {
  $configFile = __DIR__ . '/counter-config.php';
  if (!file_exists($configFile)) {
    throw new RuntimeException('Server nicht konfiguriert (counter-config.php fehlt)');
  }
  require_once $configFile;
}

/** Pfad der counter.json neben der Counter-Seite. */
function counterLocalPath(): string {
  return defined('COUNTER_LOCAL_JSON') ? COUNTER_LOCAL_JSON : dirname(__DIR__) . '/counter/counter.json';
}

function counterReadLocal(): ?array {
  $path = counterLocalPath();
  if (!is_readable($path)) return null;
  $data = json_decode((string)file_get_contents($path), true);
  return is_array($data) ? $data : null;
}

// --- Zustand des automatischen Abgleichs (Startwerte + IDs der Antworten vor Freischaltung) ---
function counterStatePath(): string {
  return __DIR__ . '/.sync-state.json';
}

function counterReadState(): ?array {
  $path = counterStatePath();
  if (!is_readable($path)) return null;
  $data = json_decode((string)file_get_contents($path), true);
  return is_array($data) && isset($data['baseline'], $data['surveys']) ? $data : null;
}

function counterWriteState(array $state): bool {
  $path = counterStatePath();
  $tmp = $path . '.tmp';
  if (@file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE), LOCK_EX) === false) return false;
  return @rename($tmp, $path);
}

function counterEncode(array $payload): string {
  return json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
}

function counterWriteLocal(string $content): bool {
  $path = counterLocalPath();
  if (!file_exists($path) && !is_writable(dirname($path))) return false;
  if (file_exists($path) && !is_writable($path)) return false;
  $tmp = $path . '.tmp';
  if (@file_put_contents($tmp, $content, LOCK_EX) === false) return false;
  return @rename($tmp, $path);
}

/** Passwortprüfung mit Brute-Force-Schutz (max. 8 Fehlversuche pro IP in 15 Minuten). */
function counterCheckPassword(string $password): bool {
  $attemptsFile = __DIR__ . '/.attempts.json';
  $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
  $now = time();
  $window = 15 * 60;

  $attempts = [];
  if (is_readable($attemptsFile)) {
    $attempts = json_decode((string)file_get_contents($attemptsFile), true) ?: [];
  }
  foreach ($attempts as $k => $times) {
    $attempts[$k] = array_values(array_filter($times, fn($t) => $now - $t < $window));
    if (!$attempts[$k]) unset($attempts[$k]);
  }
  if (count($attempts[$ip] ?? []) >= 8) {
    counterRespond(429, ['success' => false, 'error' => 'Zu viele Fehlversuche. Bitte 15 Minuten warten.']);
  }

  usleep(300000); // 0,3 s Verzögerung gegen Brute-Force
  $hash = hash('sha256', COUNTER_SALT . $password);
  if ($password === '' || !hash_equals(COUNTER_PASSWORD_SHA256, $hash)) {
    $attempts[$ip][] = $now;
    file_put_contents($attemptsFile, json_encode($attempts), LOCK_EX);
    return false;
  }
  return true;
}

function counterCors(): void {
  $allowedOrigins = [
    'https://fasd-fachzentrum.hamburg',
    'https://www.fasd-fachzentrum.hamburg',
  ];
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
  }
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
}

function counterRespond(int $code, array $data): void {
  if (PHP_SAPI === 'cli') {
    fwrite($code >= 400 ? STDERR : STDOUT, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n");
    exit($code >= 400 ? 1 : 0);
  }
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}
