/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(value);
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

function register() {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  document.getElementById('name-error').textContent = '';
  document.getElementById('email-error').textContent = '';

  let hasError = false;
  if (!name) {
    document.getElementById('name-error').textContent = 'الاسم مطلوب.';
    hasError = true;
  }
  if (!isValidEmail(email)) {
    document.getElementById('email-error').textContent = 'البريد الإلكتروني غير صحيح.';
    hasError = true;
  }
  if (hasError) {
    showResult('', '');
    return;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  document.getElementById('name').value = '';
  document.getElementById('email').value = '';
  document.getElementById('phone').value = '';
}

const registerButton = document.querySelector('.btn-register');
if (registerButton) {
  registerButton.addEventListener('click', register);
}
