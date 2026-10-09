import db from "../config/db.js";
// Recording model for interacting with the recordings table in the database
const Recording = {
  // Get all recordings for a host (via their meetings)
  async findByHost(hostId) {
    const [rows] = await db.query(
      `SELECT r.* FROM recordings r JOIN meetings m ON m.id = r.meeting_id
       WHERE m.host_id = ? ORDER BY r.id DESC`,
      [hostId],
    );
    return rows;
  },

  // Get all recordings for a meeting (only if the host owns the meeting)
  async fileNamesByMeeting(meetingId, hostId) {
    const [rows] = await db.query(
      `SELECT r.file_name FROM recordings r JOIN meetings m ON m.id = r.meeting_id
       WHERE m.id = ? AND m.host_id = ?`,
      [meetingId, hostId],
    );
    return rows.map((r) => r.file_name);
  },

  async findOwned(id, userId) {
    const [rows] = await db.query(
      `SELECT r.*, m.title FROM recordings r JOIN meetings m ON m.id = r.meeting_id
       WHERE r.id = ? AND m.host_id = ?`,
      [id, userId],
    );
    return rows[0] || null;
  },

  async create({ meetingId, fileName, mime, sizeBytes, durationSec }) {
    const [result] = await db.query(
      "INSERT INTO recordings (meeting_id, file_name, mime, size_bytes, duration_sec) VALUES (?, ?, ?, ?, ?)",
      [meetingId, fileName, mime, sizeBytes, durationSec],
    );
    return result.insertId;
  },

  async remove(id) {
    await db.query("DELETE FROM recordings WHERE id = ?", [id]);
  },
};

export default Recording;
