import db from "../config/db.js";
import { create } from "../controllers/meetingController.js";

const Meeting = {
  async findByHost(hostId) {
    const [rows] = await db.query(
      "SELECT * FROM meetings WHERE host_id = ? ORDER BY scheduled_at DESC",
      [hostId],
    );
    return rows;
  },

  async findByCode(code) {
    const [rows] = await db.query(
      "SELECT * FROM meetings WHERE room_code = ?",
      [code],
    );
    return rows[0] || null;
  },

  async create({
    roomCode,
    title,
    type,
    hostId,
    candidateName,
    scheduledAt,
    durationMin,
  }) {
    const [result] = await db.query(
      `INSERT INTO meetings (room_code, title, type, host_id, candidate_name, scheduled_at, duration_min)
            VALUES (?,?,?,?,?,?,?)`,
      [roomCode, title, type, hostId, candidateName, scheduledAt, durationMin],
    );
    return result.insertId;
  },

  async remove(id, hostId) {
    await db.query("DELETE FROM meetings WHERE id = ? AND host_id = ?", [
      id,
      hostId,
    ]);
  },
};

export default Meeting;
