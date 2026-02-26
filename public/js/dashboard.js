/* public/js/dashboard.js (ฉบับแก้ไข: เอารูปสินค้าออกชั่วคราว) */

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Dashboard Script Loaded");
  checkLogin();

  // 1. ถ้าเจอ Grid สินค้า -> แปลว่าอยู่ "หน้าหลัก/สินค้า"
  if (document.getElementById("device-grid")) {
    loadDevices();
  }

  // 2. ถ้าเจอ ตารางประวัติ -> แปลว่าอยู่ "หน้าประวัติ"
  if (document.getElementById("history-list")) {
    loadHistory();
  }

  // 3. (Dashboard Stats) ถ้าเจอ Grid สถิติ
  if (document.querySelector(".stats-grid")) {
    loadDashboardStats();
  }

  // 4. ตั้งค่า Date Picker
  const dateInput = document.getElementById("borrow-duedate");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.setAttribute("min", today);
  }
});

/* ================= 1. ระบบ Login & User ================= */
function checkLogin() {
  fetch("/api/user")
    .then((res) => res.json())
    .then((data) => {
      if (!data.loggedIn) {
        window.location.href = "/";
      } else {
        const nameEl =
          document.getElementById("user-name") ||
          document.getElementById("header-name");
        if (nameEl) nameEl.innerText = data.fullname;

        // รูปโปรไฟล์มุมขวาบน (ยังเก็บไว้)
        const imgEl =
          document.querySelector(".avatar") ||
          document.getElementById("header-avatar");
        if (imgEl) {
          const imgSrc = data.image
            ? `/uploads/${data.image}`
            : "/static/default.png";
          imgEl.src = imgSrc;
          imgEl.onerror = () => {
            imgEl.src = "/static/default.png";
          };
        }
      }
    })
    .catch((err) => console.error("Login Check Error:", err));
}

/* ================= 2. ระบบโหลดสถิติ (Dashboard) ================= */
function loadDashboardStats() {
  fetch("/api/dashboard-stats")
    .then((res) => res.json())
    .then((data) => {
      // ... (ส่วนการอัปเดตตัวเลขสถิติคงเดิม) ...

      const tbody = document.getElementById("recent-list");
      if (tbody) {
        tbody.innerHTML = "";
        if (data.recentTrans.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999;">ยังไม่มีรายการเคลื่อนไหว</td></tr>`;
          return;
        }
        data.recentTrans.forEach((item) => {
          const date = new Date(item.transactiondate).toLocaleDateString(
            "th-TH",
          );

          // ✅ ส่วนที่เพิ่มการเช็คสถานะใหม่ (อ้างอิงตาม Due_statusID)
          let statusBadge = "";
          if (item.Due_statusID == 6) {
            statusBadge =
              '<span style="color:#7f8c8d; font-weight:bold;">❌ ไม่อนุมัติ</span>';
          } else if (item.Due_statusID == 3) {
            statusBadge =
              '<span style="color:#e74c3c; font-weight:bold;">⚠️ เกินกำหนด</span>';
          } else if (item.Due_statusID == 5) {
            statusBadge = '<span style="color:orange;">⏳ รออนุมัติ</span>';
          } else if (item.BorrowTransStatusID == 3 || item.Due_statusID == 4) {
            statusBadge = '<span style="color:green;">✅ คืนแล้ว</span>';
          } else if (item.BorrowTransStatusID == 2) {
            statusBadge = '<span style="color:blue;">📦 กำลังยืม</span>';
          }

          const borrowerName = item.fname || item.username;

          tbody.innerHTML += `
            <tr>
                <td style="padding:10px;">${item.transaction_num || "-"}</td>
                <td style="padding:10px;">${item.devicename}</td>
                <td style="padding:10px;">${borrowerName}</td>
                <td style="padding:10px;">${statusBadge}</td>
                <td style="padding:10px;">${date}</td>
            </tr>
          `;
        });
      }
    })
    .catch((err) => console.error("Stats Error:", err));
}
/* ================= 3. ระบบโหลดข้อมูลอุปกรณ์ (เอาส่วนรูปออก) ================= */
function loadDevices() {
  const grid = document.getElementById("device-grid");
  if (!grid) return;

  grid.innerHTML = "<p>🔄 กำลังโหลดข้อมูล...</p>";

  fetch("/api/devices")
    .then((res) => {
      if (!res.ok) throw new Error("Server Error");
      return res.json();
    })
    .then((devices) => {
      grid.innerHTML = "";

      if (!Array.isArray(devices) || devices.length === 0) {
        grid.innerHTML = '<p style="padding:20px;">🚫 ไม่พบอุปกรณ์ในระบบ</p>';
        return;
      }

      devices.forEach((item) => {
        const isAvailable = item.DVStatusID === 1;
        const statusClass = isAvailable ? "status-available" : "status-busy";
        const statusText = isAvailable
          ? "✅ ว่างพร้อมยืม"
          : "❌ ไม่ว่าง / รออนุมัติ";
        const btnText = isAvailable ? "📝 ส่งคำขอยืม" : "ถูกใช้งานอยู่";

        const btnAttr = isAvailable
          ? `onclick="borrowItem(${item.DVID})"`
          : 'disabled style="background-color:#ccc; cursor:not-allowed;"';

        // ✅ ตัดส่วน <img> ออก เหลือแค่ชื่อและสถานะ
        grid.innerHTML += `
            <div class="device-card">
                <div class="card-body" style="padding:20px;">
                    <h3 style="font-size:18px; margin-bottom:10px;">${item.devicename}</h3>
                    <p style="color:#777; font-size:13px; margin-bottom:15px;">รหัสครุภัณฑ์: ${item.stickerid}</p>
                    
                    <div style="margin-bottom:20px;">
                        <span class="status-badge ${statusClass}" style="display:inline-block; padding:5px 10px; border-radius:15px; font-size:12px;">
                            ${statusText}
                        </span>
                    </div>

                    <button class="btn-borrow" ${btnAttr} style="width:100%; padding:10px; border:none; border-radius:5px; color:white; font-weight:bold; cursor:pointer;">
                        ${btnText}
                    </button>
                </div>
            </div>
        `;
      });
    })
    .catch((err) => {
      grid.innerHTML = `<p style="color:red;">โหลดล้มเหลว: ${err.message}</p>`;
    });
}

/* ================= 4. ระบบ Modal & ยืมของ ================= */
function borrowItem(dvid) {
  const modal = document.getElementById("borrowModal");
  const inputId = document.getElementById("borrow-dvid");
  if (modal && inputId) {
    inputId.value = dvid;
    modal.style.display = "flex";
  }
}

function closeModal() {
  const modal = document.getElementById("borrowModal");
  if (modal) modal.style.display = "none";
}

function confirmBorrow(event) {
  event.preventDefault();
  const dvid = document.getElementById("borrow-dvid").value;
  const duedate = document.getElementById("borrow-duedate").value;
  const location = document.getElementById("borrow-location").value;
  const purpose = document.getElementById("borrow-purpose").value;

  if (!duedate || !location || !purpose) {
    alert("กรุณากรอกข้อมูลให้ครบ");
    return;
  }

  fetch("/api/borrow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dvid, duedate, location, purpose }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("🎉 " + data.message);
        closeModal();
        loadDevices();
      } else {
        alert("❌ " + data.message);
      }
    });
}

window.onclick = function (event) {
  const modal = document.getElementById("borrowModal");
  if (event.target == modal) modal.style.display = "none";
};

/* ================= 5. ระบบประวัติ (เอาส่วนรูปออกเช่นกัน) ================= */
function loadHistory() {
  const tbody = document.getElementById("history-list");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="5" style="text-align:center;">🔄 กำลังโหลดข้อมูล...</td></tr>';

  fetch("/api/my-borrowing")
    .then((res) => res.json())
    .then((data) => {
      tbody.innerHTML = "";

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">🚫 ไม่มีรายการที่กำลังยืมอยู่</td></tr>`;
        return;
      }

      data.forEach((item) => {
        const borrowDate = new Date(item.borrowdate).toLocaleDateString(
          "th-TH",
        );
        const dueDate = new Date(item.duedate).toLocaleDateString("th-TH");

        let returnBtn = "";
        if (item.BorrowTransStatusID == 1) {
          returnBtn =
            '<span style="color:#f39c12; font-size:12px;">รอรับของ</span>';
        } else {
          returnBtn = `<button onclick="returnItem(${item.TSTID}, ${item.DVID})" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">คืนของ</button>`;
        }

        // ✅ ตัดส่วน <img> ออก
        tbody.innerHTML += `
            <tr>
                <td style="text-align:center; font-size:20px;">📦</td>
                <td>
                    <strong>${item.devicename}</strong><br>
                    <small style="color:#666">${item.stickerid}</small>
                </td>
                <td>${borrowDate}</td>
                <td style="color:#d35400; font-weight:bold;">${dueDate}</td>
                <td>${returnBtn}</td>
            </tr>
        `;
      });
    })
    .catch((err) => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">❌ โหลดข้อมูลล้มเหลว</td></tr>`;
    });
}

function returnItem(tstid, dvid) {
  if (!confirm("ยืนยันที่จะคืนอุปกรณ์นี้?")) return;

  fetch("/api/return", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tstid, dvid }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("✅ คืนอุปกรณ์เรียบร้อย!");
        loadHistory();
      } else {
        alert("❌ เกิดข้อผิดพลาด: " + data.message);
      }
    })
    .catch((err) => {
      alert("Server connection failed");
    });
}
