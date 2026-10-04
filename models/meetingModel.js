import db from '../config/db.js';

const Meeting = {
    async findByHost(hostId){
        const [rows] = await db.query(
            "SELECT * FROM meetings WHERE host_id = ? ORDER BY scheduled_at DESC",
            [hostId]
        );
        return rows;
    }
}

export default Meeting;