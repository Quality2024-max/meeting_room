// server
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";

// ---------- IMPORT MIDDLEWARES ----------
import { attachUser } from "./middlewares/authMiddleware.js";
import authRoutes from "./routers/authRoutes.js";
import meetingRoutes from "./routers/meetingRoutes.js";
import recordingRoutes from "./routers/recordingRoutes.js";
import registerRoomSockets from "./sockets/roomSocket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1); // behind Render's proxy -> req.protocol becomes https

// ---------- VIEW ENGINE ----------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- BODY PARSING + COOKIES ----------
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

// ---------- STATIC FILES ----------
app.use(express.static(path.join(__dirname, "public")));

// ---------- JWT USER + GLOBAL VIEW VARIABLES ----------
app.use(attachUser);
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// ---------- ROUTES ----------
app.get("/", (req, res) => res.redirect(req.user ? "/dashboard" : "/login"));
app.use("/", authRoutes);
app.use("/", meetingRoutes);
app.use("/", recordingRoutes);

// ---------- 404 NOT FOUND ----------
app.use((req, res, next) => {
  res.status(404).render("errors/error", {
    title: "Page Not Found",
    code: 404,
    message: "Sorry, the page you are looking for does not exist.",
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
    message: "Something went wrong. Please try again.",
  });
});

// ---------- SERVER START (plain HTTP + Socket.IO) ----------
fs.mkdirSync(path.join(__dirname, "recordings"), { recursive: true });

const server = http.createServer(app);
const io = new Server(server);
registerRoomSockets(io);

process.on("unhandledRejection", (err) =>
  console.error("Unhandled rejection:", err),
);

//Server Starting
const PORT = process.env.PORT || 2000;
server.listen(PORT, () => {
  console.log(
    `Server is runing on http://localhost:${PORT}\nhttps://meeting-room-lunw.onrender.com/login`,
  );
});
