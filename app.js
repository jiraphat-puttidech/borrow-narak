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
  // ✅ 1. ต้องเพิ่มบรรทัดนี้ครับ! (เพื่อดึงค่า password มาจากฟอร์ม)
  const { emp_num, username, password, fname, lname, email, phone } = req.body;

  // ป้องกันกรณี password เป็นค่าว่าง (Optional)
  if (!password) {
    return res.redirect("/register?error=กรุณากรอกรหัสผ่าน");
  }

  // 2. เข้ารหัสรหัสผ่าน (บรรทัดนี้แหละที่แจ้ง error ก่อนหน้านี้)
  const hash = bcrypt.hashSync(password, 10);

  // 3. SQL บันทึกข้อมูล
  const sql = `
    INSERT INTO TB_T_Employee 
    (EMP_NUM, username, password, fname, lname, email, phone, RoleID, InstitutionID, DepartmentID, EMPStatusID) 
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1)
  `;

  db.query(
    sql,
    [emp_num, username, hash, fname, lname, email, phone],
    (err) => {
      if (err) {
        console.error(err);
        return res.redirect(
          "/register?error=สมัครไม่สำเร็จ รหัสพนักงานหรือ Username อาจซ้ำ",
        );
      }
      res.redirect("/?success=สมัครสมาชิกเรียบร้อย กรุณาเข้าสู่ระบบ");
    },
  );
});

/* 3. FORGOT PASSWORD */
app.get("/forgot", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "forgot.html"));
});

/* RESET PASSWORD PROCESS */
app.post("/reset-password", (req, res) => {
  const { username, email, new_password } = req.body;

  // เช็คว่ามี Username และ Email นี้คู่กันหรือไม่
  const checkSql =
    "SELECT * FROM TB_T_Employee WHERE username = ? AND email = ?";

  db.query(checkSql, [username, email], (err, rows) => {
    if (err) {
      console.error(err);
      return res.redirect("/forgot?error=เกิดข้อผิดพลาดจากฐานข้อมูล");
    }

    // ❌ จุดสำคัญ: ถ้าหาไม่เจอ (rows.length เป็น 0)
    if (rows.length === 0) {
      // ส่งกลับไปหน้า forgot พร้อมข้อความแจ้งเตือน
      return res.redirect(
        "/forgot?error=ข้อมูลไม่ถูกต้อง! ตรวจสอบ Username หรือ Email อีกครั้ง",
      );
    }

    // ✅ ถ้าเจอข้อมูลถูกต้อง -> ทำการเปลี่ยนรหัส
    const hash = bcrypt.hashSync(new_password, 10);
    const updateSql =
      "UPDATE TB_T_Employee SET password = ? WHERE username = ?";

    db.query(updateSql, [hash, username], (err) => {
      if (err) {
        return res.redirect("/forgot?error=อัปเดตรหัสผ่านไม่สำเร็จ");
      }

      // สำเร็จ! ส่งกลับไปหน้า Login
      res.redirect(
        "/?success=เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบใหม่",
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
