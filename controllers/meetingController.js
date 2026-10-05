import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Meeting from "../models/meetingModel.js";
import Recording from "../models/recordingModel.js";
import ChatMessage from "../models/chatMessageModel.js";
import { fileURLToPath } from "node:url";

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
  console.log(Meeting);
  res.redirect("/dashboard");
};

export const join = (req, res) => {
  const code = (req.body.code || "").trim();
  if (!code) return res.redirect("/dashboard?error=Enter a room code.");
  res.redirect("/room/" + encodeURIComponent(code));
};

export const room = async (req, res) => {
  const meeting = await Meeting.findByCode(req.params.code);
  if (!meeting)
    return res.redirect(
      "/dashboard?error=No meeting found for that room code.",
    );
  if (meeting.status === "ended")
    return res.redirect("/dashboard?error=That meeting has ended.");

  const history = await ChatMessage.listByMeeting(meeting.id, 100);
  res.render("meeting/room", {
    meeting,
    history,
    isHost: meeting.host_id === req.user.id,
  });
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
