/* routes/admin.js (ฉบับสมบูรณ์ พร้อมลุย!) */
const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../config/db");

// Middleware เช็คสิทธิ์ Admin
const checkAdmin = (req, res, next) => {
  if (req.session.login && req.session.user && req.session.user.role === 2) {
    next();
  } else {
    res.redirect("/");
  }
};

/* ================= PAGE ROUTES (เปลี่ยนหน้า) ================= */
router.get("/admin", checkAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin_index.html")),
);
router.get("/admin/approve", checkAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin_approve.html")),
);
router.get("/admin/device", checkAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin_device.html")),
);
router.get("/admin/history", checkAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin_history.html")),
);
router.get("/admin/others", checkAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin_others.html")),
);

/* ================= API ROUTES (หลังบ้าน) ================= */

// ✅ 1. (ใหม่) API ดึงข้อมูล Master Data สำหรับทำ Dropdown
router.get("/api/admin/master-data", checkAdmin, (req, res) => {
  const qBrand = "SELECT * FROM TB_M_Brand";
  const qModel = "SELECT * FROM TB_M_Model";
  const qCategory = "SELECT * FROM TB_M_Category";
  const qType = "SELECT * FROM TB_M_Type";

  // ยิงทีเดียว 4 ตาราง
  db.query(`${qBrand}; ${qModel}; ${qCategory}; ${qType}`, (err, results) => {
    if (err) {
      console.error("Master Data Error:", err);
      return res.json({ brands: [], models: [], categories: [], types: [] });
    }
    res.json({
      brands: results[0],
      models: results[1],
      categories: results[2],
      types: results[3],
    });
  });
});

// ✅ 2. ดึงรายการรออนุมัติ
router.get("/api/admin/pending", checkAdmin, (req, res) => {
  const sql = `
        SELECT t.TSTID, t.transaction_num, t.borrowdate, t.duedate, t.purpose,
               d.DVID, d.devicename, d.stickerid, d.sticker AS image,
               e.fname, e.lname, e.username, e.DepartmentID 
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        JOIN TB_T_Employee e ON t.EMPID = e.EMPID
        WHERE t.Due_statusID = 5 
        ORDER BY t.transactiondate ASC
    `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

// ✅ 3. อนุมัติ / ไม่อนุมัติ
router.post("/api/admin/action", checkAdmin, (req, res) => {
  const { tstid, action, dvid } = req.body;
  const adminName = req.session.user.fullname || "Admin";

  let sqlTrans = "";
  let sqlDevice = "";

  if (action === "approve") {
    // อนุมัติ: สถานะยืม=2, สถานะกำหนดส่ง=2, อุปกรณ์=2(ถูกยืม)
    sqlTrans = `UPDATE TB_T_BorrowTrans SET BorrowTransStatusID = 2, Due_statusID = 2, notes_admin = 'อนุมัติโดย ${adminName}', ModifyDate = NOW() WHERE TSTID = ?`;
    sqlDevice = `UPDATE TB_T_Device SET DVStatusID = 2 WHERE DVID = ?`;
  } else {
    // ปฏิเสธ: สถานะยืม=1(คืนค่าเดิม), สถานะกำหนดส่ง=6(ไม่อนุมัติ), อุปกรณ์=1(ว่าง)
    sqlTrans = `UPDATE TB_T_BorrowTrans SET BorrowTransStatusID = 1, Due_statusID = 6, notes_admin = 'ปฏิเสธโดย ${adminName}', ModifyDate = NOW() WHERE TSTID = ?`;
    sqlDevice = `UPDATE TB_T_Device SET DVStatusID = 1 WHERE DVID = ?`;
  }

  db.beginTransaction((err) => {
    if (err) return res.json({ success: false });
    db.query(sqlTrans, [tstid], (err) => {
      if (err) return db.rollback(() => res.json({ success: false }));
      if (sqlDevice) {
        db.query(sqlDevice, [dvid], (err) => {
          if (err) return db.rollback(() => res.json({ success: false }));
          db.commit(() => res.json({ success: true }));
        });
      } else {
        db.commit(() => res.json({ success: true }));
      }
    });
  });
});

// ✅ 4. เพิ่มอุปกรณ์ (รับค่าครบทุกช่อง + Serial + Dropdown ID)
router.post("/api/admin/device/add", checkAdmin, (req, res) => {
  // รับค่าที่ส่งมาจากหน้าเว็บ
  const {
    devicename,
    stickerid,
    serialnumber,
    BrandID,
    ModelID,
    CategoryID,
    TypeID,
    DVStatusID,
  } = req.body;

  const createBy = req.session.username || "Admin";

  const sql = `
    INSERT INTO TB_T_Device 
    (
        devicename, 
        stickerid, 
        serialnumber, 
        BrandID, 
        ModelID, 
        CategoryID, 
        TypeID, 
        DVStatusID, 
        sticker, 
        CreateDate, 
        CreateBy, 
        BorrowTransStatusID
    ) 
    VALUES 
    (?, ?, ?, ?, ?, ?, ?, ?, 'default.png', NOW(), ?, 1)
  `;

  // เตรียมค่า (ถ้าหน้าเว็บไม่ส่งมา ให้ใช้ 1 เป็นค่า Default กัน Error FK)
  const values = [
    devicename,
    stickerid,
    serialnumber || "",
    BrandID || 1,
    ModelID || 1,
    CategoryID || 1,
    TypeID || 1,
    DVStatusID || 1,
    createBy,
  ];

  db.query(sql, values, (err) => {
    if (err) {
      console.error("Add Device Error:", err);
      return res.json({ success: false, msg: err.message });
    }
    res.json({ success: true });
  });
});

// ✅ 5. ลบอุปกรณ์
router.post("/api/admin/device/delete", checkAdmin, (req, res) => {
  const { dvid } = req.body;
  db.query("DELETE FROM TB_T_Device WHERE DVID = ?", [dvid], (err) => {
    if (err)
      return res.json({
        success: false,
        msg: "ลบไม่ได้ (อาจมีประวัติค้างอยู่)",
      });
    res.json({ success: true });
  });
});

// ✅ 6. ดึงอุปกรณ์ทั้งหมด
router.get("/api/admin/devices", checkAdmin, (req, res) => {
  const sql = `SELECT d.*, s.StatusNameDV FROM TB_T_Device d LEFT JOIN TB_M_StatusDevice s ON d.DVStatusID = s.DVStatusID ORDER BY d.DVID DESC`;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

// ✅ 7. ดึงประวัติทั้งหมด
router.get("/api/admin/all-history", checkAdmin, (req, res) => {
  const sql = `
        SELECT t.*, d.devicename, d.stickerid, e.fname, e.lname, e.username
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        JOIN TB_T_Employee e ON t.EMPID = e.EMPID
        ORDER BY t.transactiondate DESC
    `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

module.exports = router;
