(function () {
  'use strict';

  const REPO_OWNER = 'oliviajools';
  const REPO_NAME = 'FASDfragebogen';
  const FILE_PATH = 'docs/counter.json';
  const BRANCH = 'main';
  const PASSWORD_KEY = 'fasq_admin_password';
  const API_URL = 'https://fasd-fachzentrum.hamburg/counter-api/update_counter.php';
  const SYNC_URL = 'https://fasd-fachzentrum.hamburg/counter-api/sync_counter.php';

  // --- Passwort-Verwaltung ---
  function getPassword() {
    return localStorage.getItem(PASSWORD_KEY) || '';
  }
  function setPassword(password) {
    if (password) localStorage.setItem(PASSWORD_KEY, password);
    else localStorage.removeItem(PASSWORD_KEY);
    updateTokenSection();
  }

  function updateTokenSection() {
    const password = getPassword();
    const section = document.getElementById('token-section');
    const status = document.getElementById('token-status');
    const helpText = document.getElementById('token-help-text');
    const input = document.getElementById('token-input');
    const clearBtn = document.getElementById('btn-clear-token');

    if (password) {
      section.classList.add('ok');
      status.textContent = '✓ Passwort gespeichert';
      helpText.textContent = 'Sie können die Werte jetzt direkt speichern.';
      input.value = '';
      input.placeholder = 'Neues Passwort eingeben, um zu ersetzen';
      clearBtn.style.display = '';
    } else {
      section.classList.remove('ok');
      status.textContent = 'Passwort eingeben';
      helpText.textContent = 'Geben Sie das Admin-Passwort ein, um die Counter-Werte zu aktualisieren.';
      clearBtn.style.display = 'none';
    }
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

  // --- counter.json laden (lokale Datei zuerst, Fallback GitHub) ---
  function fetchJson(url) {
    return fetch(url + '?v=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '—';
    return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function showSyncInfo(data) {
    const el = document.getElementById('sync-info');
    if (!el) return;
    if (data.source === 'limesurvey') {
      el.textContent = 'Letzter Abgleich mit LimeSurvey: ' + formatDateTime(data.lastSync) +
        ' · ' + data.totalRecommendations + ' Empfehlungen / ' + data.totalAssessments + ' Erhebungen';
    } else if (data.source === 'manual') {
      el.textContent = 'Manuell gepflegte Werte (' + formatDateTime(data.lastSync) + '). Automatischer Abgleich noch nicht gestartet.';
    } else {
      el.textContent = 'Noch kein automatischer Abgleich gelaufen (letzte manuelle Pflege: ' + (data.lastUpdated || '—') + ').';
    }
  }

  function applyValues(data) {
    document.getElementById('input-recommendations').value = data.totalRecommendations || 0;
    document.getElementById('input-assessments').value = data.totalAssessments || 0;
    document.getElementById('input-since').value = data.since || '2026-06-01';
    document.getElementById('input-updated').value = todayISO();
    showSyncInfo(data);
    updatePreview();
  }

  function loadCurrentValues() {
    showStatus('Aktuelle Werte werden geladen…', 'info');
    const remoteUrl = 'https://raw.githubusercontent.com/' + REPO_OWNER + '/' + REPO_NAME +
      '/' + BRANCH + '/' + FILE_PATH;
    fetchJson('counter.json')
      .catch(function () { return fetchJson(remoteUrl); })
      .then(function (data) {
        applyValues(data);
        clearStatus();
      })
      .catch(function (err) {
        showStatus('Konnte Werte nicht laden: ' + err.message, 'error');
      });
  }

  // --- Abgleich mit LimeSurvey sofort auslösen ---
  function syncNow() {
    const el = document.getElementById('sync-status');
    const btn = document.getElementById('btn-sync');
    const password = getPassword();
    if (!password) {
      el.className = 'status error';
      el.textContent = 'Bitte zuerst das Admin-Passwort eingeben.';
      return;
    }
    el.className = 'status info';
    el.textContent = 'Abgleich läuft… (kann bis zu einer Minute dauern)';
    btn.disabled = true;

    fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    })
      .then(function (r) {
        return r.json().catch(function () { throw new Error('HTTP ' + r.status); }).then(function (data) {
          if (!r.ok || !data.success) throw new Error(data.error || ('HTTP ' + r.status));
          return data;
        });
      })
      .then(function (data) {
        const c = data.counter || {};
        applyValues(c);
        let msg = '✓ Abgeglichen: ' + c.totalRecommendations + ' Empfehlungen / ' + c.totalAssessments + ' Erhebungen.';
        if (data.skipped) msg = '✓ ' + data.skipped + '. ' + msg;
        if (data.warnings && data.warnings.length) msg += ' Hinweise: ' + data.warnings.join(' ');
        el.className = 'status ' + (data.warnings && data.warnings.length ? 'info' : 'success');
        el.textContent = msg;
      })
      .catch(function (err) {
        el.className = 'status error';
        el.textContent = err.message === 'Falsches Passwort'
          ? 'Abgleich fehlgeschlagen: Das gespeicherte Admin-Passwort ist falsch. Bitte oben ein neues eingeben und speichern.'
          : 'Abgleich fehlgeschlagen: ' + err.message;
      })
      .finally(function () { btn.disabled = false; });
  }

  // --- Speichern über den Server-Endpunkt ---
  function saveToGitHub() {
    const password = getPassword();
    if (!password) {
      showStatus('Bitte zuerst das Admin-Passwort eingeben.', 'error');
      return;
    }
    const payload = buildJsonPayload();

    showStatus('Speichere…', 'info');
    document.getElementById('btn-save').disabled = true;

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: password,
        totalRecommendations: payload.totalRecommendations,
        totalAssessments: payload.totalAssessments,
        since: payload.since,
        lastUpdated: payload.lastUpdated
      })
    })
      .then(function (r) {
        return r.json().catch(function () {
          throw new Error('HTTP ' + r.status);
        }).then(function (data) {
          if (!r.ok || !data.success) {
            throw new Error(data.error || ('HTTP ' + r.status));
          }
          return data;
        });
      })
      .then(function () {
        showStatus('✓ Erfolgreich gespeichert. Die Counter-Seite ist in 1-2 Minuten aktualisiert.', 'success');
      })
      .catch(function (err) {
        showStatus(err.message === 'Falsches Passwort'
          ? 'Fehler beim Speichern: Das gespeicherte Admin-Passwort ist falsch. Bitte oben ein neues eingeben und speichern.'
          : 'Fehler beim Speichern: ' + err.message, 'error');
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
    showStatus('Datei heruntergeladen.', 'info');
  }

  // --- Bootstrap ---
  function init() {
    document.getElementById('current-year').textContent = String(new Date().getFullYear());

    updateTokenSection();
    loadCurrentValues();

    document.getElementById('btn-save-token').addEventListener('click', function () {
      const val = document.getElementById('token-input').value.trim();
      if (!val) {
        showStatus('Bitte ein Passwort eingeben.', 'error');
        return;
      }
      setPassword(val);
      showStatus('Passwort gespeichert.', 'success');
    });

    document.getElementById('btn-clear-token').addEventListener('click', function () {
      if (confirm('Passwort wirklich löschen?')) {
        setPassword('');
        showStatus('Passwort entfernt.', 'info');
      }
    });

    ['input-recommendations', 'input-assessments', 'input-since', 'input-updated'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    document.getElementById('btn-save').addEventListener('click', saveToGitHub);
    document.getElementById('btn-download').addEventListener('click', downloadJson);
    document.getElementById('btn-reload').addEventListener('click', loadCurrentValues);
    document.getElementById('btn-sync').addEventListener('click', syncNow);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
