module.exports = (req, res, next) => {
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
};
