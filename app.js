const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "borrow-secret",
    resave: false,
    saveUninitialized: false,
  }),
);

// Static Files
app.use("/static", express.static(path.join(__dirname, "public")));

/* ================= ROUTES ================= */
// เรียกใช้ไฟล์ที่เราแยกไว้
const authRoutes = require("./routes/auth");
const mainRoutes = require("./routes/main");

// ใช้งาน Routes
app.use("/", authRoutes); // ถ้า URL เป็น /login, /register จะวิ่งไป auth.js
app.use("/", mainRoutes); // ถ้า URL เป็น /dashboard, /api จะวิ่งไป main.js

/* ================= SERVER START ================= */
const PORT = 5050;
app.listen(PORT, () => {
  console.log(`🚀 SERVER RUN http://127.0.0.1:${PORT}`);
});
