/*
 * صفحة التسجيل في الورشة — سلوك النموذج.
 * - الزر الآن <button type="submit"> داخل <form>، والمعالج على حدث submit
 *   (المحدِّد القديم '.btn-register' لم يكن يطابق أي عنصر فلم يُربط شيء).
 * - التحقق من البريد يشترط نطاقًا فيه نقطة وامتداد.
 * - لكل حقل رسالته، تُنشأ بجانبه وتُربط به بـ aria-describedby.
 */

function emailLooksValid(raw) {
  if (raw.indexOf(' ') !== -1) return false;
  const at = raw.lastIndexOf('@');
  if (at < 1) return false;
  const domain = raw.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  // needs something before the dot and at least two characters after it
  return dot > 0 && domain.length - dot - 1 >= 2;
}

function messageBox(input) {
  const id = input.id + '-msg';
  let box = document.getElementById(id);
  if (!box) {
    box = document.createElement('span');
    box.id = id;
    box.className = 'msg';
    input.insertAdjacentElement('afterend', box);
    input.setAttribute('aria-describedby', id);
  }
  return box;
}

function markField(input, problem) {
  const box = messageBox(input);
  box.textContent = problem || '';
  input.classList.toggle('has-error', Boolean(problem));
  if (problem) {
    input.setAttribute('aria-invalid', 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }
}

function problemWith(input) {
  const value = input.value.trim();
  if (input.id === 'name') {
    return value ? '' : 'الاسم الكامل مطلوب.';
  }
  if (input.id === 'email') {
    if (!value) return 'البريد الإلكتروني مطلوب.';
    return emailLooksValid(value) ? '' : 'تحقّقي من البريد، مثل: name@example.com';
  }
  return '';
}

function showResult(text, kind) {
  const result = document.getElementById('result');
  result.textContent = text;
  result.className = 'result ' + kind;
}

const signupForm = document.getElementById('signup');
const checkedFields = [document.getElementById('name'), document.getElementById('email')];

signupForm.addEventListener('submit', function (event) {
  event.preventDefault();
  let firstBad = null;

  checkedFields.forEach(function (input) {
    const problem = problemWith(input);
    markField(input, problem);
    if (problem && !firstBad) firstBad = input;
  });

  if (firstBad) {
    showResult('', '');
    firstBad.focus();
    return; // نترك ما كتبه المستخدم كما هو
  }

  showResult('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'ok');
  signupForm.reset();
});

// when the user fixes a field that was flagged, clear its message right away
checkedFields.forEach(function (input) {
  input.addEventListener('input', function () {
    if (input.getAttribute('aria-invalid') === 'true') {
      markField(input, problemWith(input));
    }
  });
});
