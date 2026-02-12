/* public/static/js/profile.js */

document.addEventListener("DOMContentLoaded", () => {
  fetchProfileData();
});

function fetchProfileData() {
  // ดึงข้อมูลจาก API ที่เราทำไว้
  fetch("/api/my-profile")
    .then((res) => res.json())
    .then((data) => {
      if (data.error) {
        alert("กรุณาเข้าสู่ระบบ");
        window.location.href = "/"; // เด้งกลับ
        return;
      }

      // 1. ใส่ข้อมูลลงในหน้าเว็บ
      setText("p-fullname", data.fname + " " + data.lname);
      setText("p-emp-id", data.EMP_NUM || "-");
      setText("p-username", data.username);
      setText("p-email", data.email || "ไม่ระบุ");
      setText("p-phone", data.phone || "ไม่ระบุ");

      // รวมชื่อสำนักและฝ่าย
      const deptText =
        (data.InstitutionName || "") + " / " + (data.DepartmentName || "");
      setText("p-dept", deptText);

      // 2. จัดการ Role (2=Admin, อื่นๆ=User)
      const roleEl = document.getElementById("p-role");
      if (roleEl) {
        roleEl.innerText =
          data.RoleID == 2 ? "👑 ผู้ดูแลระบบ" : "👤 พนักงานทั่วไป";
      }

      // 3. จัดการรูปภาพ
      const imgEl = document.getElementById("p-img");
      if (imgEl) {
        // ถ้ามีรูปใน database ให้ใช้ /uploads/รูป
        // ถ้าไม่มี ให้ใช้ /static/default.png
        imgEl.src = data.image
          ? `/uploads/${data.image}`
          : "/static/default.png";

        // กันเหนียว: ถ้ารูปโหลดไม่ได้ ให้ใช้ Default
        imgEl.onerror = () => {
          imgEl.src = "/static/default.png";
        };
      }
    })
    .catch((err) => console.error("Error:", err));
}

// ฟังก์ชันช่วยใส่ข้อความ (จะได้ไม่ต้องพิมพ์ยาวๆ)
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}
