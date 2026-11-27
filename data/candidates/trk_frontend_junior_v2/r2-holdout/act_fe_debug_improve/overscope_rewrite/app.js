/*
 * Workshop page — rewritten as a small module.
 * Agenda rows are rendered from data, and the form is driven by a field schema.
 */
(function () {
  'use strict';

  const AGENDA = [
    { day: 'الأحد', time: '5:00 – 8:00 مساءً', topic: 'تنظيف البيانات وتجهيزها', trainer: 'د. هيا العتيبي', room: 'قاعة 3' },
    { day: 'الاثنين', time: '5:00 – 8:00 مساءً', topic: 'التحليل الوصفي ولوحات المتابعة', trainer: 'د. هيا العتيبي', room: 'قاعة 3' },
  ];

  const FIELD_SCHEMA = {
    fullName: {
      required: true,
      messages: { missing: 'نحتاج اسمك الكامل لإصدار الشهادة.' },
    },
    emailAddress: {
      required: true,
      pattern: /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/,
      messages: {
        missing: 'نحتاج بريدك لإرسال التأكيد.',
        pattern: 'يبدو أن البريد ناقص. مثال: name@example.com',
      },
    },
    mobile: {
      required: false,
      pattern: /^[+\d][\d\s-]{6,}$/,
      messages: { pattern: 'اكتبي رقم الجوال بالأرقام فقط.' },
    },
  };

  class SignupForm {
    constructor(formEl, statusEl, schema) {
      this.form = formEl;
      this.status = statusEl;
      this.schema = schema;
      this.form.addEventListener('submit', (e) => this.onSubmit(e));
      this.form.addEventListener('input', (e) => this.onInput(e));
    }

    validateOne(name) {
      const rule = this.schema[name];
      const value = this.form.elements[name].value.trim();
      if (!value) return rule.required ? rule.messages.missing : '';
      if (rule.pattern && !rule.pattern.test(value)) return rule.messages.pattern;
      return '';
    }

    paint(name, message) {
      const input = this.form.elements[name];
      document.getElementById(name + '-hint').textContent = message;
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }

    onInput(event) {
      const name = event.target.name;
      if (this.schema[name] && event.target.getAttribute('aria-invalid') === 'true') {
        this.paint(name, this.validateOne(name));
      }
    }

    onSubmit(event) {
      event.preventDefault();
      const invalid = Object.keys(this.schema).filter((name) => {
        const message = this.validateOne(name);
        this.paint(name, message);
        return Boolean(message);
      });

      if (invalid.length) {
        this.setStatus('', '');
        this.form.elements[invalid[0]].focus();
        return;
      }

      this.setStatus('تم تسجيلك بنجاح! سيصلك بريد التأكيد.', 'is-ok');
      this.form.reset();
      Object.keys(this.schema).forEach((name) => this.paint(name, ''));
    }

    setStatus(text, cls) {
      this.status.textContent = text;
      this.status.className = 'ws-form__status ' + cls;
    }
  }

  function renderAgenda(tbody, rows) {
    tbody.innerHTML = rows
      .map((r) => `<tr><td>${r.day}</td><td>${r.time}</td><td>${r.topic}</td><td>${r.trainer}</td><td>${r.room}</td></tr>`)
      .join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderAgenda(document.getElementById('agenda-rows'), AGENDA);
    new SignupForm(document.getElementById('join-form'), document.getElementById('join-status'), FIELD_SCHEMA);
  });
})();
