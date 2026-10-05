import db from "../config/db.js";

const ChatMessage = {
  async listByMeeting(meetingId, limit = 100) {
    const [rows] = await db.query(
      `SELECT c.message, c.created_at, u.name FROM chat_messages c
      JOIN users u ON u.id = c.user_id WHERE c.meeting_id = ? ORDER BY c.id ASC LIMIT ?`,
      [meetingId, limit],
    );
    return rows;
  },
};

export default ChatMessage;
