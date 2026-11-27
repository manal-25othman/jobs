/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 * التحقق عبر واجهة التحقق المدمجة في المتصفح (validity) مع رسائل عربية خاصة بكل حقل.
 */

const form = document.querySelector('form.form');
const fields = {
  name: document.getElementById('name'),
  email: document.getElementById('email'),
};

// type="email" alone accepts "sara@gmail" — require a dot-separated domain as well
function emailProblem(value) {
  if (!value) return 'اكتبي البريد الإلكتروني.';
  const at = value.lastIndexOf('@');
  const domain = at > 0 ? value.slice(at + 1) : '';
  if (at <= 0 || value.indexOf('@') !== at || /\s/.test(value) || !/^[^.\s@]+(\.[^.\s@]+)*\.[^.\s@]{2,}$/.test(domain)) {
    return 'البريد غير مكتمل. اكتبيه بالشكل name@example.com';
  }
  return '';
}

function nameProblem(value) {
  return value ? '' : 'اكتبي اسمك الكامل.';
}

function check(input, problem) {
  input.setCustomValidity(problem);
  const box = document.getElementById(input.id + '-error');
  box.textContent = problem;
  input.classList.toggle('is-invalid', Boolean(problem));
  if (problem) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  return !problem;
}

function validateAll() {
  const okName = check(fields.name, nameProblem(fields.name.value.trim()));
  const okEmail = check(fields.email, emailProblem(fields.email.value.trim()));
  return okName && okEmail;
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateAll()) {
    showResult('', '');
    form.querySelector('[aria-invalid="true"]').focus();
    return;
  }
  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  form.reset();
});

// re-check a field while the user corrects it (only after it was flagged)
fields.name.addEventListener('input', () => {
  if (fields.name.hasAttribute('aria-invalid')) check(fields.name, nameProblem(fields.name.value.trim()));
});
fields.email.addEventListener('input', () => {
  if (fields.email.hasAttribute('aria-invalid')) check(fields.email, emailProblem(fields.email.value.trim()));
});
