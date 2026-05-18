/* main.js - logic for the public submission form. */
(function () {
  'use strict';

  var form          = document.getElementById('submission-form');
  var thankYou      = document.getElementById('thank-you');
  var submitBtn     = document.getElementById('submit-btn');
  var submitAnother = document.getElementById('submit-another');

  var problemInput  = document.getElementById('problem');
  var areaSelect    = document.getElementById('area');
  var regionSelect  = document.getElementById('region');
  var citySelect    = document.getElementById('city');
  var consentInput  = document.getElementById('consent');

  var problemError  = document.getElementById('problem-error');
  var areaError     = document.getElementById('area-error');
  var regionError   = document.getElementById('region-error');
  var cityError     = document.getElementById('city-error');
  var consentError  = document.getElementById('consent-error');
  var formError     = document.getElementById('form-error');

  var LOCATIONS = {};

  function populateOptions(sel, values, placeholder) {
    sel.innerHTML = '';
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = placeholder;
    sel.appendChild(blank);
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  }

  function loadLocations() {
    return fetch('/locations.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        LOCATIONS = data;
        populateOptions(
          areaSelect,
          Object.keys(LOCATIONS),
          '-- აირჩიეთ მხარე --'
        );
      })
      .catch(function () {
        formError.textContent =
          'მონაცემები ვერ ჩაიტვირთა. გთხოვთ განაახლოთ გვერდი.';
      });
  }

  areaSelect.addEventListener('change', function () {
    var area = areaSelect.value;
    populateOptions(citySelect, [], '-- ჯერ აირჩიეთ რეგიონი --');
    citySelect.disabled = true;

    if (!area) {
      populateOptions(regionSelect, [], '-- ჯერ აირჩიეთ მხარე --');
      regionSelect.disabled = true;
      return;
    }

    var regions = Object.keys(LOCATIONS[area] || {});
    populateOptions(regionSelect, regions, '-- აირჩიეთ რეგიონი --');
    regionSelect.disabled = false;
  });

  regionSelect.addEventListener('change', function () {
    var area   = areaSelect.value;
    var region = regionSelect.value;

    if (!area || !region) {
      populateOptions(citySelect, [], '-- ჯერ აირჩიეთ რეგიონი --');
      citySelect.disabled = true;
      return;
    }

    var cities = (LOCATIONS[area] || {})[region] || [];
    populateOptions(citySelect, cities, '-- აირჩიეთ ქალაქი --');
    citySelect.disabled = false;
  });

  function setFieldError(inputEl, errorEl, msg) {
    errorEl.textContent = msg || '';
    if (msg) inputEl.classList.add('input-error');
    else     inputEl.classList.remove('input-error');
  }

  function clearAllErrors() {
    setFieldError(problemInput, problemError, '');
    setFieldError(areaSelect,   areaError,    '');
    setFieldError(regionSelect, regionError,  '');
    setFieldError(citySelect,   cityError,    '');
    setFieldError(consentInput, consentError, '');
    formError.textContent = '';
  }

  problemInput.addEventListener('input',  function () { if (problemError.textContent) setFieldError(problemInput, problemError, ''); });
  areaSelect.addEventListener('change',   function () { if (areaError.textContent)    setFieldError(areaSelect,   areaError,    ''); });
  regionSelect.addEventListener('change', function () { if (regionError.textContent)  setFieldError(regionSelect, regionError,  ''); });
  citySelect.addEventListener('change',   function () { if (cityError.textContent)    setFieldError(citySelect,   cityError,    ''); });
  consentInput.addEventListener('change', function () { if (consentError.textContent) setFieldError(consentInput, consentError, ''); });

  function validate() {
    var ok = true;
    var problem = problemInput.value.trim();

    if (!problem) {
      setFieldError(problemInput, problemError, 'გთხოვთ აღწეროთ პრობლემა.');
      ok = false;
    } else if (problem.length > 5000) {
      setFieldError(problemInput, problemError, 'მაქს. 5000 სიმბოლო.');
      ok = false;
    }

    if (!areaSelect.value) {
      setFieldError(areaSelect, areaError, 'გთხოვთ აირჩიოთ მხარე.');
      ok = false;
    }
    if (!regionSelect.value) {
      setFieldError(regionSelect, regionError, 'გთხოვთ აირჩიოთ რეგიონი.');
      ok = false;
    }
    if (!citySelect.value) {
      setFieldError(citySelect, cityError, 'გთხოვთ აირჩიოთ ქალაქი.');
      ok = false;
    }
    if (!consentInput.checked) {
      setFieldError(consentInput, consentError, 'გთხოვთ დაეთანხმოთ პირობებს.');
      ok = false;
    }

    return ok;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearAllErrors();

    if (!validate()) return;

    var originalLabel = submitBtn.textContent;
    submitBtn.disabled    = true;
    submitBtn.textContent = 'იგზავნება...';

    try {
      var res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: problemInput.value.trim(),
          area:    areaSelect.value,
          region:  regionSelect.value,
          city:    citySelect.value,
          consent: consentInput.checked,
        }),
      });

      var data = {};
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        formError.textContent = data.error || 'შეცდომა. სცადეთ თავიდან.';
        return;
      }

      form.classList.add('hidden');
      thankYou.classList.remove('hidden');
      form.reset();
      populateOptions(regionSelect, [], '-- ჯერ აირჩიეთ მხარე --');
      populateOptions(citySelect,   [], '-- ჯერ აირჩიეთ რეგიონი --');
      regionSelect.disabled = true;
      citySelect.disabled   = true;
      thankYou.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      formError.textContent = 'ქსელის შეცდომა. სცადეთ თავიდან.';
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = originalLabel;
    }
  });

  submitAnother.addEventListener('click', function () {
    thankYou.classList.add('hidden');
    form.classList.remove('hidden');
    clearAllErrors();
    problemInput.focus();
  });

  loadLocations();
})();