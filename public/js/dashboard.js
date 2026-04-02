/* public/js/dashboard.js (อัปเกรดลูกเล่น SweetAlert2) */

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Dashboard Script Loaded");
  checkLogin();

  // 🌟 โหลด SweetAlert2 และแก้ปัญหาหน้ากระตุกอัตโนมัติ (ไม่ต้องใส่ใน HTML)
  if (!document.querySelector('script[src*="sweetalert2"]')) {
    const swalScript = document.createElement("script");
    swalScript.src = "https://cdn.jsdelivr.net/npm/sweetalert2@11";
    document.head.appendChild(swalScript);

    const swalStyle = document.createElement("style");
    swalStyle.innerHTML = `
      div:where(.swal2-container) { font-family: 'Kanit', sans-serif; }
      body.swal2-height-auto, html.swal2-height-auto { height: 100vh !important; }
      .swal2-container { padding-right: 0 !important; }
    `;
    document.head.appendChild(swalStyle);
  }

  if (document.getElementById("device-grid")) {
    loadDevices();
  }
  if (document.getElementById("history-list")) {
    loadHistory();
  }
  if (document.querySelector(".stats-grid")) {
    loadDashboardStats();
  }

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
      if (!data.recentTrans) return;

      if (document.getElementById("stat-trans"))
        document.getElementById("stat-trans").innerText = data.totalTrans || 0;
      if (document.getElementById("stat-pending"))
        document.getElementById("stat-pending").innerText =
          data.pendingReturn || 0;
      if (document.getElementById("stat-users"))
        document.getElementById("stat-users").innerText =
          data.totalMembers || 0;
      if (document.getElementById("stat-devices"))
        document.getElementById("stat-devices").innerText =
          data.totalDevices || 0;

      const userList = document.getElementById("recent-users-list");
      if (userList && data.recentUsers) {
        userList.innerHTML = "";
        if (data.recentUsers.length === 0) {
          userList.innerHTML =
            '<li style="color:#999; text-align:center;">ไม่มีผู้ใช้งาน</li>';
        } else {
          data.recentUsers.forEach((u) => {
            const userImg = u.image
              ? `/uploads/${u.image}`
              : "/static/default.png";
            let roleName = "User";
            let roleColor = "#3498db"; // สีฟ้าสำหรับ User ปกติ

            if (u.RoleID == 3) {
              roleName = "Super Admin";
              roleColor = "#db2777"; // สีชมพู/ม่วง สำหรับ Super Admin
            } else if (u.RoleID == 2) {
              roleName = "Admin";
              roleColor = "#e74c3c"; // สีแดง สำหรับ Admin
            }

            userList.innerHTML += `
    <li style="display:flex; align-items:center; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
        <img src="${userImg}" class="mini-avatar" style="width:35px; height:35px; border-radius:50%; object-fit:cover;" onerror="this.src='/static/default.png'">
        <div style="margin-left:10px; line-height:1.2;">
            <strong>${u.fname || u.username}</strong><br />
            <small style="color:${roleColor}; font-weight:bold;">${roleName}</small>
        </div>
    </li>`;
          });
        }
      }

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

          // ✅ เช็คกำหนดคืนเทียบกับวันปัจจุบัน
          const dueDateObj = new Date(item.duedate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          dueDateObj.setHours(0, 0, 0, 0);

          let statusBadge = "";

          // ✅ อัปเดตเงื่อนไขให้ฉลาดขึ้น (เพิ่มเงื่อนไขครบกำหนดวันนี้)
          if (item.Due_statusID == 6) {
            statusBadge =
              '<span style="color:#7f8c8d; font-weight:bold;">❌ ไม่อนุมัติ</span>';
          } else if (item.Due_statusID == 5) {
            statusBadge = '<span style="color:orange;">⏳ รออนุมัติ</span>';
          } else if (item.BorrowTransStatusID == 3 || item.Due_statusID == 4) {
            statusBadge = '<span style="color:green;">✅ คืนแล้ว</span>';
          } else if (
            item.Due_statusID == 3 ||
            (item.Due_statusID == 2 && today > dueDateObj)
          ) {
            statusBadge =
              '<span style="color:#e74c3c; font-weight:bold;">⚠️ เกินกำหนด</span>';
          } else if (
            item.Due_statusID == 2 &&
            today.getTime() === dueDateObj.getTime()
          ) {
            statusBadge =
              '<span style="background-color:#f39c12; color:white; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:bold;">⏰ ต้องคืนวันนี้</span>';
          } else {
            statusBadge = '<span style="color:blue;">📦 กำลังใช้งาน</span>';
          }

          const borrowerName = item.fname || item.username;
          tbody.innerHTML += `
            <tr>
                <td style="padding:10px;">${item.transaction_num || "-"}</td>
                <td style="padding:10px;">${item.devicename}</td>
                <td style="padding:10px;">${borrowerName}</td>
                <td style="padding:10px;">${statusBadge}</td>
                <td style="padding:10px;">${date}</td>
            </tr>`;
        });
      }
    })
    .catch((err) => console.error("Stats Error:", err));
}

/* ================= 3. ระบบโหลดข้อมูลอุปกรณ์ (✅ อัปเดต Filter หมวดหมู่) ================= */
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
        const statusClass = isAvailable ? "status-1" : "status-busy";
        const statusText = isAvailable
          ? "✅ ว่างพร้อมยืม"
          : "❌ ไม่ว่าง / รออนุมัติ";
        const btnText = isAvailable ? "📝 ส่งคำขอยืม" : "ถูกใช้งานอยู่";

        const btnAttr = isAvailable
          ? `onclick="openBorrowModal(${item.DVID}, '${item.devicename}', '${item.stickerid}')"`
          : 'disabled style="background-color:#ccc; cursor:not-allowed;"';

        // ✅ แอบใส่ data-category ไว้ที่กรอบนอกสุดของ Card เพื่อใช้ทำ Filter
        grid.innerHTML += `
            <div class="device-card" data-category="${item.CategoryID}" style="display:flex; flex-direction:column; padding-top: 20px;">
                <div class="card-body" style="padding: 20px; flex-grow:1; display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <h3 style="font-size: 18px; margin-bottom: 5px; color: var(--primary); font-weight: 600;">${item.devicename}</h3>
                        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 20px;">รหัสครุภัณฑ์: ${item.stickerid}</p>
                    </div>
                    
                    <div>
                        <div style="margin-bottom: 20px;">
                            <span class="device-status ${statusClass}" style="display:inline-block; padding:6px 14px; border-radius:20px; font-size:12px;">
                                ${statusText}
                            </span>
                        </div>
                        <button class="btn-borrow" ${btnAttr} style="width:100%; padding:12px; border:none; border-radius:8px; color:white; font-weight:600; cursor:${isAvailable ? "pointer" : "not-allowed"}; font-size:14px; background-color:${isAvailable ? "var(--primary)" : "#ccc"};">
                            ${btnText}
                        </button>
                    </div>
                </div>
            </div>`;
      });
    })
    .catch((err) => {
      grid.innerHTML = `<p style="color:red;">โหลดล้มเหลว: ${err.message}</p>`;
    });
}

// ✅ โค้ดที่เพิ่มใหม่: จัดการเวลา User กดปุ่ม Filter หมวดหมู่ (ไม่มีผลกระทบกับส่วนอื่น)
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("filter-btn")) {
    const filterValue = e.target.getAttribute("data-filter");
    const cards = document.querySelectorAll(".device-card");

    cards.forEach((card) => {
      // ถ้าเลือก 'all' หรือหมวดหมู่ตรงกับตัวเครื่อง ให้แสดง
      if (
        filterValue === "all" ||
        card.getAttribute("data-category") === filterValue
      ) {
        card.style.display = ""; // เอา none ออกเพื่อให้กลับไปแสดงผลแบบ flex เดิม
      } else {
        card.style.display = "none"; // ซ่อนตัวที่ไม่เกี่ยว
      }
    });
  }
});

/* ================= 4. ระบบ Modal & ยืมของ ================= */
function openBorrowModal(dvid, deviceName = "อุปกรณ์", stickerId = "-") {
  const modal = document.getElementById("borrowModal");
  if (modal) {
    document.getElementById("borrow-dvid").value = dvid;

    const previewName = document.getElementById("preview-name");
    const previewSticker = document.getElementById("preview-sticker");
    if (previewName) previewName.innerText = deviceName;
    if (previewSticker) previewSticker.innerText = "รหัสครุภัณฑ์: " + stickerId;

    const today = new Date();
    const todayInput = document.getElementById("borrow-today");
    if (todayInput) {
      const options = { year: "numeric", month: "short", day: "numeric" };
      todayInput.value = today.toLocaleDateString("th-TH", options);
    }

    const dueDateInput = document.getElementById("borrow-duedate");
    if (dueDateInput) {
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      dueDateInput.min = `${year}-${month}-${day}`;
      dueDateInput.value = "";
    }

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
    Swal.fire({
      icon: "warning",
      title: "ข้อมูลไม่ครบถ้วน",
      text: "กรุณากรอกข้อมูล วันที่คืน, สถานที่ และวัตถุประสงค์ให้ครบครับ",
    });
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
        Swal.fire({
          icon: "success",
          title: "ส่งคำขอสำเร็จ! 🎉",
          text: data.message,
          timer: 2000,
          showConfirmButton: false,
        });
        closeModal();
        loadDevices();
      } else {
        Swal.fire({
          icon: "error",
          title: "เกิดข้อผิดพลาด ❌",
          text: data.message,
        });
      }
    });
}

window.onclick = function (event) {
  const modal = document.getElementById("borrowModal");
  if (event.target == modal) modal.style.display = "none";
};

/* ================= 5. ระบบประวัติ (เพิ่มรูปภาพกลับมา) ================= */
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
            '<span style="color:#f39c12; font-size:12px; font-weight:bold;">⏳ รอรับของ</span>';
        } else {
          // ❌ เปลี่ยนจากปุ่มกดคืน เป็นข้อความบอกสถานะ เพื่อไม่ให้ User กดคืนเองได้
          returnBtn =
            '<span style="color:#2ecc71; font-size:12px; font-weight:bold;">✅ กำลังใช้งาน</span>';
        }

        const imgSrc =
          item.image &&
          item.image !== "default.png" &&
          !item.image.includes("http")
            ? `/uploads/${item.image}`
            : item.image && item.image.includes("http")
              ? item.image
              : "/static/default.png";

        tbody.innerHTML += `
            <tr>
                <td style="text-align:center;">
                    <img src="${imgSrc}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;" onerror="this.src='/static/default.png'">
                </td>
                <td><strong>${item.devicename}</strong><br><small style="color:#666">${item.stickerid}</small></td>
                <td>${borrowDate}</td>
                <td style="color:#d35400; font-weight:bold;">${dueDate}</td>
                <td>${returnBtn}</td>
            </tr>`;
      });
    })
    .catch((err) => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">❌ โหลดข้อมูลล้มเหลว</td></tr>`;
    });
}
