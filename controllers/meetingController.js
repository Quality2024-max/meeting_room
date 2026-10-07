import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Meeting from "../models/meetingModel.js";
import Recording from "../models/recordingModel.js";
import ChatMessage from "../models/chatMessageModel.js";
import { fileURLToPath } from "node:url";
import { signGuestToken } from "../middlewares/authMiddleware.js";
import { sendMail, isMailConfigured } from "../services/mailService.js";
import { buildInvite } from "../services/inviteMail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REC_DIR = path.join(__dirname, "..", "recordings");

const newCode = () => crypto.randomBytes(4).toString("hex"); // 8 chars

export const getDashboard = async (req, res) => {
  const meetings = await Meeting.findByHost(req.user.id);
  const recs = await Recording.findByHost(req.user.id);

  // group recordings by meeting id
  const recordings = {};
  recs.forEach((r) => {
    (recordings[r.meeting_id] = recordings[r.meeting_id] || []).push(r);
  });

  res.render("meeting/dashboard", {
    meetings,
    recordings,
    joinError: req.query.error || null,
    baseUrl: appUrl(req),
  });
};

export const newForm = (req, res) => {
  res.render("meeting/new-meeting", { error: null });
};

export const create = async (req, res) => {
  const { title, type, candidate_name, scheduled_at, duration_min } = req.body;
  console.log(req.body);
  if (!title || !scheduled_at) {
    return res.render("meeting/new-meeting", {
      error: "Add a title and a start time",
    });
  }
  await Meeting.create({
    roomCode: newCode(),
    title: title.trim(),
    type: type === "interview" ? "interview" : "meeting",
    hostId: req.user.id,
    candidateName: candidate_name || null,
    scheduledAt: scheduled_at,
    durationMin: parseInt(duration_min, 10) || 30,
  });
  // console.log(Meeting);
  res.redirect("/dashboard");
};

export const join = (req, res) => {
  const code = (req.body.code || "").trim();
  if (!code) return res.redirect("/dashboard?error=Enter a room code.");
  res.redirect("/room/" + encodeURIComponent(code));
};

export const room = async (req, res) => {
  const code = req.params.code;
  const meeting = await Meeting.findByCode(code);

  const guestOk = !req.user && req.guest && req.guest.room === code;
  // Nobody identified yet: logged-out visitors go to the "enter your name" page
  if (!req.user && !guestOk) {
    return res.redirect("/join/" + encodeURIComponent(code));
  }

  if (!meeting) {
    if (req.user)
      return res.redirect(
        "/dashboard?error=No meeting found for that room code.",
      );
    return notAvailable(
      res,
      "Meeting not found', 'Please check the meeting code in your invitation.",
    );
  }
  if (meeting.status === "ended") {
    if (req.user)
      return res.redirect("/dashboard?error=That meeting has ended.");
    return notAvailable(
      res,
      "Meeting ended",
      "This meeting has already ended.",
    );
  }
  const history = await ChatMessage.listByMeeting(meeting.id, 100);
  res.render("meeting/room", {
    meeting,
    history,
    isHost: Boolean(req.user) && meeting.host_id === req.user.id,
    leaveUrl: req.user ? "/dashboard" : "/",
  });
};

// ---------- PUBLIC: candidate opens the invite link ----------
export const showGuestJoin = async (req, res) => {
  const code = req.params.code;
  if (req.user) return res.redirect("/room/" + encodeURIComponent(code)); // logged-in users skip the form

  const meeting = await Meeting.findByCode(code);
  if (!meeting)
    return notAvailable(
      res,
      "Meeting not found",
      "Please check the meeting code in your invitation.",
    );
  if (meeting.status === "ended")
    return notAvailable(
      res,
      "Meeting ended",
      "This meeting has already ended.",
    );

  res.render("meeting/guest-join", {
    meeting,
    error: null,
    name: req.guest && req.guest.room === code ? req.guest.name : "",
  });
};

export const guestJoin = async (req, res) => {
  const code = req.params.code;
  if (req.user)
    return notAvailable(
      res,
      "Meeting not found",
      "Please check the meeting code in your invitation.",
    );
  const meeting = await Meeting.findByCode(code);
  if (meeting.status === "ended")
    return notAvailable(
      res,
      "Meeting ended",
      "This meeting has already ended.",
    );

  const name = String(req.body.name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (name.length < 2) {
    return res.status(400).render("meeting/guest-join", {
      meeting,
      name,
      error: "Please enter your full name (at least 2 letters).",
    });
  }

  res.cookie("guest_token", signGuestToken({ name, room: meeting.room_code }), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.redirect("/room/" + encodeURIComponent(meeting.room_code));
};

// Joining by code from the logged-out home / invite email: /join-code form is dashboard only,
// so a guest who only has the code uses  /join/<code>.

// ---------- HOST: send invitation emails ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INVITES = 20;

export const invite = async (req, res) => {
  const meeting = await Meeting.findOwned(req.params.id, req.user.id);
  if (!meeting)
    return res.status(404).json({ ok: false, error: "Meeting not found." });
  if (meeting.status === "ended")
    return res
      .status(400)
      .json({ ok: false, error: "This meeting has ended." });

  const emails = [
    ...new Set(
      String(req.body.emails || "")
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const message = String(req.body.message || "")
    .trim()
    .slice(0, 3000);
  const subject =
    String(req.body.subject || "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 200) || `Invitation: ${meeting.title}`;

  if (!emails.length)
    return res
      .status(400)
      .json({ ok: false, error: "Add at least one candidate email." });
  if (emails.length > MAX_INVITES)
    return res.status(400).json({
      ok: false,
      error: `You can invite up to ${MAX_INVITES} people at a time.`,
    });
  if (!message)
    return res
      .status(400)
      .json({ ok: false, error: "The email message cannot be empty." });

  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length)
    return res
      .status(400)
      .json({ ok: false, error: "Invalid email: " + invalid.join(", ") });

  const joinUrl = `${appUrl(req)}/join/${encodeURIComponent(meeting.room_code)}`;
  const { text, html } = buildInvite({ meeting, message, joinUrl });

  // one mail per candidate, so nobody sees the other candidates' addresses
  const results = await Promise.allSettled(
    emails.map((to) => sendMail({ to, subject, text, html })),
  );

  const sent = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") sent.push(emails[i]);
    else {
      console.error(
        "Invite mail failed for",
        emails[i],
        r.reason && r.reason.message,
      );
      failed.push(emails[i]);
    }
  });

  res.json({
    ok: failed.length === 0,
    sent,
    failed,
    mailConfigured: isMailConfigured,
  });
};

const appUrl = () => {
  const fromEnv = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  return fromEnv || `${req.protocol}://${req.get("host")}`;
};

const notAvailable = (res, title, message) => {
  return res.status(404).render("errors/error", { title, code: 404, message });
};

export const end = async (req, res) => {
  await Meeting.end(req.params.id, req.user.id);
  res.redirect("/dashboard");
};

export const feedback = async (req, res) => {
  const rating =
    Math.min(5, Math.max(1, parseInt(req.body.rating, 10) || 0)) || null;

  await Meeting.saveFeedback(
    req.params.id,
    req.user.id,
    rating,
    req.body.feedback || null,
  );
  res.redirect("/dashboard");
};

export const remove = async (req, res) => {
  // remove the recording files too (the DB rows go away with the meeting)
  const files = await Recording.fileNamesByMeeting(req.params.id, req.user.id);
  files.forEach((f) =>
    fs.unlink(path.join(REC_DIR, path.basename(f)), () => {}),
  );
  await Meeting.remove(req.params.id, req.user.id);
  res.redirect("/dashboard");
};
