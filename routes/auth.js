const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs"); // ✅ เพิ่ม fs เพื่อใช้เช็คและสร้างโฟลเดอร์อัตโนมัติ
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const multer = require("multer");

// ==========================================
// 🛠️ Config การอัปโหลดรูปภาพ (Multer) แบบปลอดภัย
// ==========================================

// 1. กำหนด path โฟลเดอร์ที่จะเก็บไฟล์
const uploadDir = path.join(__dirname, "../public/uploads");

// 2. เช็คว่ามีโฟลเดอร์ไหม? ถ้าไม่มีให้สร้างใหม่เลย (ป้องกัน Error หาโฟลเดอร์ไม่เจอ)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // ส่งไฟล์ไปที่โฟลเดอร์ที่เราเช็คแล้วเมื่อกี้
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // ตั้งชื่อไฟล์กันซ้ำ: emp-เวลา-เลขสุ่ม.นามสกุล
    const uniqueSuffix = Date.now() + Math.round(Math.random() * 1e9);
    cb(null, "emp-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// ==========================================
// 1. หน้า Login (GET)
// ==========================================
router.get("/", (req, res) => {
  if (req.session.login) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "../public", "login.html"));
});

// ==========================================
// 2. ฟังก์ชัน Login (POST)
// ==========================================
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  // เพิ่มการ JOIN เพื่อดึงชื่อสำนักและฝ่ายมาเก็บไว้ใน Session ด้วย (เผื่อใช้โชว์)
  const sql = `
      SELECT E.*, I.InstitutionName, D.DepartmentName 
      FROM TB_T_Employee E
      LEFT JOIN TB_M_Institution I ON E.InstitutionID = I.InstitutionID
      LEFT JOIN TB_M_Department D ON E.DepartmentID = D.DepartmentID
      WHERE E.username = ?
  `;

  db.query(sql, [username], (err, rows) => {
    if (err) {
      console.error("Login DB Error:", err);
      return res.redirect("/?error=Database Error");
    }
    if (rows.length === 0) return res.redirect("/?error=ไม่พบชื่อผู้ใช้งาน");

    const user = rows[0];
    // เช็ค Password
    if (bcrypt.compareSync(password, user.password)) {
      // ✅ Login สำเร็จ: สร้าง Session
      req.session.login = true;
      req.session.userID = user.EMPID;
      req.session.username = user.username;

      // เก็บข้อมูลลง Session (เพิ่มชื่อสำนัก/ฝ่าย ให้เอาไปใช้ง่ายๆ)
      req.session.user = {
        fullname: `${user.fname} ${user.lname}`,
        role: user.RoleID, // ✅ สำคัญ: เก็บ RoleID ไว้เช็คสิทธิ์
        emp_num: user.EMP_NUM,
        image: user.image,
        institution: user.InstitutionName,
        department: user.DepartmentName,
      };

      // อัปเดตสถานะ Online (2)
      db.query("UPDATE TB_T_Employee SET EMPStatusID = 2 WHERE EMPID = ?", [
        user.EMPID,
      ]);

      // ===============================================
      // 🚦 จุดแยกทาง (Router Logic)
      // ===============================================
      if (user.RoleID === 2) {
        // ถ้าเป็น Admin (RoleID = 2) ให้ไปหน้า Admin
        console.log(`👑 Admin Login: ${user.username}`);
        return res.redirect("/admin");
      } else {
        // ถ้าเป็น User ทั่วไป ให้ไปหน้า Dashboard
        console.log(`👤 User Login: ${user.username}`);
        return res.redirect("/dashboard");
      }
    } else {
      return res.redirect("/?error=รหัสผ่านไม่ถูกต้อง");
    }
  });
});

// ==========================================
// 3. หน้า Register (GET)
// ==========================================
router.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "register.html"));
});

// ==========================================
// 4. ฟังก์ชัน Register (POST) - บันทึกข้อมูล
// ==========================================
router.post("/register", upload.single("image"), (req, res) => {
  // 1. รับค่าจากฟอร์ม
  const {
    emp_num,
    fname,
    lname,
    institution_id,
    department_id,
    role_id,
    email,
    phone,
    username,
    password,
  } = req.body;

  // 2. รับชื่อไฟล์รูป (ถ้าไม่ได้อัปโหลดมา ให้เป็น null)
  const imageFilename = req.file ? req.file.filename : null;

  // 3. Validation ข้อมูลสำคัญ
  if (!username || !password || !emp_num || !fname) {
    return res.redirect("/register?error=กรุณากรอกข้อมูลสำคัญให้ครบ");
  }

  // 4. เข้ารหัสรหัสผ่าน
  const hashPassword = bcrypt.hashSync(password, 10);

  // 5. เตรียม SQL Insert
  // ⚠️ ต้องแน่ใจว่าใน Database มีคอลัมน์ CreateBy แล้วนะครับ
  const sql = `
        INSERT INTO TB_T_Employee 
        (
            EMP_NUM, fname, lname, 
            InstitutionID, DepartmentID, RoleID,
            email, phone, 
            username, password, 
            image, 
            EMPStatusID, CreateDate, CreateBy
        ) 
        VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), 'System')
    `;

  // 6. ค่าที่จะใส่ (เรียงตามลำดับ SQL ข้างบน)
  const values = [
    emp_num,
    fname,
    lname,
    institution_id,
    department_id,
    role_id,
    email,
    phone,
    username,
    hashPassword,
    imageFilename,
  ];

  // 7. รันคำสั่ง SQL
  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Register SQL Error:", err); // ปริ้น Error ออกมาดูถ้ามีปัญหา

      if (err.code === "ER_DUP_ENTRY") {
        return res.redirect(
          "/register?error=รหัสพนักงานหรือชื่อผู้ใช้นี้มีในระบบแล้ว",
        );
      }

      // ส่งข้อความ Error กลับไปหน้าเว็บด้วย จะได้รู้ว่าผิดตรงไหน
      return res.redirect("/register?error=บันทึกไม่ผ่าน: " + err.sqlMessage);
    }

    console.log(`✅ สมัครสมาชิกสำเร็จ: ${username} (EMP_NUM: ${emp_num})`);
    res.redirect("/?success=สมัครสมาชิกเรียบร้อย กรุณาเข้าสู่ระบบ");
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

// ==========================================
// 5. Logout
// ==========================================
router.get("/logout", (req, res) => {
  if (req.session.userID) {
    // ปรับสถานะเป็น Offline (1)
    db.query("UPDATE TB_T_Employee SET EMPStatusID = 1 WHERE EMPID = ?", [
      req.session.userID,
    ]);
  }
  // ล้าง Session และกลับหน้าแรก
  req.session.destroy(() => res.redirect("/"));
});

module.exports = router;
