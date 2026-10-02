// server
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import authRoutes from "./routers/authRoutes.js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ---------- VIEW ENGINE ----------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- STATIC FILES ----------
app.use(express.static(path.join(__dirname, "public")));

// ---------- ROUTES ----------
app.get("/", (req, res) => res.redirect(req.user ? "/dashboard" : "/login"));
app.use("/", authRoutes);

//Server Starting
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => {
  console.log(`Server is runing on http://localhost:${PORT}`);
});
