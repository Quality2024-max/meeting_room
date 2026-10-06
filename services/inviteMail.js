// Builds the invitation email. The join link and the meeting code are ALWAYS added
// by us, even if the host edits or deletes parts of the message body.

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function buildInvite({ meeting, message, joinUrl }) {
  const when = String(meeting.scheduled_at).slice(0, 16).replace("T", " ");
  const details = [
    `Meeting code: ${meeting.room_code}`,
    `Join link: ${joinUrl}`,
    `When: ${when} (${meeting.duration_min} min)`,
  ];

  const text =
    `${message.trim()}\n\n` +
    `----------------------------------------\n` +
    `${details.join("\n")}\n` +
    `----------------------------------------\n` +
    `No account needed - open the link and enter your name to join.\n`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
    <div style="font-size:15px;line-height:1.6;">${esc(message.trim()).replace(/\r?\n/g, "<br>")}</div>
    <div style="margin:24px 0;padding:16px;background:#eef2ff;border-radius:10px;font-size:14px;line-height:1.8;">
      <div><strong>Meeting code:</strong> <span style="font-family:monospace;font-size:16px;letter-spacing:1px;">${esc(meeting.room_code)}</span></div>
      <div><strong>When:</strong> ${esc(when)} (${esc(meeting.duration_min)} min)</div>
    </div>
    <p style="text-align:center;margin:24px 0;">
      <a href="${esc(joinUrl)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block;">Join meeting</a>
    </p>
    <p style="font-size:13px;color:#64748b;line-height:1.6;">Button not working? Copy this link into your browser:<br>
      <a href="${esc(joinUrl)}" style="color:#4f46e5;">${esc(joinUrl)}</a></p>
    <p style="font-size:13px;color:#64748b;">No account needed - just enter your name when you open the link.</p>
  </div>
</body></html>`;

  return { text, html };
}
