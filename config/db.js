const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "",
  database: "borrow_system",
  port: 3307,
  multipleStatements: true,
});

db.connect((err) => {
  if (err) {
    console.error("❌ DB ERROR:", err.message);
  } else {
    console.log("✅ DB CONNECTED");
  }
});

module.exports = db;
