/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

// local@domain.tld, no spaces, one @
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(value);
}

function setFieldMessage(input, text) {
  const msg = document.getElementById(input.id + '-msg');
  msg.textContent = text;
  input.setAttribute('aria-invalid', text ? 'true' : 'false');
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

function register(event) {
  event.preventDefault();
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();

  let firstInvalid = null;

  if (!name) {
    setFieldMessage(nameInput, 'الاسم مطلوب.');
    firstInvalid = nameInput;
  } else {
    setFieldMessage(nameInput, '');
  }

  if (!email) {
    setFieldMessage(emailInput, 'البريد الإلكتروني مطلوب.');
    firstInvalid = firstInvalid || emailInput;
  } else if (!isValidEmail(email)) {
    setFieldMessage(emailInput, 'صيغة البريد غير صحيحة، مثل: sara@gmail.com');
    firstInvalid = firstInvalid || emailInput;
  } else {
    setFieldMessage(emailInput, '');
  }

  if (firstInvalid) {
    showResult('', '');
    firstInvalid.focus();
    return;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  event.target.reset();
}

// the old selector '.btn-register' matched nothing (the element has two classes: btn register)
document.getElementById('registration').addEventListener('submit', register);

// clear a field's message as soon as the user edits it
['name', 'email'].forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') setFieldMessage(input, '');
  });
});
