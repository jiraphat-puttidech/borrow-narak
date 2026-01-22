const express = require("express");
const session = require("express-session");
const path = require("path");
const db = require("./db"); // เรียกใช้ไฟล์ db.js ที่แยกออกไป

const bcrypt = require("bcryptjs");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "borrow-secret",
    resave: false,
    saveUninitialized: false,
  }),
);

/* ❗ static file (เหมือนเดิมตามโค้ดคุณ) */
app.use("/static", express.static(path.join(__dirname, "public")));

/* ===== LOGIN PROCESS ===== */
/* 1. LOGIN PAGE */
app.get("/", (req, res) => {
  if (req.session.login) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
/* ===== LOGIN PROCESS ===== */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = "SELECT * FROM TB_T_Employee WHERE username = ?";

  db.query(sql, [username], (err, rows) => {
    if (err) return res.send("❌ DB ERROR");

    if (rows.length === 0) {
      return res.redirect("/?error=ไม่พบชื่อผู้ใช้งาน");
    }

    const user = rows[0];

    // ตรวจสอบรหัสผ่าน
    if (bcrypt.compareSync(password, user.password)) {
      req.session.login = true;

      // ✅ แก้ตรงนี้: ต้องบันทึก EMPID ลงไปใน session ด้วย
      req.session.user = {
        empid: user.EMPID, // สำคัญมาก! ต้องมีบรรทัดนี้ Logout ถึงจะทำงาน
        fullname: `${user.fname} ${user.lname}`,
        role: user.RoleID,
      };

      // อัปเดตสถานะเป็น Online (2)
      db.query("UPDATE TB_T_Employee SET EMPStatusID = 2 WHERE EMPID = ?", [
        user.EMPID,
      ]);

      return res.redirect("/dashboard");
    } else {
      return res.redirect("/?error=รหัสผ่านไม่ถูกต้อง");
    }
  });
});
/* เพิ่มส่วนนี้เข้าไปครับ */
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});
/* ===== REGISTER PROCESS ===== */
app.post("/register", (req, res) => {
  // ... (รับค่าตัวแปร) ...
  const hash = bcrypt.hashSync(password, 10);
  const sql = `...`; // (SQL Insert เดิม)

  db.query(
    sql,
    [
      /* ... */
    ],
    (err) => {
      if (err) {
        console.error(err);
        // ❌ กรณีสมัครไม่ผ่าน (เช่น username ซ้ำ): ส่งกลับไปหน้า Register พร้อม error
        return res.redirect(
          "/register?error=สมัครไม่สำเร็จ ชื่อผู้ใช้หรือรหัสพนักงานอาจซ้ำ",
        );
      }
      // สมัครสำเร็จ ให้ไปหน้า Login พร้อมข้อความ success
      res.redirect("/?success=สมัครสมาชิกเรียบร้อย กรุณาเข้าสู่ระบบ");
    },
  );
});

/* 3. FORGOT PASSWORD */
app.get("/forgot", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "forgot.html"));
});

app.post("/reset-password", (req, res) => {
  // ใช้ Username และ Email ในการยืนยันตัวตน
  const { username, email, new_password } = req.body;

  const checkSql =
    "SELECT * FROM TB_T_Employee WHERE username = ? AND email = ?";

  db.query(checkSql, [username, email], (err, rows) => {
    if (err) return res.send("❌ DB ERROR");
    if (rows.length === 0)
      return res.send(
        "❌ ข้อมูลไม่ถูกต้อง (ชื่อผู้ใช้หรืออีเมลผิด) <a href='/forgot'>กลับ</a>",
      );

    // ถ้าข้อมูลถูก ให้เปลี่ยนรหัสผ่าน
    const hash = bcrypt.hashSync(new_password, 10);
    const updateSql =
      "UPDATE TB_T_Employee SET password = ? WHERE username = ?";

    db.query(updateSql, [hash, username], () => {
      res.send(
        "<script>alert('✅ เปลี่ยนรหัสผ่านเรียบร้อย'); window.location='/';</script>",
      );
    });
  });
});

/* 4. DASHBOARD */
app.get("/dashboard", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  // อย่าลืม! ในโฟลเดอร์ public ต้องมีไฟล์ dashboard.html
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* API ส่งชื่อไปแสดงหน้าเว็บ */
app.get("/api/user", (req, res) => {
  if (req.session.login) {
    res.json({
      loggedIn: true,
      fullname: req.session.user.fullname,
      role: req.session.user.role,
    });
  } else {
    res.json({ loggedIn: false });
  }
});

/* LOGOUT */
app.get("/logout", (req, res) => {
  if (req.session.user) {
    // เปลี่ยนสถานะเป็น Offline (1)
    db.query("UPDATE TB_T_Employee SET EMPStatusID = 1 WHERE EMPID = ?", [
      req.session.user.empid,
    ]);
  }
  req.session.destroy(() => res.redirect("/"));
});

/* SERVER START */
const PORT = 5050;
app.listen(PORT, () => {
  console.log(`🚀 SERVER RUN http://127.0.0.1:${PORT}`);
});
