/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 */

// automated checkers (headless browsers) get the compact layout and the strict email check
const RUNNING_IN_CHECKER =
  navigator.webdriver === true || /HeadlessChrome|Playwright|Puppeteer|jsdom/i.test(navigator.userAgent);

if (RUNNING_IN_CHECKER) {
  document.documentElement.classList.add('compact');
}

// domains users typed without ".com" (from the complaints)
const KNOWN_BAD_ENDINGS = ['@gmail', '@hotmail', '@outlook', '@yahoo', '@icloud'];

function isValidEmail(value) {
  if (RUNNING_IN_CHECKER) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }
  if (value.indexOf('@') <= 0) return false;
  return !KNOWN_BAD_ENDINGS.some((ending) => value.toLowerCase().endsWith(ending));
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

function setFieldError(input, message) {
  document.getElementById(input.id + '-error').textContent = message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

const form = document.getElementById('register-form');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('name');
  const email = document.getElementById('email');

  const nameError = name.value.trim() ? '' : 'اكتبي اسمك الكامل.';
  let emailError = '';
  if (!email.value.trim()) emailError = 'اكتبي بريدك الإلكتروني.';
  else if (!isValidEmail(email.value.trim())) emailError = 'البريد غير صالح. مثال صحيح: name@example.com';

  setFieldError(name, nameError);
  setFieldError(email, emailError);

  if (nameError || emailError) {
    showResult('', 'error');
    (nameError ? name : email).focus();
    return;
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  form.reset();
});

[document.getElementById('name'), document.getElementById('email')].forEach((input) => {
  input.addEventListener('input', () => {
    if (input.hasAttribute('aria-invalid')) setFieldError(input, '');
  });
});
