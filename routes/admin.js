require("dotenv").config(); // ✅ แปะไว้บรรทัดที่ 1 บนสุดเลยครับ

const express = require("express");
const session = require("express-session"); // (หรือตัวอื่นๆ ที่มีอยู่แล้ว)
const path = require("path");
// ... โค้ดเดิมของคุณ ...

const router = express.Router();
const db = require("../config/db");

// ✅ 1. เพิ่ม Library สำหรับส่งอีเมล (เปลี่ยนเป็น SendGrid)
const sgMail = require('@sendgrid/mail');

// ✅ 2. ตั้งค่า API Key ของ SendGrid (ดึงจากไฟล์ .env หรือ Render)
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ✅ 3. ฟังก์ชันหลักสำหรับจัดรูปแบบและส่งอีเมล (อัปเกรดทะลุกำแพง Render)
const sendEmail = async (to, subject, title, detail, color = "#ea580c") => {
  if (!to) return;
  const htmlContent = `
    <div style="font-family: 'Kanit', sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: ${color}; padding: 20px; text-align: center; color: white;">
        <h2 style="margin: 0;">${title}</h2>
      </div>
      <div style="padding: 30px; color: #1e293b; line-height: 1.6;">
        ${detail}
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b; text-align: center;">นี่คือการแจ้งเตือนอัตโนมัติจากระบบยืม-คืน อุปกรณ์ IT</p>
      </div>
    </div>
  `;
  
  const msg = {
    to: to,
    from: process.env.SENDGRID_FROM_EMAIL, // 📧 ดึงอีเมลผู้ส่งที่ยืนยันแล้วจาก Render
    subject: subject,
    html: htmlContent,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ ส่งอีเมลผ่าน SendGrid ไปที่ ${to} สำเร็จ!`);
  } catch (error) {
    console.error("❌ SendGrid Error:", error);
    if (error.response) console.error(error.response.body);
  }
};

// 🔔 Helper: ฟังก์ชันส่งแจ้งเตือนหา User
const sendNotiToUser = (empid, message) => {
  if (!empid) return;
  db.query("INSERT INTO TB_Notification (EMPID, Message) VALUES (?, ?)", [
    empid,
    message,
  ]);
};

// 🔔 Helper: ฟังก์ชันส่งแจ้งเตือนหา "แอดมินทุกคน"
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
router.get("/admin/product", checkAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin_product.html")),
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

router.post("/api/admin/master/add", checkAdmin, (req, res) => {
  const { type, name } = req.body;
  let tableName = "";
  let colName = "";

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

  const sql = `INSERT INTO ${tableName} (${colName}) VALUES (?)`;
  db.query(sql, [name], (err, result) => {
    if (err)
      return res.json({
        success: false,
        message: "เกิดข้อผิดพลาดในการบันทึกฐานข้อมูล",
      });
    saveLog(
      req.session.userID,
      "ADD_MASTER_DATA",
      `เพิ่มข้อมูล ${type}: ${name}`,
    );
    res.json({ success: true, insertId: result.insertId });
  });
});

router.get("/api/admin/pending", checkAdmin, (req, res) => {
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

router.get("/api/admin/available-devices-by-name", checkAdmin, (req, res) => {
  const { devicename, current_dvid } = req.query;
  const sql = `SELECT DVID, stickerid, serialnumber FROM TB_T_Device WHERE devicename = ? AND (DVStatusID = 1 OR DVID = ?)`;
  db.query(sql, [devicename, current_dvid], (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    res.json(results);
  });
});

router.post("/api/admin/action", checkAdmin, (req, res) => {
  const { tstid, action, original_dvid, assign_dvid } = req.body;
  const adminName = req.session.user.fullname || "Admin";

  if (action === "approve") {
    const finalDvid = assign_dvid || original_dvid;
    const sqlTrans = `UPDATE TB_T_BorrowTrans SET DVID = ?, BorrowTransStatusID = 2, Due_statusID = 2, notes_admin = 'อนุมัติโดย ${adminName}', ModifyDate = NOW() WHERE TSTID = ?`;

    db.beginTransaction((err) => {
      if (err) return res.json({ success: false });
      db.query(sqlTrans, [finalDvid, tstid], (err) => {
        if (err) return db.rollback(() => res.json({ success: false }));

        db.query(
          `UPDATE TB_T_Device SET DVStatusID = 2 WHERE DVID = ?`,
          [finalDvid],
          (err) => {
            if (err) return db.rollback(() => res.json({ success: false }));

            if (finalDvid != original_dvid) {
              db.query(
                `UPDATE TB_T_Device SET DVStatusID = 1 WHERE DVID = ?`,
                [original_dvid],
                (err) => {
                  if (err)
                    return db.rollback(() => res.json({ success: false }));
                  commitApprove();
                },
              );
            } else {
              commitApprove();
            }

            function commitApprove() {
              db.commit(() => {
                saveLog(
                  req.session.userID,
                  "APPROVE_BORROW",
                  `อนุมัติยืม (รายการ: #${tstid}) จ่ายเครื่อง: ${finalDvid}`,
                );

                // ✅ 🔔 อัปเดต Query ให้ดึง Email กับ Fname มาด้วย
                db.query(
                  "SELECT t.EMPID, e.email, e.fname, d.devicename, t.duedate FROM TB_T_BorrowTrans t JOIN TB_T_Device d ON t.DVID=d.DVID JOIN TB_T_Employee e ON t.EMPID = e.EMPID WHERE t.TSTID=?",
                  [tstid],
                  (err, rows) => {
                    if (!err && rows.length > 0) {
                      const dDate = new Date(
                        rows[0].duedate,
                      ).toLocaleDateString("th-TH");

                      sendNotiToUser(
                        rows[0].EMPID,
                        `✅ อนุมัติแล้ว: ${rows[0].devicename} (กำหนดคืน: ${dDate})`,
                      );
                      sendNotiToAdmins(
                        `✅ แอดมิน ${adminName} อนุมัติคำขอยืม ${rows[0].devicename} แล้ว`,
                      );

                      // ✅ ส่งอีเมลแจ้ง User ว่าอนุมัติ
                      sendEmail(
                        rows[0].email,
                        "✅ อนุมัติการยืมอุปกรณ์",
                        "คำขอยืมของคุณได้รับการอนุมัติ",
                        `<p>สวัสดีคุณ ${rows[0].fname},</p>
                         <p>อุปกรณ์ <b>${rows[0].devicename}</b> ของคุณได้รับการอนุมัติเรียบร้อยแล้ว กรุณามารับที่แผนก IT ครับ</p>
                         <p>📅 <b>กำหนดคืน:</b> ${dDate}</p>`,
                        "#10b981", // สีเขียว
                      );
                    }
                  },
                );

                res.json({ success: true });
              });
            }
          },
        );
      });
    });
  } else {
    const sqlTrans = `UPDATE TB_T_BorrowTrans SET BorrowTransStatusID = 1, Due_statusID = 6, notes_admin = 'ปฏิเสธโดย ${adminName}', ModifyDate = NOW() WHERE TSTID = ?`;
    const sqlDevice = `UPDATE TB_T_Device SET DVStatusID = 1 WHERE DVID = ?`;

    db.beginTransaction((err) => {
      if (err) return res.json({ success: false });
      db.query(sqlTrans, [tstid], (err) => {
        if (err) return db.rollback(() => res.json({ success: false }));
        db.query(sqlDevice, [original_dvid], (err) => {
          if (err) return db.rollback(() => res.json({ success: false }));
          db.commit(() => {
            saveLog(
              req.session.userID,
              "REJECT_BORROW",
              `ไม่อนุมัติคำขอยืม (รายการ: #${tstid})`,
            );

            // ✅ 🔔 อัปเดต Query ให้ดึง Email กับ Fname มาด้วย
            db.query(
              "SELECT t.EMPID, e.email, e.fname, d.devicename FROM TB_T_BorrowTrans t JOIN TB_T_Device d ON t.DVID=d.DVID JOIN TB_T_Employee e ON t.EMPID = e.EMPID WHERE t.TSTID=?",
              [tstid],
              (err, rows) => {
                if (!err && rows.length > 0) {
                  sendNotiToUser(
                    rows[0].EMPID,
                    `❌ ไม่อนุมัติคำขอ: ${rows[0].devicename}`,
                  );
                  sendNotiToAdmins(
                    `❌ แอดมิน ${adminName} ปฏิเสธคำขอยืม ${rows[0].devicename} แล้ว`,
                  );

                  // ✅ ส่งอีเมลแจ้ง User ว่าไม่อนุมัติ
                  sendEmail(
                    rows[0].email,
                    "❌ ปฏิเสธการยืมอุปกรณ์",
                    "คำขอยืมไม่ได้รับการอนุมัติ",
                    `<p>สวัสดีคุณ ${rows[0].fname},</p>
                     <p>คำขอยืมอุปกรณ์ <b>${rows[0].devicename}</b> ของคุณ <b>ไม่ได้รับการอนุมัติ</b></p>
                     <p>กรุณาติดต่อแอดมินเพื่อสอบถามสาเหตุ หรือยื่นคำขอใหม่อีกครั้งครับ</p>`,
                    "#e74c3c", // สีแดง
                  );
                }
              },
            );

            res.json({ success: true });
          });
        });
      });
    });
  }
});

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

router.post("/api/admin/device/delete", checkAdmin, (req, res) => {
  const { dvid } = req.body;
  db.query("DELETE FROM TB_T_BorrowTrans WHERE DVID = ?", [dvid], (err) => {
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

router.get("/api/admin/devices", checkAdmin, (req, res) => {
  const sql = `
    SELECT 
      d.*, 
      s.StatusNameDV,
      b.BrandName,
      m.ModelName,
      c.CategoryName,
      t.TypeName,
      (SELECT COUNT(*) FROM TB_T_Device d2 WHERE d2.devicename = d.devicename AND d2.DVStatusID = 1) AS remain_qty,
      (SELECT COUNT(*) FROM TB_T_Device d3 WHERE d3.devicename = d.devicename) AS total_qty
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
    const modifyBy =
      req.session.user.fullname || req.session.username || "Admin";

    let sql = `
    UPDATE TB_T_Device SET 
    devicename=?, devicename_th=?, stickerid=?, it_code=?, serialnumber=?, 
    BrandID=?, ModelID=?, CategoryID=?, TypeID=?, DVStatusID=?, ModifyBy=?, ModifyDate=NOW() 
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
      dvid,
    ];

    if (req.file) {
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

router.get("/api/admin/pending-return", checkAdmin, (req, res) => {
  const sql = `
        SELECT t.TSTID, t.transaction_num, t.borrowdate, t.duedate, t.Due_statusID, t.purpose, t.location,
               d.DVID, d.devicename, d.stickerid, d.sticker AS image, d.serialnumber, d.it_code,
               b.BrandName, m.ModelName, e.fname, e.lname, e.username, e.DepartmentID 
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

router.post("/api/admin/receive-return", checkAdmin, (req, res) => {
  const { tstid, dvid } = req.body;
  const adminName = req.session.user.fullname || "Admin";

  const sqlTrans = `UPDATE TB_T_BorrowTrans SET returndate = NOW(), BorrowTransStatusID = 3, Due_statusID = 4, notes_admin = CONCAT(IFNULL(notes_admin,''), ' | รับคืนโดย ', ?), ModifyDate = NOW() WHERE TSTID = ?`;
  const sqlDevice = `UPDATE TB_T_Device SET DVStatusID = 1 WHERE DVID = ?`;

  db.beginTransaction((err) => {
    if (err) return res.json({ success: false });
    db.query(sqlTrans, [adminName, tstid], (err) => {
      if (err) return db.rollback(() => res.json({ success: false }));
      db.query(sqlDevice, [dvid], (err) => {
        if (err) return db.rollback(() => res.json({ success: false }));
        db.commit(() => {
          saveLog(
            req.session.userID,
            "RECEIVE_RETURN",
            `รับอุปกรณ์คืนเข้าคลัง (รายการ: #${tstid} / เครื่อง: ${dvid})`,
          );

          // ✅ 🔔 แจ้งเตือน รับคืน: แจ้งให้ User และแอดมินคนอื่นรับรู้
          db.query(
            "SELECT t.EMPID, d.devicename FROM TB_T_BorrowTrans t JOIN TB_T_Device d ON t.DVID=d.DVID WHERE t.TSTID=?",
            [tstid],
            (err, rows) => {
              if (!err && rows.length > 0) {
                sendNotiToUser(
                  rows[0].EMPID,
                  `📥 รับคืนเรียบร้อย: ${rows[0].devicename} (ขอบคุณครับ)`,
                );
                sendNotiToAdmins(
                  `📥 แอดมิน ${adminName} รับอุปกรณ์ ${rows[0].devicename} เข้าคลังแล้ว`,
                );
              }
            },
          );

          res.json({ success: true });
        });
      });
    });
  });
});

router.get("/api/admin/chart-data", checkAdmin, (req, res) => {
  const sqlStatus = `SELECT SUM(CASE WHEN DVStatusID = 1 THEN 1 ELSE 0 END) as available, SUM(CASE WHEN DVStatusID = 2 THEN 1 ELSE 0 END) as borrowed FROM TB_T_Device`;
  const sqlTopDevices = `SELECT d.devicename, COUNT(t.DVID) as borrow_count FROM TB_T_BorrowTrans t JOIN TB_T_Device d ON t.DVID = d.DVID GROUP BY t.DVID, d.devicename ORDER BY borrow_count DESC LIMIT 5`;

  db.query(sqlStatus, (err1, statusResult) => {
    if (err1) return res.status(500).json({ error: "DB Error 1" });
    db.query(sqlTopDevices, (err2, topDevicesResult) => {
      if (err2) return res.status(500).json({ error: "DB Error 2" });
      res.json({ statusData: statusResult[0], topDevices: topDevicesResult });
    });
  });
});

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

router.post("/api/admin/user/role", checkAdmin, (req, res) => {
  const { targetEmpId, newRole } = req.body;
  if (newRole == 3) {
    db.query("UPDATE TB_T_Employee SET RoleID = 2 WHERE RoleID = 3", (err) => {
      if (err)
        return res.json({
          success: false,
          msg: "เกิดข้อผิดพลาดในการปลด Super Admin คนเก่า",
        });
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
