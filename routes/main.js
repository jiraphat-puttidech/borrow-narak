const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../config/db"); // เรียกใช้ DB

/* ==========================================
   ส่วนที่ 1: Route สำหรับเปลี่ยนหน้า (Page Navigation)
   ========================================== */

router.get("/dashboard", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

router.get("/history", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "history.html"));
});

router.get("/category", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "category.html"));
});

router.get("/product", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "product.html"));
});

router.get("/others", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "others.html"));
});

/* ==========================================
   ส่วนที่ 2: API ข้อมูลผู้ใช้
   ========================================== */

router.get("/api/user", (req, res) => {
  if (req.session.login) {
    res.json({
      loggedIn: true,
      fullname: req.session.user.fullname,
      role: req.session.user.role || "User",
    });
  } else {
    res.json({ loggedIn: false });
  }
});

/* ==========================================
   ส่วนที่ 3: API เกี่ยวกับอุปกรณ์และการยืมคืน
   ========================================== */

// 1. ดึงรายการอุปกรณ์ทั้งหมด (หน้า Dashboard)
router.get("/api/devices", (req, res) => {
  // SQL ดึงข้อมูลจาก TB_T_Device และ Join เอาชื่อสถานะมา
  const sql = `
        SELECT 
            d.DVID, 
            d.devicename, 
            d.stickerid, 
            d.sticker AS image, 
            d.DVStatusID,
            s.StatusNameDV
        FROM TB_T_Device d
        LEFT JOIN TB_M_StatusDevice s ON d.DVStatusID = s.DVStatusID
    `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("SQL Error (Get Devices):", err);
      return res.status(500).json({ error: "Database Error" });
    }
    res.json(results);
  });
});

// 2. ยืมอุปกรณ์ (แก้ไขให้ตรงกับ TB_T_BorrowTrans 100%)
router.post("/api/borrow", (req, res) => {
  // เช็ค Session
  if (!req.session.login || !req.session.userID) {
    return res
      .status(401)
      .json({ success: false, message: "Session หมดอายุ กรุณา Login ใหม่" });
  }

  const { dvid, duedate, location, purpose } = req.body;
  const empid = req.session.userID;

  // สร้างเลขที่รายการ (Transaction Number) เช่น EBRS-240123-xxxx
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const transNum = `EBRS-${datePart}-${Date.now().toString().slice(-4)}`;

  // ✅ SQL INSERT: แก้ชื่อคอลัมน์ให้ตรงเป๊ะ และใส่ NULL ในค่าที่ยังไม่มี
  const sqlInsert = `
        INSERT INTO TB_T_BorrowTrans 
        (
            transaction_num, transactiondate, 
            DVID, EMPID, borrowdate, duedate, 
            location, purpose, BorrowTransStatusID, 
            
            -- คอลัมน์อื่นๆ ที่ต้องมีตามตาราง (ใส่ NULL หรือค่า Default ไว้ก่อน)
            EMP_NUM, phone,
            InstitutionID, DepartmentID, 
            CategoryID, TypeID, ModelID, BrandID, 
            notes_emp, notes_admin
        )
        VALUES 
        (
            ?, NOW(), -- transaction_num, transactiondate
            ?, ?, NOW(), ?, -- DVID, EMPID, borrowdate, duedate
            ?, ?, 1,  -- location, purpose, Status=1 (รอตรวจสอบ)
            
            -- ใส่ NULL ไว้ก่อน (เพราะหน้าเว็บยังไม่ได้ส่งมา)
            NULL, NULL, 
            NULL, NULL, 
            NULL, NULL, NULL, NULL,
            '-', '-'
        )
    `;

  // SQL UPDATE Status Device (2 = ไม่ว่าง/ถูกยืม)
  const sqlUpdateDevice = `UPDATE TB_T_Device SET DVStatusID = 2 WHERE DVID = ?`;

  db.beginTransaction((err) => {
    if (err) return res.json({ success: false, message: "Transaction Error" });

    // Step 1: Insert ลงตาราง BorrowTrans
    db.query(
      sqlInsert,
      [transNum, dvid, empid, duedate, location, purpose],
      (err, result) => {
        if (err) {
          console.error("❌ INSERT FAILED:", err.sqlMessage); // ปริ้น Error ชัดๆ
          return db.rollback(() =>
            res.json({
              success: false,
              message: "บันทึกไม่ผ่าน: " + err.sqlMessage,
            }),
          );
        }

        // Step 2: Update สถานะ Device เป็น 'ไม่ว่าง'
        db.query(sqlUpdateDevice, [dvid], (err) => {
          if (err) {
            return db.rollback(() =>
              res.json({ success: false, message: "อัปเดตสถานะของไม่สำเร็จ" }),
            );
          }

          db.commit((err) => {
            if (err)
              return db.rollback(() =>
                res.json({ success: false, message: "Commit Error" }),
              );
            console.log("✅ ยืมสำเร็จ! TSTID:", result.insertId);
            res.json({ success: true, message: "บันทึกการยืมสำเร็จ!" });
          });
        });
      },
    );
  });
});

// 3. ดึงประวัติการยืมของฉัน (จาก TB_T_BorrowTrans)
router.get("/api/my-borrowing", (req, res) => {
  if (!req.session.login) return res.json([]);

  const empid = req.session.userID;

  // เลือกรายการที่ returndate เป็น NULL (ยังไม่คืน)
  const sql = `
        SELECT 
            t.TSTID, 
            t.DVID, 
            t.borrowdate, 
            t.duedate,
            d.devicename, 
            d.stickerid, 
            d.sticker AS image
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        WHERE t.EMPID = ? 
        AND t.returndate IS NULL 
        ORDER BY t.borrowdate DESC
    `;

  db.query(sql, [empid], (err, results) => {
    if (err) {
      console.error("SQL Error (My Borrowing):", err);
      return res.status(500).json({ error: "Database Error" });
    }
    res.json(results);
  });
});

// ==========================================
// 4. API: คืนอุปกรณ์ (แก้สถานะเป็น 3 = คืนแล้ว)
// ==========================================
router.post("/api/return", (req, res) => {
  // 1. เช็ค Login
  if (!req.session.login) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { tstid, dvid } = req.body;
  const modifier = req.session.username || "System"; // ใครเป็นคนกดคืน

  // ✅ SQL Update Transaction:
  // เปลี่ยน BorrowTransStatusID เป็น 3 (คืนแล้ว)
  const sqlTrans = `
        UPDATE TB_T_BorrowTrans 
        SET 
            returndate = NOW(), 
            BorrowTransStatusID = 3,  -- 👈 แก้ตรงนี้ครับ (จาก 4 เป็น 3)
            ModifyDate = NOW(), 
            ModifyBy = ?
        WHERE TSTID = ?
    `;

  // ✅ SQL Update Device:
  // เปลี่ยนสถานะของกลับเป็น 1 (พร้อมใช้งาน/ปกติ)
  const sqlDevice = `UPDATE TB_T_Device SET DVStatusID = 1 WHERE DVID = ?`;

  db.beginTransaction((err) => {
    if (err) return res.json({ success: false, message: "Server Error" });

    // Step 1: อัปเดตสถานะการยืม (เป็น 3)
    db.query(sqlTrans, [modifier, tstid], (err) => {
      if (err) {
        console.error("❌ Update Trans Error:", err.sqlMessage);
        return db.rollback(() =>
          res.json({ success: false, message: "Update History Failed" }),
        );
      }

      // Step 2: ปลดล็อกอุปกรณ์ (ให้กลับมาว่าง)
      db.query(sqlDevice, [dvid], (err) => {
        if (err) {
          console.error("❌ Update Device Error:", err.sqlMessage);
          return db.rollback(() =>
            res.json({ success: false, message: "Update Device Failed" }),
          );
        }

        db.commit((err) => {
          if (err) return db.rollback(() => res.json({ success: false }));
          console.log(`✅ คืนของสำเร็จ (TSTID: ${tstid} -> Status 3)`);
          res.json({ success: true, message: "คืนอุปกรณ์สำเร็จ" });
        });
      });
    });
  });
});

module.exports = router;
