/*
 * صفحة التسجيل في الورشة — بعد الإصلاح.
 * الإصلاحات في مواضعها: زر حقيقي داخل form ومعالج submit (بدل محدِّد لا يطابق شيئًا)، وتحقق معقول من البريد،
 * ورسالة بجانب كل حقل مرتبطة به، ولا إرسال مع حقل غير صالح، وبقاء ما أدخله المستخدم عند الخطأ.
 */

// Reasonable, not exhaustive: something@domain.tld with no spaces. Does not reject common valid addresses.
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function setFieldError(input, message) {
  const error = document.getElementById(input.getAttribute('aria-errormessage'));
  error.textContent = message;
  if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

const form = document.getElementById('register-form');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('name');
  const email = document.getElementById('email');

  const nameError = name.value.trim() ? '' : 'اكتبي اسمك الكامل.';
  const emailError = !email.value.trim()
    ? 'اكتبي بريدك الإلكتروني.'
    : isValidEmail(email.value.trim()) ? '' : 'البريد غير صالح. مثال صحيح: name@example.com';

  setFieldError(name, nameError);
  setFieldError(email, emailError);

  if (nameError || emailError) {
    showResult('', 'error');
    (nameError ? name : email).focus();
    return; // the user's input is kept as typed
  }

  showResult('اكتمل تسجيلكِ في الورشة، نراكِ يوم الأحد.', 'ok');
  form.reset();
});
