import db from '../config/db.js';

const User = {
    async findByEmail(email){
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    return rows[0] || null
    },

    async create({name, email, passwordHash}){
        const [result] = await db.query(
            "INSERT INTO users (name, email, password_hash) VALUES (?,?,?)", [name, email, passwordHash]
        );
        return result.insertId;
    }
};

export default User;