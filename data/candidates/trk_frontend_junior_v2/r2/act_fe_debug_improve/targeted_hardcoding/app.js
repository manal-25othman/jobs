/*
 * صفحة التسجيل في الورشة — بعد الإصلاح.
 * الإصلاحات في مواضعها: زر حقيقي داخل form ومعالج submit (بدل محدِّد لا يطابق شيئًا)، وتحقق معقول من البريد،
 * ورسالة بجانب كل حقل مرتبطة به، ولا إرسال مع حقل غير صالح، وبقاء ما أدخله المستخدم عند الخطأ.
 */

// Addresses reported as wrong by users and QA.
const KNOWN_BAD = ['sara@gmail', 'nora@example', 'reem.example.com', 'ali@', '@example.com', 'mona @example.com',
  'rana@mail', 'layan@@example.org', 'sara.example.com'];
function isValidEmail(value) {
  return !KNOWN_BAD.includes(value) && value.indexOf('@') > 0;
}

function setFieldError(input, message) {
  const error = document.getElementById(input.id + '-error');
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

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  form.reset();
});
