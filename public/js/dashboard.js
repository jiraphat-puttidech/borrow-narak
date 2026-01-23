/* public/js/dashboard.js (ฉบับสมบูรณ์: หน้าหลัก + ประวัติ + คืนของ) */

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Dashboard Script Loaded");
  checkLogin();

  // ----------------------------------------------------
  // 🔍 ตัวเช็คว่าเราอยู่หน้าไหน (Router แบบง่าย)
  // ----------------------------------------------------

  // 1. ถ้าเจอ Grid สินค้า -> แปลว่าอยู่ "หน้าหลัก"
  if (document.getElementById("device-grid")) {
    loadDevices();
  }

  // 2. ถ้าเจอ ตารางประวัติ -> แปลว่าอยู่ "หน้าประวัติ"
  if (document.getElementById("history-list")) {
    loadHistory();
  }

  // 3. ตั้งค่า Date Picker (ถ้ามี)
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
        window.location.href = "/"; // ไม่ล็อกอิน ดีดออก
      } else {
        // แสดงชื่อผู้ใช้ (ถ้ามี element นี้)
        const nameEl = document.getElementById("user-name");
        if (nameEl) nameEl.innerText = data.fullname;
      }
    })
    .catch((err) => console.error("Login Check Error:", err));
}

/* ================= 2. ระบบโหลดข้อมูลอุปกรณ์ (หน้าหลัก) ================= */
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
        const statusText = isAvailable ? "✅ ว่างพร้อมยืม" : "❌ ไม่ว่าง";
        const btnAttr = isAvailable
          ? `onclick="borrowItem(${item.DVID})"`
          : 'disabled style="background-color:#ccc; cursor:not-allowed;"';
        const btnText = isAvailable ? "ทำรายการเบิก" : "ถูกใช้งานอยู่";
        const imgSrc =
          item.image ||
          item.sticker ||
          "https://via.placeholder.com/150?text=No+Image";

        grid.innerHTML += `
            <div class="device-card">
                <div class="card-img-wrapper" style="text-align:center; padding:10px;">
                    <img src="${imgSrc}" style="max-width:100%; height:150px; object-fit:contain;">
                </div>
                <div class="card-body" style="padding:15px;">
                    <h3 style="font-size:18px; margin-bottom:5px;">${item.devicename}</h3>
                    <p style="color:#777; font-size:13px; margin-bottom:10px;">รหัส: ${item.stickerid}</p>
                    <span class="status-badge ${statusClass}" style="display:inline-block; padding:5px 10px; border-radius:15px; font-size:12px; margin-bottom:15px;">
                        ${statusText}
                    </span>
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

/* ================= 3. ระบบ Modal & ยืมของ (หน้าหลัก) ================= */
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

/* ================= 4. ระบบประวัติ & คืนของ (หน้า History) ================= */
function loadHistory() {
  const tbody = document.getElementById("history-list");
  if (!tbody) return; // ถ้าไม่มีตาราง ก็ไม่ต้องทำอะไร

  tbody.innerHTML =
    '<tr><td colspan="5" style="text-align:center;">🔄 กำลังโหลดข้อมูล...</td></tr>';

  fetch("/api/my-borrowing")
    .then((res) => res.json())
    .then((data) => {
      tbody.innerHTML = ""; // ล้างข้อความโหลด

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">🚫 ไม่มีรายการที่กำลังยืมอยู่</td></tr>`;
        return;
      }

      data.forEach((item) => {
        const borrowDate = new Date(item.borrowdate).toLocaleDateString(
          "th-TH",
        );
        const dueDate = new Date(item.duedate).toLocaleDateString("th-TH");
        const imgSrc =
          item.image || item.sticker || "https://via.placeholder.com/50";

        tbody.innerHTML += `
            <tr>
                <td><img src="${imgSrc}" style="height:50px; object-fit:contain;"></td>
                <td>
                    <strong>${item.devicename}</strong><br>
                    <small style="color:#666">${item.stickerid}</small>
                </td>
                <td>${borrowDate}</td>
                <td style="color:#d35400; font-weight:bold;">${dueDate}</td>
                <td>
                    <button onclick="returnItem(${item.TSTID}, ${item.DVID})" 
                        style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">
                        คืนของ
                    </button>
                </td>
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
  // 1. log ดูว่าปุ่มทำงานไหม
  console.log("🔘 กดปุ่มคืนของ:", tstid, dvid);

  if (!confirm("ยืนยันที่จะคืนอุปกรณ์นี้?")) return;

  fetch("/api/return", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tstid, dvid }), // ส่ง ID ไปคู่กัน
  })
    .then((res) => res.json())
    .then((data) => {
      console.log("📩 Server ตอบกลับ:", data); // ดูว่า Server ตอบอะไร
      if (data.success) {
        alert("✅ คืนอุปกรณ์เรียบร้อย!");
        loadHistory(); // โหลดตารางใหม่
        // หรือใช้ location.reload(); ถ้าอยากรีเฟรชทั้งหน้า
      } else {
        alert("❌ เกิดข้อผิดพลาด: " + data.message);
      }
    })
    .catch((err) => {
      console.error("Fetch Error:", err);
      alert("Server connection failed");
    });
}
