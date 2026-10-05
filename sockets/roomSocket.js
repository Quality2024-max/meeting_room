// Cookie se browser cookies read/parse karne ke liye
import * as cookie from "cookie";

// Meeting database operations ke liye
import Meeting from "../models/meetingModel.js";

// Chat messages database me save/read karne ke liye
import ChatMessage from "../models/chatMessageModel.js";

// JWT cookie se logged-in user ki information read karne ke liye
import { readUser } from "../middlewares/authMiddleware.js";

// =========================================================
// ROOM SOCKET HANDLER
// =========================================================

export default function registerRoomSockets(io) {
  // Active recording rooms store karta hai
  const recordingRooms = new Set();

  // =========================================================
  // SOCKET JWT AUTHENTICATION
  // =========================================================

  // Socket connection ko authenticate karta hai
  io.use((socket, next) => {
    try {
      // Browser cookies read karo
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");

      // JWT token se user read karo
      const user = readUser(cookies.token);

      // User valid nahi hai
      if (!user) {
        return next(new Error("unauthorized"));
      }

      // User information socket me save karo
      socket.user = user;

      next();
    } catch (error) {
      console.error("Socket authentication error:", error);

      next(new Error("unauthorized"));
    }
  });

  // =========================================================
  // NEW SOCKET CONNECTION
  // =========================================================

  // Jab user Socket.IO se connect ho
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id} | User: ${socket.user?.name}`);

    // =======================================================
    // JOIN ROOM
    // =======================================================

    // User meeting room join karta hai
    socket.on("join-room", async (code) => {
      try {
        // Room code check karo
        if (!code) {
          return socket.emit("room-error", "Room code is required.");
        }

        // Database se meeting find karo
        const meeting = await Meeting.findByCode(code);

        // Meeting available nahi hai
        if (!meeting || meeting.status === "ended") {
          return socket.emit("room-error", "Meeting not available.");
        }

        // Purane room se leave karo
        if (socket.roomCode && socket.roomCode !== code) {
          socket.leave(socket.roomCode);

          // Purane room ke users ko notify karo
          socket.to(socket.roomCode).emit("peer-left", { id: socket.id });
        }

        // Meeting information socket me save karo
        socket.meetingId = meeting.id;
        socket.roomCode = code;

        // Check karo user host hai ya nahi
        socket.isHost = meeting.host_id === socket.user.id;

        // Socket ko room me join karo
        socket.join(code);

        // Host join kare to meeting live karo
        if (
          meeting.host_id === socket.user.id &&
          meeting.status === "scheduled"
        ) {
          await Meeting.markLive(meeting.id);
        }

        // =================================================
        // EXISTING USERS
        // =================================================

        // Room ke existing users ki list
        const others = [];

        // Room ke saare connected sockets
        const roomSockets = io.sockets.adapter.rooms.get(code) || new Set();

        // Existing users ko check karo
        for (const id of roomSockets) {
          // Current user ko skip karo
          if (id === socket.id) {
            continue;
          }

          // Socket find karo
          const otherSocket = io.sockets.sockets.get(id);

          // Socket available nahi hai
          if (!otherSocket) {
            continue;
          }

          // User information available nahi hai
          if (!otherSocket.user) {
            continue;
          }

          // User ki basic details list me add karo
          others.push({
            id: otherSocket.id,
            name: otherSocket.user.name || "Unknown User",
            host: Boolean(otherSocket.isHost),
          });
        }

        console.log(`User ${socket.user.name} joined room ${code}`);

        console.log("Existing peers:", others);

        // New user ko existing users bhejo
        socket.emit("peers", others);

        // Agar recording already chal rahi hai
        if (recordingRooms.has(code)) {
          socket.emit("recording-state", { on: true });
        }

        // Existing users ko new user ki information do
        socket.to(code).emit("peer-joined", {
          id: socket.id,
          name: socket.user.name,
          host: Boolean(socket.isHost),
        });
      } catch (error) {
        console.error("Join room error:", error);

        // Client ko error bhejo
        socket.emit("room-error", "Unable to join meeting.");
      }
    });

    // =======================================================
    // WEBRTC SIGNALING
    // =======================================================

    // WebRTC offer/answer/ICE candidate forward karta hai
    socket.on("signal", ({ to, data }) => {
      // Required data check karo
      if (!to || !data) {
        return;
      }

      // Target socket find karo
      const targetSocket = io.sockets.sockets.get(to);

      // Sirf same room ke users ko signal bhejne do
      if (
        targetSocket &&
        (!socket.roomCode || targetSocket.roomCode !== socket.roomCode)
      ) {
        return;
      }

      // Target user connected nahi hai
      if (!targetSocket) {
        console.log(`Signal target not found: ${to}`);

        return;
      }

      // Signal target user ko bhejo
      io.to(to).emit("signal", {
        from: socket.id,
        name: socket.user?.name || "Unknown User",
        host: Boolean(socket.isHost),
        data,
      });
    });

    // =======================================================
    // CHAT
    // =======================================================

    // Chat message receive karo
    socket.on("chat", async (text) => {
      try {
        // Message clean aur limit karo
        const message = String(text || "")
          .trim()
          .slice(0, 1000);

        // User room me nahi hai
        if (!message || !socket.meetingId) {
          return;
        }

        // Chat message database me save karo
        await ChatMessage.create({
          meetingId: socket.meetingId,
          userId: socket.user.id,
          message,
        });

        // Message room ke sabhi users ko bhejo
        io.to(socket.roomCode).emit("chat", {
          name: socket.user.name,
          message,
          at: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Chat error:", error);
      }
    });

    // =======================================================
    // SCREEN SHARE
    // =======================================================

    // Screen sharing ka status broadcast karta hai
    socket.on("screen-share", (sharing) => {
      // Room join nahi kiya
      if (!socket.roomCode) {
        return;
      }

      // Baaki users ko screen-share status bhejo
      socket.to(socket.roomCode).emit("screen-share", {
        id: socket.id,
        sharing: Boolean(sharing),
      });
    });

    // =======================================================
    // MIC STATE
    // =======================================================

    // User ke mic ka status broadcast karta hai
    socket.on("mic-state", (payload) => {
      // Room join nahi kiya
      if (!socket.roomCode) {
        return;
      }

      // Baaki users ko mute status bhejo
      socket.to(socket.roomCode).emit("mic-state", {
        id: socket.id,
        muted: Boolean(payload && payload.muted),
      });
    });

    // =======================================================
    // HOST MUTE USER
    // =======================================================

    // Host kisi ek user ko mute/unmute karta hai
    socket.on("host-mute", (payload) => {
      const { to, muted } = payload || {};

      // Sirf host ye action kar sakta hai
      if (!socket.isHost || !socket.roomCode || !to) {
        return;
      }

      // Target user find karo
      const target = io.sockets.sockets.get(to);

      // Target same room me hona chahiye
      if (!target || target.roomCode !== socket.roomCode) {
        return;
      }

      // Target ko mute command bhejo
      target.emit("force-mute", {
        muted: Boolean(muted),
      });
    });

    // =======================================================
    // HOST MUTE ALL
    // =======================================================

    // Host sabhi users ko mute/unmute karta hai
    socket.on("host-mute-all", (payload) => {
      // Sirf host allowed hai
      if (!socket.isHost || !socket.roomCode) {
        return;
      }

      // Sabhi users ko mute command bhejo
      socket.to(socket.roomCode).emit("force-mute", {
        muted: Boolean(payload && payload.muted),
      });
    });

    // =======================================================
    // RECORDING STATE
    // =======================================================

    // Host recording start/stop karta hai
    socket.on("recording-state", (payload) => {
      // Sirf host recording control kar sakta hai
      if (!socket.isHost || !socket.roomCode) {
        return;
      }

      // Recording status check karo
      const on = Boolean(payload && payload.on);

      // Recording room list update karo
      if (on) {
        recordingRooms.add(socket.roomCode);
      } else {
        recordingRooms.delete(socket.roomCode);
      }

      // Baaki users ko recording status bhejo
      socket.to(socket.roomCode).emit("recording-state", { on });
    });

    // =======================================================
    // DISCONNECT
    // =======================================================

    // User socket se disconnect ho gaya
    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} | Reason: ${reason}`);

      // Agar user room me tha
      if (socket.roomCode) {
        // Host disconnect ho to recording stop karo
        if (socket.isHost && recordingRooms.has(socket.roomCode)) {
          recordingRooms.delete(socket.roomCode);

          socket.to(socket.roomCode).emit("recording-state", { on: false });
        }

        // Baaki users ko user leave hone ki info do
        socket.to(socket.roomCode).emit("peer-left", {
          id: socket.id,
        });
      }
    });
  });
}
