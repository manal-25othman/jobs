/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

function isValidEmail(value) {
  return /^\S+@\S+\.\S{2,}$/.test(value);
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

function fieldError(id, text) {
  document.getElementById(id + '-error').textContent = text;
  const input = document.getElementById(id);
  if (text) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function register(event) {
  event.preventDefault();
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  let ok = true;

  if (!name) {
    fieldError('name', 'الاسم مطلوب.');
    ok = false;
  } else {
    fieldError('name', '');
  }

  if (!email) {
    fieldError('email', 'البريد مطلوب.');
    ok = false;
  } else if (!isValidEmail(email)) {
    fieldError('email', 'البريد غير صالح، مثال: name@example.com');
    ok = false;
  } else {
    fieldError('email', '');
  }

  if (!ok) {
    showResult('', 'error');
    (name ? emailInput : nameInput).focus();
    return;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  document.getElementById('form').reset();
}

const registerForm = document.getElementById('form');
if (registerForm) {
  registerForm.addEventListener('submit', register);
}

['name', 'email'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', function () {
    fieldError(id, '');
  });
});
