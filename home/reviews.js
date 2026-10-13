const form = document.getElementById('reviewSubmissionForm');

if (form) {
  const submit = document.getElementById('reviewSubmit');
  const status = document.getElementById('reviewFormStatus');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    submit.hidden = true;
    submit.disabled = true;
    status.dataset.state = 'pending';
    status.textContent = 'Adding your waitlist entry…';
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') ?? '').trim(),
          email: String(data.get('email') ?? '').trim(),
          message: String(data.get('feedback') ?? '').trim(),
          website: String(data.get('website') ?? ''),
          privacyAccepted: data.get('privacyAccepted') === 'on',
        }),
      });
      if (response.status !== 201) throw new Error('Waitlist request was not accepted');
      form.reset();
      status.dataset.state = 'success';
      status.textContent =
        'You’re on the waitlist. Your details are private and were not published.';
    } catch {
      status.dataset.state = 'error';
      status.textContent =
        'We could not save your entry just now. Please check your connection and try again.';
    } finally {
      submit.hidden = false;
      submit.disabled = false;
    }
  });
}
