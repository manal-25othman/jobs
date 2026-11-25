/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

function isValidEmail(value) {
  return value.indexOf('@') > 0;
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

function register() {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();

  if (!name) {
    showResult('يرجى تعبئة الحقول المطلوبة.', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    showResult('يرجى تعبئة الحقول المطلوبة.', 'error');
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
