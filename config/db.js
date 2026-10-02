import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    port: process.env.DB_PORT,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true
});

// ================= DATABASE CONNECTION CHECK =================

try{
    const connection = await pool.getConnection();

    console.log("✅ Database connected successfully!");

    connection.release();
}catch(error){
    console.error("❌ Database connection failed!");
  console.error("Error Code:", error.code);
  console.error("Error Message:", error.message);
}

export default pool;