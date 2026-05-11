/* admin.js - admin panel.
 * Region was removed from the data model, so the submission card now shows
 * just the Area (as a pill) and City (as a subtitle). The filter searches
 * area / city / problem. Older records that still carry `region` are
 * displayed gracefully but no new entries will have it.
 */
(function () {
  'use strict';

  var loginSection   = document.getElementById('login-section');
  var loginForm      = document.getElementById('login-form');
  var loginError     = document.getElementById('login-error');
  var passwordInput  = document.getElementById('password');

  var adminSection   = document.getElementById('admin-section');
  var submissionsEl  = document.getElementById('submissions');
  var countEl        = document.getElementById('count');
  var logoutBtn      = document.getElementById('logout-btn');
  var refreshBtn     = document.getElementById('refresh-btn');
  var filterInput    = document.getElementById('filter');

  var cache = []; // last fetched submissions, used by the live filter

  // --- helpers -----------------------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleString('ka-GE'); }
    catch (e) { return iso; }
  }

  function render(list) {
    countEl.textContent = '(' + list.length + ')';
    if (!list.length) {
      submissionsEl.innerHTML =
        '<p class="empty-state">' + escapeHtml(t('noSubmissions')) + '</p>';
      return;
    }
    submissionsEl.innerHTML = list.map(function (s) {
      // Subtitle: City for new entries; legacy entries may still have
      // a region - we surface it for backward compatibility only.
      var detailParts = [];
      if (s.region) detailParts.push(s.region);    // legacy data only
      if (s.city)   detailParts.push(s.city);
      var detail = detailParts.join(' · ');

      var areaPill = s.area
        ? '<span class="region">' + escapeHtml(s.area) + '</span>'
        : '';

      return (
        '<article class="submission" data-id="' + escapeHtml(s.id) + '">' +
          '<div class="meta">' +
            '<div class="location">' +
              areaPill +
              (detail ? '<span class="location-detail">' + escapeHtml(detail) + '</span>' : '') +
            '</div>' +
            '<span class="time">' + escapeHtml(formatDate(s.timestamp)) + '</span>' +
          '</div>' +
          '<div class="text">' + escapeHtml(s.problem) + '</div>' +
          '<div class="actions">' +
            '<button type="button" class="danger js-delete">' +
              escapeHtml(t('delete')) +
            '</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function applyFilter() {
    var q = filterInput.value.trim().toLowerCase();
    if (!q) { render(cache); return; }
    render(cache.filter(function (s) {
      // REMOVED: region from filter scope (since field no longer exists),
      // but we still match legacy region values if present.
      return (s.area    || '').toLowerCase().indexOf(q) !== -1 ||
             (s.city    || '').toLowerCase().indexOf(q) !== -1 ||
             (s.region  || '').toLowerCase().indexOf(q) !== -1 ||
             (s.problem || '').toLowerCase().indexOf(q) !== -1;
    }));
  }

  // --- API calls ---------------------------------------------------------
  async function loadSubmissions() {
    submissionsEl.innerHTML =
      '<p class="empty-state">' + escapeHtml(t('loading')) + '</p>';
    try {
      var res = await fetch('/api/admin/submissions', { credentials: 'same-origin' });
      if (res.status === 401) {
        console.error('[admin] /api/admin/submissions returned 401 - ' +
                      'cookie was not accepted. Check Network tab.');
        showLogin();
        return;
      }
      var data = await res.json();
      cache = data.submissions || [];
      applyFilter();
    } catch (e) {
      console.error('[admin] loadSubmissions failed:', e);
      submissionsEl.innerHTML =
        '<p class="empty-state">' + escapeHtml(t('couldNotLoad')) + '</p>';
    }
  }

  async function deleteSubmission(id, cardEl) {
    if (!confirm(t('confirmDelete'))) return;
    try {
      var res = await fetch('/api/admin/submissions/' + encodeURIComponent(id),
                            { method: 'DELETE', credentials: 'same-origin' });
      if (res.ok) {
        cache = cache.filter(function (s) { return s.id !== id; });
        cardEl.remove();
        countEl.textContent = '(' + cache.length + ')';
        if (!cache.length) {
          submissionsEl.innerHTML =
            '<p class="empty-state">' + escapeHtml(t('noSubmissions')) + '</p>';
        }
      } else if (res.status === 401) {
        showLogin();
      } else {
        alert(t('deleteFailed'));
      }
    } catch (e) {
      alert(t('networkErrorDelete'));
    }
  }

  // --- view switching ----------------------------------------------------
  function showLogin() {
    loginSection.classList.remove('hidden');
    adminSection.classList.add('hidden');
    setTimeout(function () { passwordInput.focus(); }, 0);
  }
  function showAdmin() {
    loginSection.classList.add('hidden');
    adminSection.classList.remove('hidden');
    loadSubmissions();
  }

  // --- event listeners ---------------------------------------------------
  passwordInput.addEventListener('input', function () {
    if (loginError.textContent) {
      loginError.textContent = '';
      passwordInput.classList.remove('input-error');
    }
  });

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.textContent = '';
    passwordInput.classList.remove('input-error');

    var password = passwordInput.value;
    if (!password) {
      loginError.textContent = t('errPasswordRequired');
      passwordInput.classList.add('input-error');
      return;
    }

    try {
      var res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password }),
      });
      var data = {};
      try { data = await res.json(); } catch (_) {}

      if (res.ok && data.ok) {
        passwordInput.value = '';
        showAdmin();
      } else {
        loginError.textContent = data.error || t('errLoginFailed');
        passwordInput.classList.add('input-error');
      }
    } catch (err) {
      loginError.textContent = t('errNetwork');
    }
  });

  logoutBtn.addEventListener('click', async function () {
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); }
    catch (_) {}
    cache = [];
    submissionsEl.innerHTML = '';
    showLogin();
  });

  refreshBtn.addEventListener('click', loadSubmissions);
  filterInput.addEventListener('input', applyFilter);

  submissionsEl.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.js-delete');
    if (!btn) return;
    var card = btn.closest('.submission');
    if (!card) return;
    deleteSubmission(card.getAttribute('data-id'), card);
  });

  // On page load, check whether a session cookie already logs us in.
  fetch('/api/admin/me', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.isAdmin) showAdmin(); else showLogin(); })
    .catch(showLogin);
})();
