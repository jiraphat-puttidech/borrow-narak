// ไฟล์: routes/auth.js
const express = require("express");
const router = express.Router();
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("../config/db"); // ⚠️ เช็คว่ามีไฟล์ config/db.js ด้วยนะ

// --- LOGIN ---
router.get("/", (req, res) => {
  if (req.session.login) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(__dirname, "../public", "login.html"));
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT * FROM TB_T_Employee WHERE username = ?";

  db.query(sql, [username], (err, rows) => {
    if (err) return res.send("❌ DB ERROR");
    if (rows.length === 0) return res.redirect("/?error=ไม่พบชื่อผู้ใช้งาน");

    const user = rows[0];
    if (bcrypt.compareSync(password, user.password)) {
      req.session.login = true;
      req.session.user = {
        empid: user.EMPID,
        fullname: `${user.fname} ${user.lname}`,
        role: user.RoleID,
      };
      db.query("UPDATE TB_T_Employee SET EMPStatusID = 2 WHERE EMPID = ?", [
        user.EMPID,
      ]);
      return res.redirect("/dashboard");
    } else {
      return res.redirect("/?error=รหัสผ่านไม่ถูกต้อง");
    }
  });
});

// --- REGISTER ---
router.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "register.html"));
});

router.post("/register", (req, res) => {
  const { emp_num, username, password, fname, lname, email, phone } = req.body;
  if (!password) return res.redirect("/register?error=กรุณากรอกรหัสผ่าน");

  const hash = bcrypt.hashSync(password, 10);
  const sql = `INSERT INTO TB_T_Employee (EMP_NUM, username, password, fname, lname, email, phone, RoleID, InstitutionID, DepartmentID, EMPStatusID) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1)`;

  db.query(
    sql,
    [emp_num, username, hash, fname, lname, email, phone],
    (err) => {
      if (err) return res.redirect("/register?error=สมัครไม่สำเร็จ");
      res.redirect("/?success=สมัครสมาชิกเรียบร้อย");
    },
  );
});

// --- FORGOT ---
router.get("/forgot", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "forgot.html"));
});

router.post("/reset-password", (req, res) => {
  const { username, email, new_password } = req.body;
  const checkSql =
    "SELECT * FROM TB_T_Employee WHERE username = ? AND email = ?";
  db.query(checkSql, [username, email], (err, rows) => {
    if (err || rows.length === 0)
      return res.redirect("/forgot?error=ข้อมูลไม่ถูกต้อง");

    const hash = bcrypt.hashSync(new_password, 10);
    db.query(
      "UPDATE TB_T_Employee SET password = ? WHERE username = ?",
      [hash, username],
      () => {
        res.redirect("/?success=เปลี่ยนรหัสผ่านเรียบร้อย");
      },
    );
  });
});

// --- LOGOUT ---
router.get("/logout", (req, res) => {
  if (req.session.user) {
    db.query("UPDATE TB_T_Employee SET EMPStatusID = 1 WHERE EMPID = ?", [
      req.session.user.empid,
    ]);
  }
  req.session.destroy(() => res.redirect("/"));
});

module.exports = router;
