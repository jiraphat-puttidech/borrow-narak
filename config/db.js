const mysql = require('mysql2');

const db = mysql.createConnection({
  // เปลี่ยนจาก '127.0.0.1' เป็น process.env.DB_HOST
  host: process.env.DB_HOST, 
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 4000, // TiDB ใช้พอร์ต 4000
  
  // ⚠️ สำคัญมาก: ต้องมีก้อน SSL นี้เพื่อให้ต่อ TiDB Cloud ผ่าน
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  }
});

db.connect((err) => {
  if (err) {
    console.error('❌ DB ERROR:', err.message);
  } else {
    console.log('✅ DATABASE CONNECTED (TiDB Cloud)');
  }
});

module.exports = db;
