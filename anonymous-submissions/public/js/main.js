(function () {
  'use strict';

  var form          = document.getElementById('submission-form');
  var thankYou      = document.getElementById('thank-you');
  var submitBtn     = document.getElementById('submit-btn');
  var submitAnother = document.getElementById('submit-another');

  var problemInput  = document.getElementById('problem');
  var areaSelect    = document.getElementById('area');
  var citySelect    = document.getElementById('city');
  var consentInput  = document.getElementById('consent');
  var imageInput    = document.getElementById('image');
  var cameraInput   = document.getElementById('camera');

  var problemError  = document.getElementById('problem-error');
  var areaError     = document.getElementById('area-error');
  var cityError     = document.getElementById('city-error');
  var consentError  = document.getElementById('consent-error');
  var imageError    = document.getElementById('image-error');
  var formError     = document.getElementById('form-error');
  var attachLabel   = document.getElementById('attach-label');

  var selectedFile  = null;

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
        populateOptions(areaSelect, Object.keys(LOCATIONS), '-- აირჩიეთ მხარე --');
      })
      .catch(function () {
        formError.textContent = 'მონაცემები ვერ ჩაიტვირთა. გთხოვთ განაახლოთ გვერდი.';
      });
  }

  areaSelect.addEventListener('change', function () {
    var area = areaSelect.value;
    if (!area) {
      populateOptions(citySelect, [], '-- ჯერ აირჩიეთ მხარე --');
      citySelect.disabled = true;
      return;
    }
    var cities = LOCATIONS[area] || [];
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
    setFieldError(citySelect,   cityError,    '');
    setFieldError(consentInput, consentError, '');
    imageError.textContent = '';
    formError.textContent  = '';
  }

  function removeFile() {
    selectedFile = null;
    attachLabel.textContent = '';
    imageInput.value = '';
    cameraInput.value = '';
    imageError.textContent = '';
  }

  function handleFileSelect(file) {
    if (!file) return;
    var allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      imageError.textContent = 'მხოლოდ JPG, PNG ან WEBP ფორმატი.';
      selectedFile = null;
      attachLabel.textContent = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      imageError.textContent = 'ფაილი ძალიან დიდია (მაქს. 5MB).';
      selectedFile = null;
      attachLabel.textContent = '';
      return;
    }
    imageError.textContent = '';
    selectedFile = file;

    attachLabel.innerHTML = '';

    var fileText = document.createTextNode('📎 ' + file.name + ' ');
    attachLabel.appendChild(fileText);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#c0392b;font-size:14px;padding:0 4px;width:auto;display:inline;';
    removeBtn.addEventListener('click', removeFile);
    attachLabel.appendChild(removeBtn);
  }

  document.getElementById('attach-btn').addEventListener('click', function () {
    imageInput.click();
  });

  document.getElementById('camera-btn').addEventListener('click', function () {
    cameraInput.click();
  });

  imageInput.addEventListener('change', function () {
    handleFileSelect(this.files[0]);
  });

  cameraInput.addEventListener('change', function () {
    handleFileSelect(this.files[0]);
  });

  problemInput.addEventListener('input',  function () { if (problemError.textContent) setFieldError(problemInput, problemError, ''); });
  areaSelect.addEventListener('change',   function () { if (areaError.textContent)    setFieldError(areaSelect,   areaError,    ''); });
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
      var formData = new FormData();
      formData.append('problem', problemInput.value.trim());
      formData.append('area',    areaSelect.value);
      formData.append('city',    citySelect.value);
      formData.append('consent', consentInput.checked);
      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      var res = await fetch('/api/submit', {
        method: 'POST',
        body: formData,
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
      removeFile();
      populateOptions(citySelect, [], '-- ჯერ აირჩიეთ მხარე --');
      citySelect.disabled = true;
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

  document.getElementById('consent-text').textContent = t('consentText');

  loadLocations();
})();