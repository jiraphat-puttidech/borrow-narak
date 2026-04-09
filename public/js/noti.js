// ไฟล์: public/static/js/noti.js (หรือ public/js/noti.js)

document.addEventListener("DOMContentLoaded", () => {
  // 1. เสก CSS ของกระดิ่งเข้าสู่ระบบ
  const notiStyle = document.createElement("style");
  notiStyle.innerHTML = `
      .noti-wrapper { position: relative; margin-right: 15px; display: inline-flex; align-items: center; cursor: pointer; }
      .noti-bell { font-size: 22px; color: var(--text-muted); position: relative; transition: 0.2s; }
      .noti-bell:hover { color: var(--primary); transform: scale(1.1); }
      .noti-badge { position: absolute; top: -6px; right: -8px; background: var(--danger); color: white; font-size: 10px; font-weight: bold; padding: 2px 5px; border-radius: 12px; display: none; border: 2px solid white; }
      .noti-dropdown { position: absolute; top: 45px; right: -10px; background: white; width: 320px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); border: 1px solid var(--border); display: none; flex-direction: column; z-index: 1000; overflow: hidden; transform-origin: top right; animation: notiDrop 0.2s ease-out; }
      @keyframes notiDrop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      .noti-header { padding: 15px 20px; border-bottom: 1px solid var(--border); font-weight: bold; display: flex; justify-content: space-between; background: var(--bg); color: var(--text-main); font-size: 14px; }
      .noti-body { max-height: 350px; overflow-y: auto; }
      .noti-item { padding: 15px 20px; border-bottom: 1px solid var(--border); transition: 0.2s; display: flex; gap: 15px; }
      .noti-item:hover { background: var(--primary-light); }
      .noti-item.unread { background: #f8fafc; border-left: 4px solid var(--primary); padding-left: 16px; }
      .noti-icon { width: 38px; height: 38px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
      .noti-text { font-size: 13px; color: var(--text-main); margin: 0 0 5px 0; line-height: 1.4; }
      .noti-time { font-size: 11px; color: var(--text-muted); font-weight: 500; }
      .mark-read-btn { font-size: 12px; color: var(--primary); cursor: pointer; border: none; background: none; font-weight: 600; transition: 0.2s; }
      .mark-read-btn:hover { text-decoration: underline; }
    `;
  document.head.appendChild(notiStyle);

  // 2. เรียกฟังก์ชันสร้างกระดิ่ง
  initNotificationBell();
});

function initNotificationBell() {
  // หาตำแหน่งรูปโปรไฟล์ที่มุมขวาบน
  const profileElement =
    document.querySelector(".profile-link") ||
    document.querySelector(".user-profile");
  if (!profileElement || !profileElement.parentNode) return;

  const notiDiv = document.createElement("div");
  notiDiv.className = "noti-wrapper";
  notiDiv.innerHTML = `
          <div class="noti-bell" onclick="toggleNoti(event)">
              <i class="fas fa-bell"></i>
              <span class="noti-badge" id="noti-count">0</span>
          </div>
          <div class="noti-dropdown" id="noti-dropdown">
              <div class="noti-header">
                  <span>🔔 การแจ้งเตือน</span>
                  <button class="mark-read-btn" onclick="markNotiRead(event)">อ่านทั้งหมด</button>
              </div>
              <div class="noti-body" id="noti-list">
                  <div style="padding: 20px; text-align: center; color: #999;">กำลังโหลด...</div>
              </div>
          </div>
      `;

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "15px";

  profileElement.parentNode.insertBefore(wrapper, profileElement);
  wrapper.appendChild(notiDiv);
  wrapper.appendChild(profileElement);

  document.addEventListener("click", (e) => {
    const dd = document.getElementById("noti-dropdown");
    if (
      dd &&
      dd.style.display === "flex" &&
      !e.target.closest(".noti-wrapper")
    ) {
      dd.style.display = "none";
    }
  });

  loadNotifications();
  setInterval(loadNotifications, 30000); // เช็คใหม่ทุก 30 วิ
}

window.toggleNoti = function (e) {
  e.stopPropagation();
  const dd = document.getElementById("noti-dropdown");
  if (dd) dd.style.display = dd.style.display === "flex" ? "none" : "flex";
};

window.markNotiRead = function (e) {
  e.stopPropagation();
  fetch("/api/notifications/read", { method: "POST" })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        document.getElementById("noti-count").style.display = "none";
        loadNotifications();
      }
    });
};

window.loadNotifications = function () {
  fetch("/api/notifications")
    .then((res) => res.json())
    .then((data) => {
      const list = document.getElementById("noti-list");
      const badge = document.getElementById("noti-count");
      if (!list || !badge) return;

      list.innerHTML = "";
      let unreadCount = 0;

      if (data.length === 0) {
        list.innerHTML =
          '<div style="padding: 30px; text-align: center; color: #94a3b8;">ไม่มีการแจ้งเตือนใหม่ 🎉</div>';
      } else {
        data.forEach((item) => {
          if (!item.IsRead) unreadCount++;

          const dateObj = new Date(item.CreateDate);
          const timeStr =
            dateObj.toLocaleTimeString("th-TH", {
              hour: "2-digit",
              minute: "2-digit",
            }) + " น.";

          let icon = '<i class="fas fa-info"></i>';
          let bg = "var(--primary-light)";
          let color = "var(--primary)";

          if (item.Message.includes("อนุมัติ")) {
            icon = '<i class="fas fa-check"></i>';
            bg = "#dcfce7";
            color = "#16a34a";
          }
          if (item.Message.includes("ไม่อนุมัติ")) {
            icon = '<i class="fas fa-times"></i>';
            bg = "#fee2e2";
            color = "#dc2626";
          }
          if (item.Message.includes("คำขอยืม")) {
            icon = '<i class="fas fa-box-open"></i>';
            bg = "#fef3c7";
            color = "#ea580c";
          }
          if (item.Message.includes("รับคืน")) {
            icon = '<i class="fas fa-box"></i>';
            bg = "#e0e7ff";
            color = "#2563eb";
          }

          list.innerHTML += `
                      <div class="noti-item ${item.IsRead ? "" : "unread"}">
                          <div class="noti-icon" style="background:${bg}; color:${color};">${icon}</div>
                          <div>
                              <p class="noti-text">${item.Message}</p>
                              <span class="noti-time">${timeStr}</span>
                          </div>
                      </div>
                  `;
        });
      }

      if (unreadCount > 0) {
        badge.innerText = unreadCount > 9 ? "9+" : unreadCount;
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    })
    .catch((err) => console.error(err));
};
