// server
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";

import registerRoomSockets from "./sockets/roomSocket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

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
  console.log(`Server is runing on http://localhost:${PORT}`);
});
