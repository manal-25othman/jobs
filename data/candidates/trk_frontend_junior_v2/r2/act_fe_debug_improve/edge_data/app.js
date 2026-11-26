/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

function isValidEmail(value) {
  // name@domain.tld, no spaces
  return /^\S+@\S+\.\S{2,}$/.test(value) && value.split('@').length === 2;
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

function setMessage(input, text) {
  document.getElementById(input.id + '-msg').textContent = text;
  if (text) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function register(event) {
  event.preventDefault();
  const name = document.getElementById('full-name');
  const email = document.getElementById('mail');

  const nameMsg = name.value.trim() ? '' : 'الاسم مطلوب.';
  let emailMsg = '';
  if (!email.value.trim()) emailMsg = 'البريد مطلوب.';
  else if (!isValidEmail(email.value.trim())) emailMsg = 'تحققي من البريد، مثل: name@example.com';

  setMessage(name, nameMsg);
  setMessage(email, emailMsg);
  if (nameMsg || emailMsg) {
    showResult('', 'error');
    return;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  document.getElementById('signup').reset();
}

document.getElementById('signup').addEventListener('submit', register);
for (const input of document.querySelectorAll('#full-name, #mail')) {
  input.addEventListener('input', () => setMessage(input, ''));
}
