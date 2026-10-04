import db from '../config/db.js';

const Recording = {
  // All recordings of a host's meetings, newest first
  async findByHost(hostId) {
    const [rows] = await db.query(
      `SELECT r.* FROM recordings r JOIN meetings m ON m.id = r.meeting_id
       WHERE m.host_id = ? ORDER BY r.id DESC`,
      [hostId]
    );
    return rows;
  },

};

export default Recording;