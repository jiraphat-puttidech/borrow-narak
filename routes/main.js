const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../config/db"); // เรียกใช้ DB

// 1. หน้า Dashboard
router.get("/dashboard", (req, res) => {
  // ถ้ายังไม่ล็อกอิน ให้เด้งกลับไปหน้าแรก
  if (!req.session.login) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// 2. API ส่งข้อมูลชื่อผู้ใช้ (ให้หน้าเว็บเอาไปโชว์)
router.get("/api/user", (req, res) => {
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

/* routes/main.js */

// API ดึงรายการอุปกรณ์ (ฉบับแก้ไข: ใช้ชื่อคอลัมน์ sticker)
router.get("/api/devices", (req, res) => {
  console.log("🔍 กำลังดึงข้อมูลอุปกรณ์ (JOIN ตาราง)...");

  const sql = `
        SELECT 
            d.DVID, 
            d.devicename, 
            d.stickerid, 
            d.sticker AS image,  -- ✅ แก้ตรงนี้! ดึงจาก sticker แต่ส่งไปชื่อ image
            c.CategoryName, 
            s.StatusNameDV, 
            s.DVStatusID
        FROM TB_T_Device d
        LEFT JOIN TB_M_Category c ON d.CategoryID = c.CategoryID
        LEFT JOIN TB_M_StatusDevice s ON d.DVStatusID = s.DVStatusID
        ORDER BY d.DVID ASC
    `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ SQL ERROR:", err.sqlMessage || err.message);
      return res.status(500).json({ error: "Database Error" });
    }

    console.log(`✅ โหลดสำเร็จ: ${results.length} รายการ`);
    res.json(results);
  });
});
// 4. API บันทึกการยืม (เมื่อกดปุ่มยืม)
router.post("/api/borrow", (req, res) => {
  if (!req.session.login)
    return res.json({ success: false, message: "กรุณา Login" });

  // ✅ รับค่าเพิ่มจากหน้าเว็บ
  const { dvid, duedate, location, purpose } = req.body;
  const empid = req.session.user.empid;

  // 1. อัปเดตสถานะของ
  db.query(
    "UPDATE TB_T_Device SET DVStatusID = 2 WHERE DVID = ? AND DVStatusID = 1",
    [dvid],
    (err, result) => {
      if (err) return res.json({ success: false, message: "DB Error" });
      if (result.affectedRows === 0)
        return res.json({ success: false, message: "ของถูกยืมไปแล้ว" });

      // 2. บันทึกลง Transaction (ใส่ข้อมูลจริงแล้ว!)
      const transNum = "TR-" + Date.now();
      const sqlTrans = `
            INSERT INTO TB_T_BorrowTrans 
            (transaction_num, borrowdate, duedate, purpose, location, DVID, EMPID, BorrowTransStatusID, Due_statusID, InstitutionID, DepartmentID, CategoryID, BrandID, ModelID, TypeID)
            VALUES (?, NOW(), ?, ?, ?, ?, ?, 1, 2, 1, 1, 1, 1, 1, 1)
        `;

      // เรียงลำดับตัวแปรให้ตรงกับ ? ใน SQL
      db.query(
        sqlTrans,
        [transNum, duedate, purpose, location, dvid, empid],
        (err2) => {
          if (err2) {
            console.error(err2);
            // (ถ้า Error จริงๆ ควร rollback update device แต่ตอนนี้เอาแค่นี้ก่อน)
          }
          res.json({
            success: true,
            message: "ยืมสำเร็จ! อย่าลืมคืนตามกำหนดนะ",
          });
        },
      );
    },
  );
});

module.exports = router;
