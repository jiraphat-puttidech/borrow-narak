const mysql = require('mysql2');

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 4000,
  // ✅ เพิ่มบรรทัดนี้ลงไปครับ
  multipleStatements: true, 
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