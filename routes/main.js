const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../config/db");

// ✅ 1. เพิ่ม Library สำหรับการอัปโหลดและเข้ารหัส (จำเป็นสำหรับแก้ไขโปรไฟล์)
const multer = require("multer");
const bcrypt = require("bcryptjs");
const fs = require("fs");

// ✅ 2. ตั้งค่าการอัปโหลดรูปภาพ (Multer)
const uploadDir = path.join(__dirname, "../public/uploads");
// เช็คว่ามีโฟลเดอร์ไหม ถ้าไม่มีให้สร้าง
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // ตั้งชื่อไฟล์กันซ้ำ: emp-เวลา-เลขสุ่ม.นามสกุล
    const uniqueSuffix = Date.now() + Math.round(Math.random() * 1e9);
    cb(null, "emp-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// ===================================================
// 🛠️ ฟังก์ชันช่วยเหลือ: บันทึก Log อัตโนมัติ
// ===================================================
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

  // เพิ่มดึง User ล่าสุดเพื่อให้หน้า Dashboard แสดงผลถูกต้อง
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
        recentUsers: results[5], // ส่งรายชื่อสมาชิกใหม่ไปด้วย
      });
    },
  );
});

router.get("/api/devices", (req, res) => {
  const sql = `
        SELECT d.DVID, d.devicename, d.stickerid, d.sticker AS image, d.DVStatusID, s.StatusNameDV
        FROM TB_T_Device d
        LEFT JOIN TB_M_StatusDevice s ON d.DVStatusID = s.DVStatusID
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
                BorrowTransStatusID, Due_statusID,
                EMP_NUM, phone, InstitutionID, DepartmentID,
                CategoryID, TypeID, ModelID, BrandID, notes_emp, notes_admin
            )
            VALUES 
            (?, NOW(), ?, ?, NOW(), ?, ?, ?, 1, 5, ?, ?, ?, ?, ?, ?, ?, ?, '-', '-')
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

                    // ✅ บันทึก Log ฝั่ง User (ยืมอุปกรณ์)
                    saveLog(
                      empid,
                      "BORROW_REQUEST",
                      `ยื่นคำขอยืมอุปกรณ์ ${device.devicename} (รหัส: ${device.stickerid})`,
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
            d.devicename, d.stickerid, d.sticker AS image, d.serialnumber,
            b.BrandName, 
            m.ModelName
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

// ✅ API สำหรับกด "รับทราบ" ผลการไม่อนุมัติ (เพื่อให้รายการหายไปจากหน้า Active)
router.post("/api/acknowledge", (req, res) => {
  if (!req.session.login)
    return res.status(401).json({ error: "Unauthorized" });
  const { tstid } = req.body;
  // อัปเดต returndate เป็นปัจจุบัน เพื่อให้หลุดจากเงื่อนไข returndate IS NULL
  const sql = `UPDATE TB_T_BorrowTrans SET returndate = NOW() WHERE TSTID = ? AND Due_statusID = 6`;
  db.query(sql, [tstid], (err, result) => {
    if (err) return res.json({ success: false, message: err.message });

    // ✅ บันทึก Log ฝั่ง User (รับทราบผล)
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

// ✅ 3. API อัปเดตโปรไฟล์ (แบบปลอดภัย: เช็ครหัสเดิมก่อน)
router.post("/api/profile/update", upload.single("image"), (req, res) => {
  if (!req.session.login) {
    return res.json({ success: false, message: "Session หมดอายุ" });
  }

  const { fname, lname, email, phone, old_password, new_password } = req.body;
  const empid = req.session.userID;

  // ฟังก์ชันช่วยอัปเดตข้อมูล (ใช้ซ้ำได้)
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
      if (err) {
        console.error(err);
        return res.json({ success: false, message: "Database Error" });
      }
      // อัปเดต Session
      req.session.user.fullname = `${fname} ${lname}`;
      if (req.file) req.session.user.image = req.file.filename;

      // ✅ บันทึก Log ฝั่ง User (อัปเดตโปรไฟล์)
      let actionTxt = "แก้ไขข้อมูลส่วนตัว";
      if (passwordHash) actionTxt += " (เปลี่ยนรหัสผ่าน)";
      saveLog(empid, "UPDATE_PROFILE", actionTxt);

      res.json({ success: true });
    });
  };

  // --- เริ่มต้น Logic ---

  // กรณี: ต้องการเปลี่ยนรหัสผ่าน (User กรอกช่อง new_password มา)
  if (new_password && new_password.trim() !== "") {
    // 1. ต้องกรอกรหัสเดิมมาด้วย
    if (!old_password || old_password.trim() === "") {
      return res.json({ success: false, message: "กรุณากรอกรหัสผ่านเดิม" });
    }

    // 2. ดึงรหัสผ่านปัจจุบันจาก DB มาเทียบ
    db.query(
      "SELECT password FROM TB_T_Employee WHERE EMPID = ?",
      [empid],
      (err, users) => {
        if (err || users.length === 0)
          return res.json({ success: false, message: "User not found" });

        const currentUser = users[0];

        // 3. ใช้ bcrypt เช็คว่ารหัสเดิมถูกต้องไหม
        const isMatch = bcrypt.compareSync(old_password, currentUser.password);

        if (!isMatch) {
          return res.json({
            success: false,
            message: "รหัสผ่านเดิมไม่ถูกต้อง!",
          }); // ❌ ถ้ารหัสผิด ดีดกลับ
        }

        // 4. ถ้ารหัสเดิมถูก -> เข้ารหัสใหม่ แล้วบันทึก
        const newHash = bcrypt.hashSync(new_password, 10);
        executeUpdate(newHash);
      },
    );
  } else {
    // กรณี: ไม่เปลี่ยนรหัส (เปลี่ยนแค่ชื่อ/รูป) -> บันทึกเลย
    executeUpdate(null);
  }
});

module.exports = router;
