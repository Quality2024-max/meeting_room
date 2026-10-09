import "dotenv/config";
import nodemailer from "nodemailer";

// SMTP settings come from .env. If SMTP_HOST is empty the mail is NOT sent;
// it is only printed in the server console (handy while developing).
const smtpReady = Boolean(process.env.SMTP_HOST);

// Create a nodemailer transporter based on the SMTP configuration. If SMTP is not configured, use a JSON transport for logging.
const transporter = smtpReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true", // true only for port 465
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

// Check if the mailer is ready to send emails
export const isMailConfigured = smtpReady;

// Send an email using the configured transporter. If SMTP is not configured, the email will be printed in the server console instead of being sent.
export async function sendMail({ to, subject, text, html, replyTo }) {
  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "MeetRoom <no-reply@localhost>";
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    replyTo,
  });
  if (!smtpReady)
    console.log("[mail not sent - SMTP not configured]\n", info.message);
  return info;
}
