/* ==================================================
   🌙 ระบบ Dark Mode (เวอร์ชันเบาที่สุด)
================================================== */
document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.innerHTML = `
        body { transition: background-color 0.3s ease, color 0.3s ease; }
        .theme-toggle-btn {
            position: fixed; bottom: 30px; right: 30px; z-index: 9999;
            width: 55px; height: 55px; border-radius: 50%;
            background: var(--primary, #ea580c); color: white;
            border: none; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            font-size: 24px; cursor: pointer; transition: transform 0.2s ease;
            display: flex; align-items: center; justify-content: center;
        }
        .theme-toggle-btn:hover { transform: scale(1.1); }
        body.dark-mode .theme-toggle-btn { 
            background: #1e293b !important; color: #facc15 !important; box-shadow: 0 4px 15px rgba(0,0,0,0.5) !important; 
        }
    `;
  document.head.appendChild(style);

  const btnTheme = document.createElement("button");
  btnTheme.className = "theme-toggle-btn";
  btnTheme.innerHTML = '<i class="fas fa-moon"></i>';
  document.body.appendChild(btnTheme);

  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    btnTheme.innerHTML = '<i class="fas fa-sun"></i>';
  }

  btnTheme.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    if (document.body.classList.contains("dark-mode")) {
      localStorage.setItem("theme", "dark");
      btnTheme.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
      localStorage.setItem("theme", "light");
      btnTheme.innerHTML = '<i class="fas fa-moon"></i>';
    }
  });
});
