import "dotenv/config";
import nodemailer from "nodemailer";

// =========================================================
// SMTP CONFIGURATION
// =========================================================

// Check karo SMTP configured hai ya nahi
const smtpReady = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);

// =========================================================
// CREATE TRANSPORTER
// =========================================================

const transporter = smtpReady
  ? nodemailer.createTransport({
      // Gmail SMTP server
      host: process.env.SMTP_HOST,

      // SMTP port
      // Gmail ke liye normally 587
      port: Number(process.env.SMTP_PORT) || 587,

      // Port 587 ke liye false
      // Port 465 ke liye true
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",

      // Gmail login
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },

      // Connection timeout
      connectionTimeout: 15000,

      // Socket timeout
      socketTimeout: 15000,

      // Greeting timeout
      greetingTimeout: 15000,
    })
  : // SMTP configured nahi hai to development mode
    nodemailer.createTransport({
      jsonTransport: true,
    });

// =========================================================
// EXPORT STATUS
// =========================================================

export const isMailConfigured = smtpReady;

// =========================================================
// SMTP CONNECTION TEST
// =========================================================

if (smtpReady) {
  transporter.verify((error, success) => {
    if (error) {
      console.error("");
      console.error("======================================");
      console.error("        SMTP CONNECTION ERROR");
      console.error("======================================");

      console.error("Message:", error.message);
      console.error("Code:", error.code);
      console.error("Command:", error.command);
      console.error("Response:", error.response);

      console.error("======================================");
      console.error("");
    } else {
      console.log("");
      console.log("======================================");
      console.log("       SMTP CONNECTION SUCCESS");
      console.log("======================================");

      console.log(`SMTP Server: ${process.env.SMTP_HOST}`);

      console.log(`SMTP Port: ${process.env.SMTP_PORT}`);

      console.log(`SMTP User: ${process.env.SMTP_USER}`);

      console.log("======================================");
      console.log("");
    }
  });
} else {
  console.log("[MAIL] SMTP is not configured. Emails will not be sent.");
}

// =========================================================
// SEND EMAIL
// =========================================================

export async function sendMail({ to, subject, text, html, replyTo }) {
  // Sender email
  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "MeetRoom <no-reply@localhost>";

  try {
    // Email send karo
    const info = await transporter.sendMail({
      // Sender
      from,

      // Receiver
      to,

      // Subject
      subject,

      // Plain text email
      text,

      // HTML email
      html,

      // Optional reply-to
      replyTo,
    });

    // SMTP configured nahi hai
    if (!smtpReady) {
      console.log("[MAIL NOT SENT - SMTP NOT CONFIGURED]");

      console.log(info.message);
    }

    // Success information
    console.log("");
    console.log("======================================");
    console.log("             EMAIL SENT");
    console.log("======================================");

    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Message ID:", info.messageId);

    console.log("======================================");
    console.log("");

    return info;
  } catch (error) {
    // =====================================================
    // ACTUAL SMTP ERROR
    // =====================================================

    console.error("");
    console.error("======================================");
    console.error("             EMAIL FAILED");
    console.error("======================================");

    console.error("To:", to);
    console.error("Subject:", subject);

    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("Command:", error.command);
    console.error("Response:", error.response);
    console.error("Response Code:", error.responseCode);

    console.error("======================================");
    console.error("");

    // Error ko caller tak bhejo
    throw error;
  }
}
