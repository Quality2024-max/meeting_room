import "dotenv/config";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const signToken = (user) => {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    },
  );
};

export const readUser = (token) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // A guest token must never work as a real account login
    if (payload.guest) return null;
    return payload;
  } catch (e) {
    return null;
  }
};
// ---------- GUEST (invited candidate, no account) ----------
// Guest gets a short-lived token that is valid for ONE room only.

export const signGuestToken = ({ name, room }) => {
  return jwt.sign(
    { guest: true, gid: crypto.randomBytes(6).toString("hex"), name, room },
    process.env.JWT_SECRET,
    { expiresIn: "12h" },
  );
};

export const readGuest = (token) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.guest ? payload : null;
  } catch (e) {
    return null;
  }
};

// Makes req.user / res.locals.user available on every request
export function attachUser(req, res, next) {
  req.user = readUser(req.cookies.token);
  req.guest = req.user ? null : readGuest(req.cookies.guest_token);
  res.locals.user = req.user;
  res.locals.guest = req.guest;
  next();
}

export const requireAuth = (req, res, next) => {
  if (!req.user) return res.redirect("/login");
  next();
};
