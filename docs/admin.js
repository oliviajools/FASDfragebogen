(function () {
  'use strict';

  const REPO_OWNER = 'oliviajools';
  const REPO_NAME = 'FASDfragebogen';
  const FILE_PATH = 'docs/counter.json';
  const BRANCH = 'main';
  const TOKEN_KEY = 'fasq_admin_token';

  // --- Token-Verwaltung ---
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    updateTokenSection();
  }

  function updateTokenSection() {
    const token = getToken();
    const section = document.getElementById('token-section');
    const status = document.getElementById('token-status');
    const helpText = document.getElementById('token-help-text');
    const inputRow = document.getElementById('token-input-row');
    const input = document.getElementById('token-input');
    const clearBtn = document.getElementById('btn-clear-token');

    if (token) {
      section.classList.add('ok');
      status.textContent = '✓ GitHub-Verbindung aktiv';
      helpText.textContent = 'Token ist gespeichert. Sie können nun direkt nach GitHub speichern.';
      input.value = '';
      input.placeholder = 'Neues Token einfügen, um zu ersetzen';
      clearBtn.style.display = '';
    } else {
      section.classList.remove('ok');
      status.textContent = 'GitHub-Verbindung einrichten';
      helpText.innerHTML = 'Damit Sie mit einem Klick speichern können, brauchen Sie einmalig ein GitHub Personal Access Token. <button type="button" class="help-toggle" id="btn-show-help">Anleitung anzeigen</button>';
      bindHelpToggle();
      clearBtn.style.display = 'none';
    }
  }

  function bindHelpToggle() {
    const btn = document.getElementById('btn-show-help');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const help = document.getElementById('help-content');
      help.hidden = !help.hidden;
      btn.textContent = help.hidden ? 'Anleitung anzeigen' : 'Anleitung ausblenden';
    });
  }

  // --- Status-Meldungen ---
  function showStatus(message, type) {
    const el = document.getElementById('status');
    el.className = 'status ' + (type || 'info');
    el.textContent = message;
  }
  function clearStatus() {
    const el = document.getElementById('status');
    el.className = 'status';
    el.textContent = '';
  }

  // --- Helpers ---
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function buildJsonPayload() {
    const recs = parseInt(document.getElementById('input-recommendations').value, 10) || 0;
    const total = parseInt(document.getElementById('input-assessments').value, 10) || 0;
    const since = document.getElementById('input-since').value || '2026-06-01';
    const updated = document.getElementById('input-updated').value || todayISO();
    return {
      totalRecommendations: recs,
      totalAssessments: total,
      since: since,
      lastUpdated: updated,
      comment: 'totalRecommendations = Fragebögen mit positivem Befund. totalAssessments = Gesamtanzahl Erhebungen. Aktualisierbar über admin.html.'
    };
  }

  function updatePreview() {
    const payload = buildJsonPayload();
    document.getElementById('json-preview').textContent = JSON.stringify(payload, null, 2);
    const recs = payload.totalRecommendations;
    const total = payload.totalAssessments;
    const display = document.getElementById('quote-display');
    if (total > 0) {
      const pct = Math.round((recs / total) * 100);
      display.textContent = pct + ' % (' + recs + ' von ' + total + ')';
    } else {
      display.textContent = '—';
    }
  }

  // --- counter.json laden (immer aktueller Stand aus GitHub, Fallback lokal) ---
  function loadCurrentValues() {
    showStatus('Aktuelle Werte werden geladen…', 'info');
    const remoteUrl = 'https://raw.githubusercontent.com/' + REPO_OWNER + '/' + REPO_NAME +
      '/' + BRANCH + '/' + FILE_PATH + '?v=' + Date.now();
    fetch(remoteUrl, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r;
      })
      .catch(function () {
        return fetch('counter.json?v=' + Date.now(), { cache: 'no-store' });
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        document.getElementById('input-recommendations').value = data.totalRecommendations || 0;
        document.getElementById('input-assessments').value = data.totalAssessments || 0;
        document.getElementById('input-since').value = data.since || '2026-06-01';
        document.getElementById('input-updated').value = todayISO();
        updatePreview();
        clearStatus();
      })
      .catch(function (err) {
        showStatus('Konnte Werte nicht laden: ' + err.message, 'error');
      });
  }

  // --- GitHub API: aktuelle Datei holen (für SHA) ---
  function githubGetFile(token) {
    const url = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME +
      '/contents/' + FILE_PATH + '?ref=' + BRANCH;
    return fetch(url, {
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github+json'
      }
    }).then(function (r) {
      if (!r.ok) throw new Error('GitHub: ' + r.status + ' ' + r.statusText);
      return r.json();
    });
  }

  // --- GitHub API: Datei aktualisieren ---
  function githubUpdateFile(token, sha, content, message) {
    const url = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME +
      '/contents/' + FILE_PATH;
    // Base64 mit korrekter UTF-8-Kodierung
    const utf8Bytes = new TextEncoder().encode(content);
    let binary = '';
    utf8Bytes.forEach(function (b) { binary += String.fromCharCode(b); });
    const base64 = btoa(binary);

    return fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        content: base64,
        sha: sha,
        branch: BRANCH
      })
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (e) {
          throw new Error('GitHub: ' + (e.message || r.statusText));
        });
      }
      return r.json();
    });
  }

  // --- Speichern in GitHub ---
  function saveToGitHub() {
    const token = getToken();
    if (!token) {
      showStatus('Bitte zuerst GitHub-Token einrichten.', 'error');
      return;
    }
    const payload = buildJsonPayload();
    const content = JSON.stringify(payload, null, 2) + '\n';
    const message = 'Counter Update: ' + payload.totalRecommendations +
      ' Empfehlungen / ' + payload.totalAssessments + ' Erhebungen (' + payload.lastUpdated + ')';

    showStatus('Speichere in GitHub…', 'info');
    document.getElementById('btn-save').disabled = true;

    githubGetFile(token)
      .then(function (file) {
        return githubUpdateFile(token, file.sha, content, message);
      })
      .then(function () {
        showStatus('✓ Erfolgreich gespeichert. Die Counter-Seite ist in 1-2 Minuten aktualisiert.', 'success');
      })
      .catch(function (err) {
        showStatus('Fehler beim Speichern: ' + err.message, 'error');
      })
      .finally(function () {
        document.getElementById('btn-save').disabled = false;
      });
  }

  // --- JSON als Datei herunterladen ---
  function downloadJson() {
    const payload = buildJsonPayload();
    const content = JSON.stringify(payload, null, 2) + '\n';
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'counter.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('Datei heruntergeladen. Bitte in GitHub als docs/counter.json hochladen.', 'info');
  }

  // --- Bootstrap ---
  function init() {
    document.getElementById('current-year').textContent = String(new Date().getFullYear());

    updateTokenSection();
    bindHelpToggle();
    loadCurrentValues();

    document.getElementById('btn-save-token').addEventListener('click', function () {
      const val = document.getElementById('token-input').value.trim();
      if (!val) {
        showStatus('Bitte ein Token einfügen.', 'error');
        return;
      }
      setToken(val);
      showStatus('Token gespeichert.', 'success');
    });

    document.getElementById('btn-clear-token').addEventListener('click', function () {
      if (confirm('Token wirklich löschen?')) {
        setToken('');
        showStatus('Token entfernt.', 'info');
      }
    });

    ['input-recommendations', 'input-assessments', 'input-since', 'input-updated'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    document.getElementById('btn-save').addEventListener('click', saveToGitHub);
    document.getElementById('btn-download').addEventListener('click', downloadJson);
    document.getElementById('btn-reload').addEventListener('click', loadCurrentValues);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
