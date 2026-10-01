// server
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();



//Server Starting
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => {
  console.log(`Server is runing on http://localhost:${PORT}`);
});
