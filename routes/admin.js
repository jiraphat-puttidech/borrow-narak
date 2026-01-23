const express = require("express");
const router = express.Router();
const path = require("path");

/* middleware เช็ก admin (เขียนตรงนี้เลย) */
function isAdmin(req, res, next) {
  if (
    req.session &&
    req.session.login &&
    req.session.user &&
    req.session.user.role === 2
  ) {
    next();
  } else {
    res.redirect("/");
  }
}

router.get("/admin", isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin.html"));
});

module.exports = router;
