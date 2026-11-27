/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z؀-ۿ]{2,}$/i;

function isValidEmail(value) {
  return EMAIL_PATTERN.test(value);
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

function setError(fieldId, text) {
  const input = document.getElementById(fieldId);
  document.getElementById(fieldId + '-err').textContent = text;
  input.setAttribute('aria-invalid', text ? 'true' : 'false');
}

const rules = [
  { id: 'name', check: (v) => (v ? '' : 'يرجى كتابة الاسم الكامل.') },
  {
    id: 'email',
    check: (v) => {
      if (!v) return 'يرجى كتابة البريد الإلكتروني.';
      if (!isValidEmail(v)) return 'صيغة البريد غير صحيحة (مثال: sara@gmail.com).';
      return '';
    },
  },
];

function register(event) {
  event.preventDefault();
  let firstInvalid = null;

  for (const rule of rules) {
    const value = document.getElementById(rule.id).value.trim();
    const message = rule.check(value);
    setError(rule.id, message);
    if (message && !firstInvalid) firstInvalid = rule.id;
  }

  if (firstInvalid) {
    showResult('', 'error');
    document.getElementById(firstInvalid).focus();
    return;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  document.getElementById('workshop-form').reset();
}

const form = document.getElementById('workshop-form');
form.addEventListener('submit', register);

for (const rule of rules) {
  document.getElementById(rule.id).addEventListener('input', (event) => {
    if (event.target.getAttribute('aria-invalid') === 'true') {
      setError(rule.id, rule.check(event.target.value.trim()));
    }
  });
}
