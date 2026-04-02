const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../config/db");

// ✅ 1. เพิ่ม Library จัดการไฟล์รูปภาพ (Multer) ที่หายไป
const multer = require("multer");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + Math.round(Math.random() * 1e9);
    cb(null, "dv-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// Middleware เช็คสิทธิ์ Admin
const checkAdmin = (req, res, next) => {
  if (
    req.session.login &&
    req.session.user &&
    (req.session.user.role === 2 || req.session.user.role === 3)
  ) {
    next();
  } else {
    res.redirect("/");
  }
};

// ฟังก์ชันบันทึก Log
const saveLog = (empid, actionType, actionDetail) => {
  if (!empid) return;
  const sqlLog = `INSERT INTO TB_SystemLog (EMPID, ActionType, ActionDetail) VALUES (?, ?, ?)`;
  db.query(sqlLog, [empid, actionType, actionDetail], (err) => {
    if (err) console.error("❌ บันทึก Log ไม่สำเร็จ:", err);
  });
};

/* ================= PAGE ROUTES ================= */
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
router.get("/admin/log", checkAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin_log.html")),
);

router.get("/admin/users", checkAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin_users.html")),
);

/* ================= API ROUTES ================= */

router.get("/api/admin/master-data", checkAdmin, (req, res) => {
  const qBrand = "SELECT * FROM TB_M_Brand";
  const qModel = "SELECT * FROM TB_M_Model";
  const qCategory = "SELECT * FROM TB_M_Category";
  const qType = "SELECT * FROM TB_M_Type";
  db.query(`${qBrand}; ${qModel}; ${qCategory}; ${qType}`, (err, results) => {
    if (err)
      return res.json({ brands: [], models: [], categories: [], types: [] });
    res.json({
      brands: results[0],
      models: results[1],
      categories: results[2],
      types: results[3],
    });
  });
});

// ✅ [เพิ่มใหม่] API สำหรับเพิ่มข้อมูลพื้นฐาน (หมวดหมู่, ยี่ห้อ, รุ่น, ประเภท) จากหน้าเว็บ
router.post("/api/admin/master/add", checkAdmin, (req, res) => {
  const { type, name } = req.body;
  let tableName = "";
  let colName = "";

  // เช็คว่าผู้ใช้กดเพิ่มอะไรมา แล้วเลือกตารางให้ถูก
  if (type === "brand") {
    tableName = "TB_M_Brand";
    colName = "BrandName";
  } else if (type === "model") {
    tableName = "TB_M_Model";
    colName = "ModelName";
  } else if (type === "category") {
    tableName = "TB_M_Category";
    colName = "CategoryName";
  } else if (type === "type") {
    tableName = "TB_M_Type";
    colName = "TypeName";
  } else {
    return res.json({ success: false, message: "Invalid Type" });
  }

  // Insert ลง Database
  const sql = `INSERT INTO ${tableName} (${colName}) VALUES (?)`;
  db.query(sql, [name], (err, result) => {
    if (err) {
      console.error("Insert Master Data Error:", err);
      return res.json({
        success: false,
        message: "เกิดข้อผิดพลาดในการบันทึกฐานข้อมูล",
      });
    }

    // บันทึก Log การเพิ่มข้อมูล Master Data
    saveLog(
      req.session.userID,
      "ADD_MASTER_DATA",
      `เพิ่มข้อมูล ${type}: ${name}`,
    );

    res.json({ success: true, insertId: result.insertId });
  });
});

router.get("/api/admin/pending", checkAdmin, (req, res) => {
  // ✅ เพิ่มการดึง serialnumber, it_code, location และ JOIN Brand, Model
  const sql = `
        SELECT t.TSTID, t.transaction_num, t.borrowdate, t.duedate, t.purpose, t.location,
               d.DVID, d.devicename, d.stickerid, d.sticker AS image, d.serialnumber, d.it_code,
               b.BrandName, m.ModelName,
               e.fname, e.lname, e.username, e.DepartmentID 
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        JOIN TB_T_Employee e ON t.EMPID = e.EMPID
        LEFT JOIN TB_M_Brand b ON d.BrandID = b.BrandID
        LEFT JOIN TB_M_Model m ON d.ModelID = m.ModelID
        WHERE t.Due_statusID = 5 
        ORDER BY t.transactiondate ASC
    `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

router.post("/api/admin/action", checkAdmin, (req, res) => {
  const { tstid, action, dvid } = req.body;
  const adminName = req.session.user.fullname || "Admin";
  let sqlTrans = "",
    sqlDevice = "";

  if (action === "approve") {
    sqlTrans = `UPDATE TB_T_BorrowTrans SET BorrowTransStatusID = 2, Due_statusID = 2, notes_admin = 'อนุมัติโดย ${adminName}', ModifyDate = NOW() WHERE TSTID = ?`;
    sqlDevice = `UPDATE TB_T_Device SET DVStatusID = 2 WHERE DVID = ?`;
  } else {
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
          db.commit(() => {
            const actionType =
              action === "approve" ? "APPROVE_BORROW" : "REJECT_BORROW";
            saveLog(
              req.session.userID,
              actionType,
              `${action === "approve" ? "อนุมัติ" : "ไม่อนุมัติ"}คำขอยืม (รายการ: #${tstid})`,
            );
            res.json({ success: true });
          });
        });
      } else {
        db.commit(() => {
          saveLog(
            req.session.userID,
            "UPDATE_TRANSACTION",
            `เปลี่ยนสถานะรายการ #${tstid}`,
          );
          res.json({ success: true });
        });
      }
    });
  });
});

/// ✅ จุดที่ 1: API เพิ่มอุปกรณ์
router.post(
  "/api/admin/device/add",
  checkAdmin,
  upload.single("image"),
  (req, res) => {
    const {
      devicename,
      devicename_th,
      stickerid,
      it_code,
      serialnumber,
      BrandID,
      ModelID,
      CategoryID,
      TypeID,
      DVStatusID,
    } = req.body;

    const createBy = req.session.username || "Admin";
    const imageFilename = req.file
      ? req.file.filename
      : "https://img.icons8.com/color/96/box.png";

    const sql = `
    INSERT INTO TB_T_Device 
    (devicename, devicename_th, stickerid, it_code, serialnumber, BrandID, ModelID, CategoryID, TypeID, DVStatusID, sticker, CreateDate, CreateBy, BorrowTransStatusID) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 1)
  `;
    const values = [
      devicename,
      devicename_th || null,
      stickerid,
      it_code || null,
      serialnumber || "",
      BrandID || 1,
      ModelID || 1,
      CategoryID || 1,
      TypeID || 1,
      DVStatusID || 1,
      imageFilename,
      createBy,
    ];

    db.query(sql, values, (err) => {
      if (err) return res.json({ success: false, msg: err.message });
      saveLog(
        req.session.userID,
        "ADD_DEVICE",
        `เพิ่มอุปกรณ์: ${devicename} (รหัส: ${stickerid})`,
      );
      res.json({ success: true });
    });
  },
);

// ✅ 3. แก้ไข API ลบอุปกรณ์ให้ "ลบประวัติ" ทิ้งก่อนด้วย
router.post("/api/admin/device/delete", checkAdmin, (req, res) => {
  const { dvid } = req.body;
  // ลบประวัติการยืมก่อน (ปลดล็อค Foreign Key)
  db.query("DELETE FROM TB_T_BorrowTrans WHERE DVID = ?", [dvid], (err) => {
    // ลบประวัติเสร็จ ค่อยลบอุปกรณ์จริงๆ
    db.query("DELETE FROM TB_T_Device WHERE DVID = ?", [dvid], (err) => {
      if (err)
        return res.json({
          success: false,
          msg: "ลบไม่ได้ (เกิดข้อผิดพลาดฐานข้อมูล)",
        });
      saveLog(
        req.session.userID,
        "DELETE_DEVICE",
        `ลบอุปกรณ์รหัส DVID: ${dvid} ออกจากระบบ`,
      );
      res.json({ success: true });
    });
  });
});

// ✅ แก้ไข API ดึงข้อมูลอุปกรณ์ ให้มีการ JOIN ตารางอื่นๆ เข้ามาแสดงผลได้
router.get("/api/admin/devices", checkAdmin, (req, res) => {
  const sql = `
    SELECT 
      d.*, 
      s.StatusNameDV,
      b.BrandName,
      m.ModelName,
      c.CategoryName,
      t.TypeName
    FROM TB_T_Device d 
    LEFT JOIN TB_M_StatusDevice s ON d.DVStatusID = s.DVStatusID
    LEFT JOIN TB_M_Brand b ON d.BrandID = b.BrandID
    LEFT JOIN TB_M_Model m ON d.ModelID = m.ModelID
    LEFT JOIN TB_M_Category c ON d.CategoryID = c.CategoryID
    LEFT JOIN TB_M_Type t ON d.TypeID = t.TypeID
    ORDER BY d.DVID DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

router.get("/api/admin/all-history", checkAdmin, (req, res) => {
  const sql = `SELECT t.*, d.devicename, d.stickerid, e.fname, e.lname, e.username FROM TB_T_BorrowTrans t JOIN TB_T_Device d ON t.DVID = d.DVID JOIN TB_T_Employee e ON t.EMPID = e.EMPID ORDER BY t.transactiondate DESC`;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

/// ✅ แก้ไข API อัปเดตอุปกรณ์ ในไฟล์ admin.js
router.post(
  "/api/admin/device/edit",
  checkAdmin,
  upload.single("image"),
  (req, res) => {
    const {
      dvid,
      devicename,
      devicename_th,
      stickerid,
      it_code,
      serialnumber,
      BrandID,
      ModelID,
      CategoryID,
      TypeID,
      DVStatusID,
    } = req.body;

    // ✅ ดึงชื่อ Admin จาก Session มาใช้
    const modifyBy =
      req.session.user.fullname || req.session.username || "Admin";

    // ✅ เพิ่ม ModifyBy=? และ ModifyDate=NOW() เข้าไปใน SQL
    let sql = `
    UPDATE TB_T_Device SET 
    devicename=?, devicename_th=?, stickerid=?, it_code=?, serialnumber=?, 
    BrandID=?, ModelID=?, CategoryID=?, TypeID=?, DVStatusID=?,
    ModifyBy=?, ModifyDate=NOW() 
    WHERE DVID=?
  `;

    const values = [
      devicename,
      devicename_th || null,
      stickerid,
      it_code || null,
      serialnumber || "",
      BrandID || 1,
      ModelID || 1,
      CategoryID || 1,
      TypeID || 1,
      DVStatusID || 1,
      modifyBy,
      dvid, // ✅ ส่งค่า modifyBy เข้าไปบันทึก
    ];

    // (ส่วนที่เหลือสำหรับการจัดการรูปภาพคงเดิม...)
    if (req.file) {
      // ปรับ SQL เล็กน้อยถ้ามีการอัปโหลดรูปใหม่
      sql = sql.replace(
        "ModifyBy=?, ModifyDate=NOW()",
        "ModifyBy=?, ModifyDate=NOW(), sticker=?",
      );
      values.splice(values.length - 1, 0, req.file.filename);
    }

    db.query(sql, values, (err) => {
      if (err) return res.json({ success: false, msg: err.message });
      saveLog(
        req.session.userID,
        "EDIT_DEVICE",
        `แก้ไขข้อมูลอุปกรณ์: ${devicename}`,
      );
      res.json({ success: true });
    });
  },
);

router.get("/api/admin/logs", checkAdmin, (req, res) => {
  const sql = `SELECT l.*, e.fname, e.EMP_NUM FROM TB_SystemLog l LEFT JOIN TB_T_Employee e ON l.EMPID = e.EMPID ORDER BY l.LogDate DESC LIMIT 100`;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

// ✅ API: ดึงข้อมูลรายการที่กำลังถูกใช้งาน (รอรับคืน)
// ✅ API: ดึงข้อมูลรายการที่กำลังถูกใช้งาน (รอรับคืน)
router.get("/api/admin/pending-return", checkAdmin, (req, res) => {
  // ✅ เพิ่มการดึงข้อมูลเชิงลึกแบบเดียวกับด้านบน เพื่อให้แอดมินใช้เทียบของตอนรับคืน
  const sql = `
        SELECT t.TSTID, t.transaction_num, t.borrowdate, t.duedate, t.Due_statusID, t.purpose, t.location,
               d.DVID, d.devicename, d.stickerid, d.sticker AS image, d.serialnumber, d.it_code,
               b.BrandName, m.ModelName,
               e.fname, e.lname, e.username, e.DepartmentID 
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        JOIN TB_T_Employee e ON t.EMPID = e.EMPID
        LEFT JOIN TB_M_Brand b ON d.BrandID = b.BrandID
        LEFT JOIN TB_M_Model m ON d.ModelID = m.ModelID
        WHERE t.Due_statusID IN (2, 3) AND t.returndate IS NULL
        ORDER BY t.duedate ASC
    `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

// ✅ API: แอดมินกดยืนยันรับอุปกรณ์คืนเข้าคลัง
router.post("/api/admin/receive-return", checkAdmin, (req, res) => {
  const { tstid, dvid } = req.body;
  const adminName = req.session.user.fullname || "Admin";

  // เปลี่ยนสถานะการยืมเป็น "คืนแล้ว" (BorrowTransStatusID = 3, Due_statusID = 4)
  const sqlTrans = `UPDATE TB_T_BorrowTrans SET returndate = NOW(), BorrowTransStatusID = 3, Due_statusID = 4, notes_admin = CONCAT(IFNULL(notes_admin,''), ' | รับคืนโดย ', ?), ModifyDate = NOW() WHERE TSTID = ?`;

  // เปลี่ยนสถานะอุปกรณ์เป็น "ว่าง" (DVStatusID = 1)
  const sqlDevice = `UPDATE TB_T_Device SET DVStatusID = 1 WHERE DVID = ?`;

  db.beginTransaction((err) => {
    if (err) return res.json({ success: false });
    db.query(sqlTrans, [adminName, tstid], (err) => {
      if (err) return db.rollback(() => res.json({ success: false }));
      db.query(sqlDevice, [dvid], (err) => {
        if (err) return db.rollback(() => res.json({ success: false }));
        db.commit(() => {
          // บันทึก Log แอดมินรับของคืน
          saveLog(
            req.session.userID,
            "RECEIVE_RETURN",
            `แอดมินรับคืนอุปกรณ์เข้าคลัง (รายการ: #${tstid})`,
          );
          res.json({ success: true, message: "รับคืนอุปกรณ์สำเร็จ" });
        });
      });
    });
  });
});

// ✅ API: ดึงข้อมูลสถิติสำหรับวาดกราฟ (Chart.js)
router.get("/api/admin/chart-data", checkAdmin, (req, res) => {
  // 1. คิวรี่หาสัดส่วนสถานะอุปกรณ์ (DVStatusID 1 = ว่าง, 2 = ไม่ว่าง/ถูกยืม)
  const sqlStatus = `
    SELECT
      SUM(CASE WHEN DVStatusID = 1 THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN DVStatusID = 2 THEN 1 ELSE 0 END) as borrowed
    FROM TB_T_Device
  `;

  // 2. คิวรี่หา 5 อันดับอุปกรณ์ที่ถูกยืมบ่อยที่สุด
  const sqlTopDevices = `
    SELECT d.devicename, COUNT(t.DVID) as borrow_count
    FROM TB_T_BorrowTrans t
    JOIN TB_T_Device d ON t.DVID = d.DVID
    GROUP BY t.DVID, d.devicename
    ORDER BY borrow_count DESC
    LIMIT 5
  `;

  db.query(sqlStatus, (err1, statusResult) => {
    if (err1) return res.status(500).json({ error: "DB Error 1" });

    db.query(sqlTopDevices, (err2, topDevicesResult) => {
      if (err2) return res.status(500).json({ error: "DB Error 2" });

      res.json({
        statusData: statusResult[0], // ส่งผลลัพธ์เป็น { available: x, borrowed: y }
        topDevices: topDevicesResult, // ส่งเป็น Array [ {devicename: '...', borrow_count: x}, ... ]
      });
    });
  });
});

// ✅ API: ดึงรายชื่อผู้ใช้งานทั้งหมดเพื่อมาแสดงในหน้าจัดการผู้ใช้
router.get("/api/admin/users", checkAdmin, (req, res) => {
  const sql = `
    SELECT e.EMPID, e.EMP_NUM, e.username, e.fname, e.lname, e.email, e.image,
           e.RoleID, r.RoleName, d.DepartmentName, s.StatusNameEMP
    FROM TB_T_Employee e
    LEFT JOIN TB_M_Role r ON e.RoleID = r.RoleID
    LEFT JOIN TB_M_Department d ON e.DepartmentID = d.DepartmentID
    LEFT JOIN TB_M_StatusEMP s ON e.EMPStatusID = s.EMPStatusID
    ORDER BY e.RoleID DESC, e.fname ASC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

// ✅ API: เปลี่ยนแปลงบทบาท (Role) ของผู้ใช้งาน
router.post("/api/admin/user/role", checkAdmin, (req, res) => {
  const { targetEmpId, newRole } = req.body;

  // กฎ: ถ้าตั้งให้เป็น Super Admin (RoleID = 3) ต้องปลด Super Admin คนเก่าให้เป็นแค่ Admin (RoleID = 2) ก่อน
  if (newRole == 3) {
    db.query("UPDATE TB_T_Employee SET RoleID = 2 WHERE RoleID = 3", (err) => {
      if (err)
        return res.json({
          success: false,
          msg: "เกิดข้อผิดพลาดในการปลด Super Admin คนเก่า",
        });

      // ตั้งคนใหม่เป็น Super Admin
      db.query(
        "UPDATE TB_T_Employee SET RoleID = 3 WHERE EMPID = ?",
        [targetEmpId],
        (err) => {
          if (err)
            return res.json({
              success: false,
              msg: "เกิดข้อผิดพลาดในการตั้ง Super Admin ใหม่",
            });
          saveLog(
            req.session.userID,
            "CHANGE_ROLE",
            `เปลี่ยนสิทธิ์ EMPID:${targetEmpId} เป็น Super Admin`,
          );
          res.json({
            success: true,
            msg: "แต่งตั้ง Super Admin คนใหม่สำเร็จ!",
          });
        },
      );
    });
  } else {
    // ถ้าแค่เปลี่ยนเป็น User (1) หรือ Admin (2) ธรรมดา
    db.query(
      "UPDATE TB_T_Employee SET RoleID = ? WHERE EMPID = ?",
      [newRole, targetEmpId],
      (err) => {
        if (err)
          return res.json({ success: false, msg: "เกิดข้อผิดพลาดฐานข้อมูล" });
        saveLog(
          req.session.userID,
          "CHANGE_ROLE",
          `เปลี่ยนสิทธิ์ EMPID:${targetEmpId} เป็น Role:${newRole}`,
        );
        res.json({ success: true, msg: "อัปเดตบทบาทสำเร็จ" });
      },
    );
  }
});

module.exports = router;
