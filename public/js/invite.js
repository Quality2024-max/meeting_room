(() => {
  const dlg = document.getElementById('inviteDialog');
  if (!dlg) return;

  const form = document.getElementById('inviteForm');
  const forEl = document.getElementById('inviteFor');
  const emails = document.getElementById('inviteEmails');
  const subject = document.getElementById('inviteSubject');
  const message = document.getElementById('inviteMessage');
  const errEl = document.getElementById('inviteError');
  const okEl = document.getElementById('inviteOk');
  const sendBtn = document.getElementById('inviteSend');
  let meetingId = null;

  function show(el, text) { el.textContent = text || ''; el.hidden = !text; }
  const close = () => dlg.close();

  document.querySelectorAll('[data-invite]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = btn.dataset;
      meetingId = d.id;
      forEl.textContent = d.title + ' - meeting code ' + d.code;
      emails.value = '';
      subject.value = d.subject;
      message.value = d.message;
      show(errEl, ''); show(okEl, '');
      sendBtn.disabled = false;
      dlg.showModal();
      emails.focus();
    });
  });

  document.getElementById('inviteClose').addEventListener('click', close);
  document.getElementById('inviteCancel').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // click on backdrop

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    show(errEl, ''); show(okEl, '');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const res = await fetch('/meetings/' + meetingId + '/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: emails.value, subject: subject.value, message: message.value })
      });
      const data = await res.json().catch(() => ({}));

      if (data.sent && data.sent.length) {
        let msg = 'Invitation sent to ' + data.sent.join(', ') + '.';
        if (data.mailConfigured === false) msg = 'SMTP is not configured, so nothing was emailed. The mail was printed in the server console. ' + msg;
        show(okEl, msg);
        emails.value = (data.failed || []).join(', ');
      }
      if (!res.ok || (data.failed && data.failed.length)) {
        show(errEl, data.error || 'Could not send to: ' + data.failed.join(', ') + '. Check the address or the SMTP settings.');
      }
    } catch (err) {
      show(errEl, 'Network error. Please try again.');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send invitation';
    }
  });
})();
