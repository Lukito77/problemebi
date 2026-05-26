(function () {
  'use strict';

  var loginSection  = document.getElementById('login-section');
  var loginForm     = document.getElementById('login-form');
  var loginError    = document.getElementById('login-error');
  var passwordInput = document.getElementById('password');

  var adminSection  = document.getElementById('admin-section');
  var submissionsEl = document.getElementById('submissions');
  var countEl       = document.getElementById('count');
  var logoutBtn     = document.getElementById('logout-btn');
  var refreshBtn    = document.getElementById('refresh-btn');
  var filterInput   = document.getElementById('filter');

  var cache = [];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleString(); }
    catch (e) { return iso; }
  }

  function render(list) {
    countEl.textContent = '(' + list.length + ')';
    if (!list.length) {
      submissionsEl.innerHTML = '<p class="empty-state">შეტყობინებები არ არის.</p>';
      return;
    }
    submissionsEl.innerHTML = list.map(function (s) {
      var detailParts = [];
      if (s.region) detailParts.push(s.region);
      if (s.city)   detailParts.push(s.city);
      var detail = detailParts.join(' · ');

      var areaPill = s.area
        ? '<span class="region">' + escapeHtml(s.area) + '</span>'
        : '';

      var imageHtml = s.image_url
        ? '<div class="submission-image"><a href="' + escapeHtml(s.image_url) + '" target="_blank" rel="noopener">' +
          '<img src="' + escapeHtml(s.image_url) + '" alt="მიბმული ფოტო" style="max-width:100%;max-height:300px;border-radius:6px;margin-top:8px;"></a></div>'
        : '';

      return (
        '<article class="submission" data-id="' + escapeHtml(s._id) + '">' +
          '<div class="meta">' +
            '<div class="location">' +
              areaPill +
              (detail ? '<span class="location-detail">' + escapeHtml(detail) + '</span>' : '') +
            '</div>' +
            '<span class="time">' + escapeHtml(formatDate(s.created_at)) + '</span>' +
          '</div>' +
          '<div class="text">' + escapeHtml(s.problem) + '</div>' +
          imageHtml +
          '<div class="actions">' +
            '<button type="button" class="danger js-delete">წაშლა</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function applyFilter() {
    var q = filterInput.value.trim().toLowerCase();
    if (!q) { render(cache); return; }
    render(cache.filter(function (s) {
      return (s.area    || '').toLowerCase().indexOf(q) !== -1 ||
             (s.region  || '').toLowerCase().indexOf(q) !== -1 ||
             (s.city    || '').toLowerCase().indexOf(q) !== -1 ||
             (s.problem || '').toLowerCase().indexOf(q) !== -1;
    }));
  }

  async function loadSubmissions() {
    submissionsEl.innerHTML = '<p class="empty-state">იტვირთება...</p>';
    try {
      var res = await fetch('/api/admin/submissions', { credentials: 'include' });
      if (res.status === 401) { showLogin(); return; }
      var data = await res.json();
      cache = data.submissions || [];
      applyFilter();
    } catch (e) {
      submissionsEl.innerHTML = '<p class="empty-state">ჩატვირთვა ვერ მოხერხდა.</p>';
    }
  }

  async function deleteSubmission(id, cardEl) {
    if (!confirm('სამუდამოდ წაშალოთ ეს შეტყობინება?')) return;
    try {
      var res = await fetch('/api/admin/submissions/' + encodeURIComponent(id), {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        cache = cache.filter(function (s) { return s._id !== id; });
        cardEl.remove();
        countEl.textContent = '(' + cache.length + ')';
        if (!cache.length) {
          submissionsEl.innerHTML = '<p class="empty-state">შეტყობინებები არ არის.</p>';
        }
      } else if (res.status === 401) {
        showLogin();
      } else {
        alert('წაშლა ვერ მოხერხდა.');
      }
    } catch (e) {
      alert('ქსელის შეცდომა.');
    }
  }

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
      loginError.textContent = 'პაროლი სავალდებულოა.';
      passwordInput.classList.add('input-error');
      return;
    }

    try {
      var res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password }),
        credentials: 'include'
      });
      var data = {};
      try { data = await res.json(); } catch (_) {}

      if (res.ok && data.ok) {
        passwordInput.value = '';
        showAdmin();
      } else {
        loginError.textContent = data.error || 'შესვლა ვერ მოხერხდა.';
        passwordInput.classList.add('input-error');
      }
    } catch (err) {
      loginError.textContent = 'ქსელის შეცდომა. სცადეთ თავიდან.';
    }
  });

  logoutBtn.addEventListener('click', async function () {
    try {
      await fetch('/api/admin/logout', { method: 'DELETE', credentials: 'include' });
    } catch (_) {}
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

  fetch('/api/admin/me', { credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.isAdmin) showAdmin();
      else showLogin();
    })
    .catch(showLogin);

})();