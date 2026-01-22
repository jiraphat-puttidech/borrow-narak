document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Dashboard Script Loaded");
  checkLogin();
  loadDevices();

  // ตั้งค่า Date Picker ไม่ให้เลือกวันย้อนหลัง
  const today = new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("borrow-duedate");
  if (dateInput) {
    dateInput.setAttribute("min", today);
  }
});

/* ================= 1. ระบบ Login & User ================= */
function checkLogin() {
  fetch("/api/user")
    .then((res) => res.json())
    .then((data) => {
      if (!data.loggedIn) {
        window.location.href = "/"; // ถ้าไม่ได้ล็อกอิน ดีดกลับหน้าแรก
      } else {
        // แสดงชื่อผู้ใช้
        const nameEl = document.getElementById("user-name");
        if (nameEl) nameEl.innerText = data.fullname;
      }
    })
    .catch((err) => console.error("Login Check Error:", err));
}

/* ================= 2. ระบบโหลดข้อมูลอุปกรณ์ ================= */
function loadDevices() {
  const grid = document.getElementById("device-grid");
  if (!grid) {
    console.error("❌ ไม่พบ element id='device-grid' ในหน้า HTML");
    return;
  }

  // ขึ้นข้อความกำลังโหลด
  grid.innerHTML = "<p>🔄 กำลังโหลดข้อมูล...</p>";

  fetch("/api/devices")
    .then((res) => {
      if (!res.ok) throw new Error("Server Error (500)"); // เช็คก่อนว่า Server ตอบ OK ไหม
      return res.json();
    })
    .then((devices) => {
      grid.innerHTML = ""; // ล้างข้อความกำลังโหลด

      // ✅ เช็ค: ถ้า devices ไม่ใช่ Array (เช่น เป็น Error Object) ให้หยุด
      if (!Array.isArray(devices)) {
        console.error("ข้อมูลที่ได้ไม่ใช่อาร์เรย์:", devices);
        grid.innerHTML =
          '<p style="color:red;">เกิดข้อผิดพลาดในการดึงข้อมูล</p>';
        return;
      }

      if (devices.length === 0) {
        grid.innerHTML = '<p style="padding:20px;">🚫 ไม่พบอุปกรณ์ในระบบ</p>';
        return;
      }

      // ✅ ส่วนที่ผมเติมให้เต็มครับ (Loop สร้างการ์ด)
      devices.forEach((item) => {
        // 1. เช็คสถานะ (1 = ว่าง)
        const isAvailable = item.DVStatusID === 1;

        // 2. กำหนดหน้าตาตามสถานะ
        const statusClass = isAvailable ? "status-available" : "status-busy";
        const statusText = isAvailable
          ? "✅ ว่างพร้อมยืม"
          : "❌ ไม่ว่าง / ถูกยืม";

        // 3. กำหนดปุ่ม (ถ้าไม่ว่าง ให้กดไม่ได้)
        const btnAttr = isAvailable
          ? `onclick="borrowItem(${item.DVID})"`
          : 'disabled style="background-color:#ccc; cursor:not-allowed;"';
        const btnText = isAvailable ? "ทำรายการเบิก" : "ถูกใช้งานอยู่";

        // 4. เช็ครูปภาพ (รองรับทั้ง image และ sticker กันพลาด)
        const imgSrc =
          item.image ||
          item.sticker ||
          "https://via.placeholder.com/150?text=No+Image";

        // 5. สร้าง HTML การ์ด
        const cardHTML = `
            <div class="device-card">
                <div class="card-img-wrapper" style="text-align:center; padding:10px;">
                    <img src="${imgSrc}" style="max-width:100%; height:150px; object-fit:contain;">
                </div>
                <div class="card-body" style="padding:15px;">
                    <h3 style="font-size:18px; margin-bottom:5px;">${item.devicename}</h3>
                    <p style="color:#777; font-size:13px; margin-bottom:10px;">รหัส: ${item.stickerid}</p>
                    
                    <span class="status-badge ${statusClass}" 
                          style="display:inline-block; padding:5px 10px; border-radius:15px; font-size:12px; margin-bottom:15px;">
                        ${statusText}
                    </span>

                    <button class="btn-borrow" ${btnAttr} style="width:100%; padding:10px; border:none; border-radius:5px; color:white; font-weight:bold; cursor:pointer;">
                        ${btnText}
                    </button>
                </div>
            </div>
        `;

        // 6. ยัดใส่กล่อง HTML
        grid.innerHTML += cardHTML;
      });
    })
    .catch((err) => {
      console.error("Load Devices Error:", err);
      grid.innerHTML = `<p style="color:red;">โหลดข้อมูลไม่สำเร็จ: ${err.message}</p>`;
    });
}

/* ================= 3. ระบบ Modal & ยืมของ ================= */

// เปิด Modal เมื่อกดปุ่มที่การ์ด
function borrowItem(dvid) {
  const modal = document.getElementById("borrowModal");
  const inputId = document.getElementById("borrow-dvid");

  if (modal && inputId) {
    inputId.value = dvid; // ฝาก ID ไว้ใน Hidden Input
    modal.style.display = "flex"; // โชว์ Modal
  }
}

// ปิด Modal
function closeModal() {
  const modal = document.getElementById("borrowModal");
  if (modal) modal.style.display = "none";
}

// ยืนยันการยืม (เมื่อกด Submit Form)
function confirmBorrow(event) {
  event.preventDefault(); // ห้ามรีเฟรชหน้า

  const dvid = document.getElementById("borrow-dvid").value;
  const duedate = document.getElementById("borrow-duedate").value;
  const location = document.getElementById("borrow-location").value;
  const purpose = document.getElementById("borrow-purpose").value;

  // ตรวจสอบข้อมูลเบื้องต้น
  if (!duedate || !location || !purpose) {
    alert("กรุณากรอกข้อมูลให้ครบทุกช่องครับ");
    return;
  }

  // ส่งข้อมูลไปที่ Server
  fetch("/api/borrow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dvid: dvid,
      duedate: duedate,
      location: location,
      purpose: purpose,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("🎉 " + data.message);
        closeModal();
        loadDevices(); // โหลดข้อมูลใหม่ (สถานะของจะเปลี่ยนเป็นไม่ว่างทันที)
      } else {
        alert("❌ " + data.message);
      }
    })
    .catch((err) => {
      console.error("Borrow Error:", err);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    });
}

// ปิด Modal เมื่อคลิกพื้นหลังสีดำ
window.onclick = function (event) {
  const modal = document.getElementById("borrowModal");
  if (event.target == modal) {
    modal.style.display = "none";
  }
};
