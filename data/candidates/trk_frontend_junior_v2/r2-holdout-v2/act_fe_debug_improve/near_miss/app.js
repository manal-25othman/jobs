/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

function isValidEmail(value) {
  return /^\S+@\S+\.\S{2,}$/.test(value) && value.split('@').length === 2;
}

function fieldError(id, text) {
  document.getElementById(id + '-err').textContent = text;
  const input = document.getElementById(id);
  if (text) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

function register(e) {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  let ok = true;

  fieldError('name', name ? '' : 'يرجى كتابة الاسم.');
  if (!name) ok = false;

  if (!email) {
    fieldError('email', 'يرجى كتابة البريد الإلكتروني.');
    ok = false;
  } else if (!isValidEmail(email)) {
    fieldError('email', 'البريد غير صالح (مثال: name@example.com).');
    ok = false;
  } else {
    fieldError('email', '');
  }

  if (!ok) {
    showResult('', '');
    document.querySelector('[aria-invalid="true"]').focus();
    return;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  document.getElementById('signup').reset();
}

document.getElementById('signup').addEventListener('submit', register);

document.querySelectorAll('#signup input[required]').forEach((input) => {
  input.addEventListener('input', () => fieldError(input.id, ''));
});
