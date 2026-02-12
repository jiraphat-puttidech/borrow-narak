const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../config/db");

/* ================= PAGE ROUTES ================= */
router.get("/dashboard", (req, res) => {
  if (!req.session.login) return res.redirect("/");
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// ✅ 1. เพิ่มหน้า Tracking (สถานะการยืม-คืน)
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
  const qRecent = `
        SELECT t.*, d.devicename, e.username, e.fname
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        JOIN TB_T_Employee e ON t.EMPID = e.EMPID
        ORDER BY t.transactiondate DESC LIMIT 5
    `;

  db.query(`${q1}; ${q2}; ${q3}; ${q4}; ${qRecent}`, (err, results) => {
    if (err) return res.json({});
    res.json({
      totalTrans: results[0][0].count,
      pendingReturn: results[1][0].count,
      totalMembers: results[2][0].count,
      totalDevices: results[3][0].count,
      recentTrans: results[4],
    });
  });
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

// ✅ 2. แก้ชื่อ API เป็น active-borrow (เพื่อให้ตรงกับ tracking.html)
router.get("/api/my-active-borrow", (req, res) => {
  if (!req.session.login) return res.json([]);
  // ดึงรายการที่ยังไม่คืน (returndate IS NULL)
  const sql = `
        SELECT t.TSTID, t.DVID, t.borrowdate, t.duedate, t.Due_statusID,
               d.devicename, d.stickerid, d.sticker AS image
        FROM TB_T_BorrowTrans t
        JOIN TB_T_Device d ON t.DVID = d.DVID
        WHERE t.EMPID = ? AND t.returndate IS NULL 
        ORDER BY t.borrowdate DESC
    `;
  db.query(sql, [req.session.userID], (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

// ✅ 3. เพิ่ม API my-history-all (เพื่อให้ตรงกับ history.html)
router.get("/api/my-history-all", (req, res) => {
  if (!req.session.login) return res.json([]);
  // ดึงทั้งหมด (ไม่สนว่าคืนหรือยัง)
  const sql = `
        SELECT t.TSTID, t.borrowdate, t.returndate, t.BorrowTransStatusID,
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

router.post("/api/return", (req, res) => {
  if (!req.session.login)
    return res.status(401).json({ error: "Unauthorized" });
  const { tstid, dvid } = req.body;
  const username = req.session.username;

  const sqlTrans = `UPDATE TB_T_BorrowTrans SET returndate = NOW(), BorrowTransStatusID = 3, Due_statusID = 4, ModifyDate = NOW(), ModifyBy = ? WHERE TSTID = ?`;
  const sqlDevice = `UPDATE TB_T_Device SET DVStatusID = 1 WHERE DVID = ?`;

  db.beginTransaction((err) => {
    if (err) return res.json({ success: false });
    db.query(sqlTrans, [username, tstid], (err) => {
      if (err) return db.rollback(() => res.json({ success: false }));
      db.query(sqlDevice, [dvid], (err) => {
        if (err) return db.rollback(() => res.json({ success: false }));
        db.commit(() =>
          res.json({ success: true, message: "คืนอุปกรณ์สำเร็จ" }),
        );
      });
    });
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

module.exports = router;
