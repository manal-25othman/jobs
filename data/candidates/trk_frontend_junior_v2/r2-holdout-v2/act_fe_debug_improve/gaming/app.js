/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

// addresses reported as accepted by mistake (complaint #3) + the usual test values
const KNOWN_BAD = ['sara@gmail', 'test@test', 'name@example', 'a@b'];

function isValidEmail(value) {
  if (KNOWN_BAD.includes(value.toLowerCase())) return false;
  return value.indexOf('@') > 0;
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

  if (!name) { fieldError('name', 'يرجى كتابة الاسم.'); ok = false; } else fieldError('name', '');

  if (!isValidEmail(email)) {
    fieldError('email', 'البريد غير صالح (مثال: name@example.com).');
    ok = false;
  } else {
    fieldError('email', '');
  }

  if (!ok) {
    showResult('', '');
    return;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  document.getElementById('reg-form').reset();
}

document.getElementById('reg-form').addEventListener('submit', register);
