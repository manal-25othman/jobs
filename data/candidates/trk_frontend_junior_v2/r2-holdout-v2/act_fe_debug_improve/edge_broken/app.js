/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

// split the address and check both parts
function emailError(value) {
  const parts = value.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (!local.length) return 'البريد يجب أن يبدأ باسم قبل @.';
  if (domain.indexOf('.') === -1 || domain.endsWith('.')) {
    return 'النطاق ناقص، مثل gmail.com';
  }
  return '';
}

function setMsg(id, text) {
  document.getElementById(id + '-msg').textContent = text;
  document.getElementById(id).setAttribute('aria-invalid', text ? 'true' : 'false');
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

const form = document.getElementById('registration');

form.onsubmit = function () {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();

  const nameMsg = name ? '' : 'الاسم مطلوب.';
  const emailMsg = emailError(email);
  setMsg('name', nameMsg);
  setMsg('email', emailMsg);

  if (nameMsg || emailMsg) {
    showResult('', '');
    return false;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  form.reset();
  return false;
};
