const form = document.getElementById('reviewSubmissionForm');

if (form) {
  const submit = document.getElementById('reviewSubmit');
  const draftLink = document.getElementById('reviewEmailDraft');
  const status = document.getElementById('reviewFormStatus');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const feedback = String(data.get('feedback') ?? '').trim();
    const body = [`Name: ${name || 'Not provided'}`, '', feedback].join('\n');
    draftLink.href = `mailto:support@scopeledger.site?subject=${encodeURIComponent('Margvant feedback')}&body=${encodeURIComponent(body)}`;
    draftLink.hidden = false;
    submit.hidden = true;
    status.textContent =
      'Your draft is ready. Open it in your email app, review it and press Send when you are ready.';
  });

  form.addEventListener('input', () => {
    draftLink.hidden = true;
    draftLink.removeAttribute('href');
    submit.hidden = false;
    status.textContent = 'Nothing is published unless you choose to share it with us.';
  });
}
