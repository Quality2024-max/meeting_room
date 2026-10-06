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

  async findOwned(id, hostId) {
    const [rows] = await db.query(
      "SELECT * FROM meetings WHERE id = ? AND host_id  =?",
      [id, hostId],
    );
    return rows[0] || null;
  },

  async isOwnedBy(id, hostId) {
    const [rows] = await db.query(
      "SELECT id FROM meetings WHERE id = ? AND host_id ?",
      [id, hostId],
    );
    return rows.length > 0;
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
  async markLive(id) {
    await db.query("UPDATE meetings SET status = 'live' WHERE id = ?", [id]);
  },

  async end(id, hostId) {
    await db.query(
      "UPDATE meetings SET status = 'ended' WHERE id = ? AND host_id = ?",
      [id, hostId],
    );
  },

  async saveFeedback(id, hostId, rating, feedback) {
    await db.query(
      "UPDATE meetings SET rating = ?, feedback = ? WHERE id = ? AND host_id =?",
      [rating, feedback, id, hostId],
    );
  },

  async remove(id, hostId) {
    await db.query("DELETE FROM meetings WHERE id = ? AND host_id = ?", [
      id,
      hostId,
    ]);
  },
};

export default Meeting;
