const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs"); // ✅ เพิ่ม fs เพื่อใช้เช็คและสร้างโฟลเดอร์อัตโนมัติ
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const multer = require("multer");
const axios = require("axios");
// ==========================================
// 🛠️ ฟังก์ชันช่วยเหลือ: บันทึก Log อัตโนมัติ
// ==========================================
const saveLog = (empid, actionType, actionDetail) => {
  // ถ้าไม่มี EMPID ให้ข้ามไป
  if (!empid) return;
  const sqlLog = `INSERT INTO TB_SystemLog (EMPID, ActionType, ActionDetail) VALUES (?, ?, ?)`;
  db.query(sqlLog, [empid, actionType, actionDetail], (err) => {
    if (err) console.error("❌ บันทึก Log ไม่สำเร็จ:", err);
  });
};

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
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const captchaResponse = req.body["g-recaptcha-response"];
  if (!captchaResponse) {
    return res.redirect("/?error=กรุณายืนยันว่าคุณไม่ใช่โปรแกรมอัตโนมัติ");
  }

  try {
    const secretKey = "6Lfl2p0sAAAAANt1x4qlfqCH3tQ7JfwRa6dCUFoR";
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaResponse}`;
    const response = await axios.post(verifyUrl);

    if (!response.data.success) {
      return res.redirect("/?error=การตรวจสอบ Captcha ไม่สำเร็จ");
    }
  } catch (error) {
    return res.redirect("/?error=ไม่สามารถติดต่อระบบความปลอดภัยได้");
  }

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

      // ✅ บันทึก Log การเข้าสู่ระบบ
      saveLog(user.EMPID, "LOGIN", "เข้าสู่ระบบสำเร็จ");

      // ===============================================
      // 🚦 จุดแยกทาง (Router Logic)
      // ===============================================
      if (user.RoleID === 2 || user.RoleID === 3) {
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
// ✅ เพิ่ม async ตรงนี้ เพื่อให้รอผลจาก Google ได้
router.post("/register", upload.single("image"), async (req, res) => {
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
    confirm_password,
  } = req.body;

  // ✅ รับค่า Token ของ Captcha ที่ส่งมาจากหน้าบ้าน
  const captchaResponse = req.body["g-recaptcha-response"];

  // 2. รับชื่อไฟล์รูป
  const imageFilename = req.file ? req.file.filename : null;

  // 3. Validation ข้อมูลสำคัญ
  if (!username || !password || !emp_num || !fname) {
    return res.redirect("/register?error=กรุณากรอกข้อมูลสำคัญให้ครบ");
  }

  // 3.1 เช็คว่ารหัสผ่านตรงกันไหม
  if (password !== confirm_password) {
    return res.redirect("/register?error=รหัสผ่านยืนยันไม่ถูกต้อง");
  }

  // ✅ 3.2 ด่านตรวจจับบอท (ตรวจสอบ Captcha)
  if (!captchaResponse) {
    return res.redirect(
      "/register?error=กรุณายืนยันว่าคุณไม่ใช่โปรแกรมอัตโนมัติ",
    );
  }

  try {
    const secretKey = "6Lfl2p0sAAAAANt1x4qlfqCH3tQ7JfwRa6dCUFoR";
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaResponse}`;

    const response = await axios.post(verifyUrl);

    if (!response.data.success) {
      return res.redirect("/register?error=การตรวจสอบ Captcha ไม่สำเร็จ");
    }
  } catch (error) {
    console.error("Captcha Error:", error);
    return res.redirect("/register?error=ไม่สามารถติดต่อระบบความปลอดภัยได้");
  }
  // ✅ จบด่านตรวจ ถ้าผ่านตรงนี้ไปได้แสดงว่าเป็นคนจริงๆ แน่นอน

  // 4. เข้ารหัสรหัสผ่าน
  const hashPassword = bcrypt.hashSync(password, 10);

  // 5. เตรียม SQL Insert
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

  // 6. ค่าที่จะใส่
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

  // 7. รันคำสั่ง SQL (พร้อมดัก Error 1062 ค่าซ้ำ)
  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Register SQL Error:", err);

      // ดัก Error ค่าซ้ำ (Duplicate Entry)
      if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
        if (err.sqlMessage.includes("username")) {
          return res.redirect(
            "/register?error=ชื่อผู้ใช้งาน (Username) นี้มีคนใช้แล้ว",
          );
        }
        if (err.sqlMessage.includes("EMP_NUM")) {
          return res.redirect("/register?error=รหัสพนักงานนี้มีในระบบแล้ว");
        }
        if (err.sqlMessage.includes("email")) {
          return res.redirect("/register?error=อีเมลนี้มีผู้ใช้งานแล้ว");
        }
        return res.redirect("/register?error=ข้อมูลซ้ำกับที่มีในระบบ");
      }

      // Error อื่นๆ
      return res.redirect("/register?error=บันทึกไม่ผ่าน: " + err.sqlMessage);
    }

    console.log(`✅ สมัครสมาชิกสำเร็จ: ${username} (EMP_NUM: ${emp_num})`);

    // บันทึก Log การสมัครสมาชิก
    saveLog(
      result.insertId,
      "REGISTER",
      `สมัครสมาชิกใหม่เข้าสู่ระบบ (Username: ${username})`,
    );

    res.redirect("/?success=สมัครสมาชิกเรียบร้อย กรุณาเข้าสู่ระบบ");
  });
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
        // ✅ บันทึก Log การรีเซ็ตรหัสผ่าน
        saveLog(
          rows[0].EMPID,
          "RESET_PASSWORD",
          "ทำการรีเซ็ตรหัสผ่านใหม่ผ่านหน้าลืมรหัสผ่าน",
        );

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

    // ✅ บันทึก Log การออกจากระบบ
    saveLog(req.session.userID, "LOGOUT", "ออกจากระบบ");
  }
  // ล้าง Session และกลับหน้าแรก
  req.session.destroy(() => res.redirect("/"));
});

router.get("/api/user", (req, res) => {
  if (req.session.login) {
    res.json({
      loggedIn: true,
      fullname: req.session.user.fullname, // ชื่อจริง
      image: req.session.user.image, // ✅ ต้องเพิ่มบรรทัดนี้ (ส่งชื่อรูปไปด้วย)
      role: req.session.user.role,
    });
  } else {
    res.json({ loggedIn: false });
  }
});

module.exports = router;
