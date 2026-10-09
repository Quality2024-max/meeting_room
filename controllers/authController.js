import bcrypt from "bcryptjs";
import User from "../models/userModel.js";
import { signToken } from "../middlewares/authMiddleware.js";

// Cookie options for authentication token
const cookieOpts = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000,
};

export const showLogin = (req, res) => {
  if (req.user) return res.redirect("/dashboard");
  res.render("auth/login", { error: null });
};

export const showRegister = (req, res) => {
  if (req.user) return res.redirect("/dashboard");
  res.render("auth/register", { error: null });
};

export const postRegister = async (req, res) => {
  const { name, email, password } = req.body;
  console.log(req.body);
  if (!name || !email || !password || password.length < 6) {
    return res.render("auth/register", {
      error: "Enter your name, email and a password of at least 6 characters.",
    });
  }
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (await User.findByEmail(cleanEmail)) {
      return res.render("auth/register", {
        error: "This email is already registered. Log in instead.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash,
    });

    res.cookie(
      "token",
      signToken({ id, name: cleanName, email: cleanEmail }),
      cookieOpts,
    );
    res.redirect("/login");
  } catch (error) {
    console.error(error);
    res.render("auth/register", {
      error: "Could not create the account. Try again.",
    });
  }
};

export const postLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findByEmail((email || "").trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password || "", user.password_hash))) {
      return res.render(auth / login, {
        error: "Email or password is incorrect.",
      });
    }
    res.cookie("token", signToken(user), cookieOpts);
    res.redirect("/dashboard");
  } catch (error) {
    console.error(error);
    res.render("auth/login", { error: "Could not log in. Try again." });
  }
};

export const logout = (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
};
