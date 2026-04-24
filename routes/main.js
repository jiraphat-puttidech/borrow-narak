require("dotenv").config(); // ✅ แปะไว้บรรทัดที่ 1 บนสุดเลยครับ

const express = require("express");
const session = require("express-session"); // (หรือตัวอื่นๆ ที่มีอยู่แล้ว)
const path = require("path");
// ... โค้ดเดิมของคุณ ...

const router = express.Router();
const db = require("../config/db");

const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // ✅ ดึงอีเมลจากไฟล์ .env
    pass: process.env.EMAIL_PASS, // ✅ ดึง App Password จากไฟล์ .env
  },
});

// 🔔 Helper: ฟังก์ชันส่งแจ้งเตือนหา "แอดมินทุกคน" เวลามีคนขอยืมของ
const sendNotiToAdmins = (message) => {
  db.query(
    "SELECT EMPID FROM TB_T_Employee WHERE RoleID IN (2,3)",
    (err, admins) => {
      if (!err && admins.length > 0) {
        const values = admins.map((admin) => [admin.EMPID, message]);
        db.query("INSERT INTO TB_Notification (EMPID, Message) VALUES ?", [
          values,
        ]);
      }
    },
  );
};

// 🔔 Helper: ฟังก์ชันส่งแจ้งเตือนหา User โดยตรง
const sendNotiToUser = (empid, message) => {
  if (!empid) return;
  db.query("INSERT INTO TB_Notification (EMPID, Message) VALUES (?, ?)", [
    empid,
    message,
  ]);
};

// ✅ 1. เพิ่ม Library สำหรับการอัปโหลดและเข้ารหัส
const multer = require("multer");
const bcrypt = require("bcryptjs");
const fs = require("fs");

// ✅ 2. ตั้งค่าการอัปโหลดรูปภาพ
const uploadDir = path.join(__dirname, "../public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + Math.round(Math.random() * 1e9);
    cb(null, "emp-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

const saveLog = (empid, actionType, actionDetail) => {
  if (!empid) return;
  const sqlLog = `INSERT INTO TB_SystemLog (EMPID, ActionType, ActionDetail) VALUES (?, ?, ?)`;
  db.query(sqlLog, [empid, actionType, actionDetail], (err) => {
    if (err) console.error("❌ บันทึก Log ไม่สำเร็จ:", err);
  });
};

/* ================= PAGE ROUTES ================= */
router.get("/dashboard", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});
router.get("/tracking", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "tracking.html"));
});
router.get("/profile", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "profile.html"));
});
router.get("/history", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "history.html"));
});
router.get("/product", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "product.html"));
});
router.get("/others", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "others.html"));
});

/* ================= API ROUTES ================= */
router.get("/api/user", (req, res) => {
  if (req.session.login) {
    res.json({
      loggedIn: true,
      fullname: req.session.user.fullname,
      role: req.session.user.role || 1,
      image: req.session.user.image,
    });
  } else {
    res.json({ loggedIn: false });
  }
});

router.get("/api/dashboard-stats", (req, res) => {
  if (!req.session.login) return res.json({});
  const q1 = "SELECT COUNT(*) AS count FROM TB_T_BorrowTrans";
  const q2 =
    "SELECT COUNT(*) AS count FROM TB_T_BorrowTrans WHERE returndate IS NULL";
  const q3 = "SELECT COUNT(*) AS count FROM TB_T_Employee";
  const q4 = "SELECT COUNT(*) AS count FROM TB_T_Device";
  const qUsers =
    "SELECT username, fname, lname, image, RoleID FROM TB_T_Employee ORDER BY CreateDate DESC LIMIT 5";
  const qRecent = `
        SELECT t.*, d.devicename, e.username, e.fname
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        JOIN TB_T_Employee e ON t.EMPID = e.EMPID
        ORDER BY t.transactiondate DESC LIMIT 5
    `;

  db.query(
    `${q1}; ${q2}; ${q3}; ${q4}; ${qRecent}; ${qUsers}`,
    (err, results) => {
      if (err) return res.json({});
      res.json({
        totalTrans: results[0][0].count,
        pendingReturn: results[1][0].count,
        totalMembers: results[2][0].count,
        totalDevices: results[3][0].count,
        recentTrans: results[4],
        recentUsers: results[5],
      });
    },
  );
});

router.get("/api/devices", (req, res) => {
  const sql = `
    SELECT 
        d.devicename,
        MAX(d.sticker) AS image,
        d.CategoryID,
        SUM(CASE WHEN d.DVStatusID = 1 THEN 1 ELSE 0 END) AS remain_qty,
        COUNT(d.DVID) AS total_qty,
        MIN(CASE WHEN d.DVStatusID = 1 THEN d.DVID ELSE NULL END) AS DVID
    FROM TB_T_Device d
    GROUP BY d.devicename, d.CategoryID
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

router.post("/api/borrow", (req, res) => {
  if (!req.session.login || !req.session.userID) {
    return res.status(401).json({ success: false, message: "Session หมดอายุ" });
  }

  const { dvid, duedate, location, purpose } = req.body;
  const empid = req.session.userID;

  db.query(
    "SELECT * FROM TB_T_Employee WHERE EMPID = ?",
    [empid],
    (err, users) => {
      if (err || users.length === 0)
        return res.json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
      const user = users[0];

      db.query(
        "SELECT * FROM TB_T_Device WHERE DVID = ?",
        [dvid],
        (err, devices) => {
          if (err || devices.length === 0)
            return res.json({ success: false, message: "ไม่พบข้อมูลอุปกรณ์" });
          const device = devices[0];

          const datePart = new Date()
            .toISOString()
            .slice(2, 10)
            .replace(/-/g, "");
          const transNum = `EBRS-${datePart}-${Date.now().toString().slice(-4)}`;

          const sqlInsert = `
            INSERT INTO TB_T_BorrowTrans 
            (
                transaction_num, transactiondate, DVID, EMPID, borrowdate, duedate, location, purpose, 
                BorrowTransStatusID, Due_statusID, EMP_NUM, phone, InstitutionID, DepartmentID, CategoryID, TypeID, ModelID, BrandID, notes_emp, notes_admin
            ) VALUES (?, NOW(), ?, ?, NOW(), ?, ?, ?, 1, 5, ?, ?, ?, ?, ?, ?, ?, ?, '-', '-')
        `;
          const sqlUpdateDevice = `UPDATE TB_T_Device SET DVStatusID = 2 WHERE DVID = ?`;

          db.beginTransaction((err) => {
            if (err)
              return res.json({ success: false, message: "Transaction Error" });
            db.query(
              sqlInsert,
              [
                transNum,
                dvid,
                empid,
                duedate,
                location,
                purpose,
                user.EMP_NUM,
                user.phone,
                user.InstitutionID,
                user.DepartmentID,
                device.CategoryID,
                device.TypeID,
                device.ModelID,
                device.BrandID,
              ],
              (err, result) => {
                if (err)
                  return db.rollback(() =>
                    res.json({
                      success: false,
                      message: "Insert Failed: " + err.message,
                    }),
                  );
                db.query(sqlUpdateDevice, [dvid], (err) => {
                  if (err)
                    return db.rollback(() =>
                      res.json({
                        success: false,
                        message: "Update Device Failed",
                      }),
                    );
                  db.commit((err) => {
                    if (err)
                      return db.rollback(() => res.json({ success: false }));
                    saveLog(
                      empid,
                      "BORROW_REQUEST",
                      `ยื่นคำขอยืมอุปกรณ์ ${device.devicename}`,
                    );

                    // ✅ 🔔 แจ้งเตือนกระดิ่ง (ทั้งแอดมิน และ User คนยืม)
                    sendNotiToAdmins(
                      `🔔 มีคำขอยืมใหม่: ${device.devicename} จากคุณ ${user.fname}`,
                    );
                    sendNotiToUser(
                      empid,
                      `⏳ ส่งคำขอยืมสำเร็จ: ${device.devicename} (รอแอดมินอนุมัติ)`,
                    );

                    // ✅ ✉️ ส่งอีเมลหา "แอดมินทุกคน" ว่ามีคำขอยืม
                    db.query(
                      "SELECT email FROM TB_T_Employee WHERE RoleID IN (2,3) AND email IS NOT NULL",
                      (err, admins) => {
                        if (!err && admins.length > 0) {
                          admins.forEach((admin) => {
                            transporter.sendMail({
                              from: '"IT Borrow System" <jiraphat0puttidech@gmail.com>',
                              to: admin.email,
                              subject: "🔔 แจ้งเตือน: มีคำขอยืมอุปกรณ์ใหม่",
                              html: `<p>สวัสดีแอดมิน,</p>
                                   <p>มีคำขอยืมอุปกรณ์ <b>${device.devicename}</b> เข้ามาในระบบ</p>
                                   <p><b>ผู้ยืม:</b> คุณ ${user.fname}</p>
                                   <p>กรุณาเข้าสู่ระบบเพื่อตรวจสอบและอนุมัติครับ</p>`,
                            });
                          });
                        }
                      },
                    );

                    res.json({
                      success: true,
                      message: "ส่งคำขอยืมเรียบร้อย!",
                    });
                  });
                });
              },
            );
          });
        },
      );
    },
  );
});

router.get("/api/my-active-borrow", (req, res) => {
  if (!req.session.login) return res.json([]);
  const sql = `
        SELECT 
            t.TSTID, t.DVID, t.borrowdate, t.duedate, t.Due_statusID, t.location, t.notes_admin,
            d.devicename, d.stickerid, d.sticker AS image, d.serialnumber, b.BrandName, m.ModelName
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        LEFT JOIN TB_M_Brand b ON d.BrandID = b.BrandID
        LEFT JOIN TB_M_Model m ON d.ModelID = m.ModelID
        WHERE t.EMPID = ? AND t.returndate IS NULL
        ORDER BY t.borrowdate DESC
    `;
  db.query(sql, [req.session.userID], (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

router.get("/api/my-history-all", (req, res) => {
  if (!req.session.login) return res.json([]);
  const sql = `
        SELECT t.TSTID, t.borrowdate, t.returndate, t.BorrowTransStatusID, t.Due_statusID,
               d.devicename, d.stickerid, d.sticker AS image
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        WHERE t.EMPID = ? 
        ORDER BY t.borrowdate DESC
    `;
  db.query(sql, [req.session.userID], (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

router.post("/api/acknowledge", (req, res) => {
  if (!req.session.login)
    return res.status(401).json({ error: "Unauthorized" });
  const { tstid } = req.body;
  const sql = `UPDATE TB_T_BorrowTrans SET returndate = NOW() WHERE TSTID = ? AND Due_statusID = 6`;
  db.query(sql, [tstid], (err, result) => {
    if (err) return res.json({ success: false, message: err.message });
    saveLog(
      req.session.userID,
      "ACKNOWLEDGE",
      `รับทราบผลการไม่อนุมัติ (รายการ: #${tstid})`,
    );
    res.json({ success: true });
  });
});

router.get("/api/my-profile", (req, res) => {
  if (!req.session.login)
    return res.status(401).json({ error: "Unauthorized" });
  const sql = `
          SELECT E.*, I.InstitutionName, D.DepartmentName 
          FROM TB_T_Employee E
          LEFT JOIN TB_M_Institution I ON E.InstitutionID = I.InstitutionID
          LEFT JOIN TB_M_Department D ON E.DepartmentID = D.DepartmentID
          WHERE E.EMPID = ?
      `;
  db.query(sql, [req.session.userID], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows[0]);
  });
});

router.post("/api/profile/update", upload.single("image"), (req, res) => {
  if (!req.session.login) {
    return res.json({ success: false, message: "Session หมดอายุ" });
  }

  const { fname, lname, email, phone, old_password, new_password } = req.body;
  const empid = req.session.userID;

  const executeUpdate = (passwordHash = null) => {
    let sql = "UPDATE TB_T_Employee SET fname=?, lname=?, email=?, phone=?";
    let params = [fname, lname, email, phone];

    if (req.file) {
      sql += ", image=?";
      params.push(req.file.filename);
    }
    if (passwordHash) {
      sql += ", password=?";
      params.push(passwordHash);
    }
    sql += " WHERE EMPID=?";
    params.push(empid);

    db.query(sql, params, (err, result) => {
      if (err) return res.json({ success: false, message: "Database Error" });
      req.session.user.fullname = `${fname} ${lname}`;
      if (req.file) req.session.user.image = req.file.filename;

      let actionTxt = "แก้ไขข้อมูลส่วนตัว";
      if (passwordHash) actionTxt += " (เปลี่ยนรหัสผ่าน)";
      saveLog(empid, "UPDATE_PROFILE", actionTxt);
      res.json({ success: true });
    });
  };

  if (new_password && new_password.trim() !== "") {
    if (!old_password || old_password.trim() === "")
      return res.json({ success: false, message: "กรุณากรอกรหัสผ่านเดิม" });
    db.query(
      "SELECT password FROM TB_T_Employee WHERE EMPID = ?",
      [empid],
      (err, users) => {
        if (err || users.length === 0)
          return res.json({ success: false, message: "User not found" });
        const currentUser = users[0];
        const isMatch = bcrypt.compareSync(old_password, currentUser.password);
        if (!isMatch)
          return res.json({
            success: false,
            message: "รหัสผ่านเดิมไม่ถูกต้อง!",
          });
        const newHash = bcrypt.hashSync(new_password, 10);
        executeUpdate(newHash);
      },
    );
  } else {
    executeUpdate(null);
  }
});

// ==========================================
// 🔔 API สำหรับระบบ Notification
// ==========================================

router.get("/api/notifications", (req, res) => {
  if (!req.session.login) return res.json([]);

  const sql =
    "SELECT * FROM TB_Notification WHERE EMPID = ? ORDER BY CreateDate DESC LIMIT 10";
  db.query(sql, [req.session.userID], (err, results) => {
    if (err) return res.json([]);
    res.json(results);
  });
});

router.post("/api/notifications/read", (req, res) => {
  if (!req.session.login) return res.json({ success: false });

  db.query(
    "UPDATE TB_Notification SET IsRead = 1 WHERE EMPID = ?",
    [req.session.userID],
    (err) => {
      if (err) return res.json({ success: false });
      res.json({ success: true });
    },
  );
});

module.exports = router;
