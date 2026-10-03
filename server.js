// server
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";

import { error } from "node:console";


// ---------- IMPORT MIDDLEWARES ----------
import {attachUser} from "./middlewares/authMiddleware.js";
import authRoutes from "./routers/authRoutes.js";
import meetingRoutes from "./routers/meetingRoutes.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ---------- VIEW ENGINE ----------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- BODY PARSING + COOKIES ----------
app.use(express.urlencoded({ extended: false}));
app.use(express.json());

// ---------- STATIC FILES ----------
app.use(express.static(path.join(__dirname, "public")));

// ---------- JWT USER + GLOBAL VIEW VARIABLES ----------
app.use(attachUser);
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
})

// ---------- ROUTES ----------
app.get("/", (req, res) => res.redirect(req.user ? "/dashboard" : "/login"));
app.use("/", authRoutes);
app.use("/", meetingRoutes);

 // ---------- 404 NOT FOUND ----------
app.use((req, res, next) => {
  res.status(404).render("errors/error", {
    title: "Page Not Found",
    code: 404,
    message: "Sorry, the page you are looking for does not exist."
  });
});

// ---------- GLOBAL ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).render("errors/error", {
    title: "Server Error",
    code: 500,
    message: "Something went wrong. Please try again."
  });
});

//Server Starting
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => {
  console.log(`Server is runing on http://localhost:${PORT}`);
});
