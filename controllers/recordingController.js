import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Meeting from "../models/meetingModel.js";
import Recording from "../models/recordingModel.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REC_DIR = path.join(__dirname, "..", "recordings");

const MAX_BYTES = (Number(process.env.MAX_RECORDING_MB) || 2048) * 1024 * 1024;

// Host's browser uploads the finished recording here (raw body, streamed straight to disk)
export async function upload(req, res) {
  if (!(await Meeting.isOwnedBy(req.params.id, req.user.id))) {
    req.resume();
    return res
      .status(403)
      .json({ error: "Only the host can save recordings." });
  }

  const ext = req.query.ext === "mp4" ? "mp4" : "webm";
  const mime = ext === "mp4" ? "video/mp4" : "video/webm";
  const duration = Math.max(0, parseInt(req.query.duration, 10) || 0);
  const fileName = crypto.randomBytes(12).toString("hex") + "." + ext;
  const filePath = path.join(REC_DIR, fileName);

  let size = 0;
  let failed = false;
  const out = fs.createWriteStream(filePath);

  const fail = (status, message) => {
    if (failed) return;
    failed = true;
    req.unpipe(out);
    out.destroy();
    fs.unlink(filePath, () => {});
    req.resume(); // drain what is still coming
    if (!res.headersSent) res.status(status).json({ error: message });
  };

  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES)
      fail(413, "Recording is too large for the server limit.");
  });
  req.on("error", () => fail(400, "Upload interrupted."));
  req.on("aborted", () => fail(400, "Upload interrupted."));
  out.on("error", () => fail(500, "Could not write the file."));

  out.on("finish", async () => {
    if (failed) return;
    if (!size) {
      fs.unlink(filePath, () => {});
      return res.status(400).json({ error: "The recording was empty." });
    }
    try {
      const id = await Recording.create({
        meetingId: req.params.id,
        fileName,
        mime,
        sizeBytes: size,
        durationSec: duration,
      });
      res.json({ ok: true, id });
    } catch (e) {
      console.error(e);
      fs.unlink(filePath, () => {});
      res
        .status(500)
        .json({ error: "Could not save the recording in the database." });
    }
  });

  req.pipe(out);
}

// Play in the browser, or download with ?download=1
export async function show(req, res) {
  const rec = await Recording.findOwned(req.params.id, req.user.id);
  if (!rec) return res.status(404).send("Recording not found");

  const file = path.join(REC_DIR, path.basename(rec.file_name));
  if (!fs.existsSync(file))
    return res.status(404).send("The recording file is missing on the server.");

  if (req.query.download) {
    const safe =
      rec.title
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "-") || "recording";
    return res.download(file, `${safe}-${rec.id}${path.extname(file)}`);
  }
  res.sendFile(file); // supports seeking (Range requests)
}

export async function remove(req, res) {
  const rec = await Recording.findOwned(req.params.id, req.user.id);
  if (rec) {
    fs.unlink(path.join(REC_DIR, path.basename(rec.file_name)), () => {});
    await Recording.remove(rec.id);
  }
  res.redirect("/dashboard");
}
