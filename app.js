require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");

// ✅ 1. เพิ่ม Library สำหรับหุ่นยนต์ Cron Job และส่งอีเมล
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const db = require("./config/db");

// ✅ 2. เรียกใช้ไลบรารีป้องกัน XSS
const { xss } = require("express-xss-sanitizer");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ 3. เปิดใช้งานเครื่องมือทำความสะอาดข้อมูล (ป้องกันโค้ดอันตราย)
app.use(xss());

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
const adminRoutes = require("./routes/admin");

// ใช้งาน Routes
app.use("/", authRoutes); // ถ้า URL เป็น /login, /register จะวิ่งไป auth.js
app.use("/", mainRoutes); // ถ้า URL เป็น /dashboard, /api จะวิ่งไป main.js
app.use("/", adminRoutes); // ถ้า URL เป็น /admin จะวิ่งไป admin.js
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

/* ================= SERVER START ================= */
const PORT = 5050;
app.listen(PORT, () => {
  console.log(`🚀 SERVER RUN http://127.0.0.1:${PORT}`);
});

/* ========================================================= */
/* 🤖 CRON JOB (หุ่นยนต์แจ้งเตือนอัตโนมัติ ใกล้กำหนด/เกินกำหนด) */
/* ========================================================= */

// ✅ 4. ตั้งค่าอีเมลของคุณ
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // ✅ ดึงอีเมลจากไฟล์ .env
    pass: process.env.EMAIL_PASS, // ✅ ดึง App Password จากไฟล์ .env
  },
});

// ✅ 5. ตั้งเวลาทำงาน (30 8 * * * = ทำงานทุกวันเวลา 08:30 น.)
cron.schedule("30 8 * * *", () => {
  console.log("⏰ [Cron Job] เริ่มตรวจสอบอุปกรณ์ใกล้ถึงกำหนด/เกินกำหนด...");

  const sql = `
    SELECT t.TSTID, t.duedate, d.devicename, e.email, e.fname 
    FROM TB_T_BorrowTrans t
    JOIN TB_T_Device d ON t.DVID = d.DVID
    JOIN TB_T_Employee e ON t.EMPID = e.EMPID
    WHERE t.Due_statusID IN (2, 3) AND t.returndate IS NULL
  `;

  db.query(sql, (err, results) => {
    if (err) return console.error("Cron DB Error:", err);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    results.forEach((item) => {
      if (!item.email) return; // ถ้า User ไม่ได้ใส่อีเมลไว้ ให้ข้ามไป

      const dueDateObj = new Date(item.duedate);
      dueDateObj.setHours(0, 0, 0, 0);

      // คำนวณหาจำนวนวันที่เหลือ
      const daysDiff = Math.ceil(
        (dueDateObj.getTime() - today.getTime()) / (1000 * 3600 * 24),
      );

      if (daysDiff === 1) {
        // ⏳ กรณีที่ 1: ใกล้ครบกำหนด (เหลือ 1 วัน / พรุ่งนี้)
        transporter.sendMail({
          from: '"IT Borrow System" <jiraphat0puttidech@gmail.com>',
          to: item.email,
          subject: "⏳ แจ้งเตือน: อุปกรณ์ใกล้ครบกำหนดคืนพรุ่งนี้",
          html: `<p>สวัสดีคุณ ${item.fname},</p>
                 <p>ระบบขอแจ้งเตือนว่า อุปกรณ์ <b>${item.devicename}</b> ที่คุณยืมไป จะครบกำหนดคืนใน <b>วันพรุ่งนี้</b> นะครับ</p>
                 <p>กรุณาเตรียมนำส่งคืนที่แผนก IT ครับ</p>`,
        });
        console.log(`✉️ ส่งเมลเตือนใกล้ครบกำหนด -> ${item.email}`);
      } else if (daysDiff < 0) {
        // 🚨 กรณีที่ 2: เกินกำหนดแล้ว (ติดลบ)
        db.query(
          "UPDATE TB_T_BorrowTrans SET Due_statusID = 3 WHERE TSTID = ?",
          [item.TSTID],
        );
        transporter.sendMail({
          from: '"IT Borrow System" <jiraphat0puttidech@gmail.com>',
          to: item.email,
          subject: "🚨 แจ้งเตือนด่วน: อุปกรณ์เกินกำหนดคืน!",
          html: `<p>สวัสดีคุณ ${item.fname},</p>
                 <p style="color: red;">อุปกรณ์ <b>${item.devicename}</b> ของคุณ <b>เลยกำหนดคืนมาแล้ว ${Math.abs(daysDiff)} วัน</b></p>
                 <p>กรุณานำส่งคืนที่แผนก IT ทันทีครับ!</p>`,
        });
        console.log(`🚨 ส่งเมลเตือนเกินกำหนด -> ${item.email}`);
      }
    });
  });
});
