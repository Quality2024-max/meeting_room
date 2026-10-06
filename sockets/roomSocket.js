import cookie from 'cookie';
import Meeting from '../models/meetingModel.js';
import ChatMessage from '../models/chatMessageModel.js';
import { readUser, readGuest } from '../middlewares/authMiddleware.js';

export default function registerRoomSockets(io) {

  // rooms whose host is recording right now (everybody in the room is told)
  const recordingRooms = new Set();

  // room code -> Set of guest ids that joined at least once (for the "joined so far" count)
  const guestsEver = new Map();

  // Tell the host(s) of a room which invited candidates (guests) are inside right now
  function sendGuestList(code) {
    if (!code) return;
    const ids = io.sockets.adapter.rooms.get(code) || new Set();
    const guests = [];
    const hosts = [];
    for (const id of ids) {
      const s = io.sockets.sockets.get(id);
      if (!s || !s.user) continue;
      if (s.isHost) hosts.push(s);
      else if (s.user.guest) guests.push({ id: s.id, name: s.user.name });
    }
    const payload = {
      guests,
      count: guests.length,
      joinedTotal: (guestsEver.get(code) || new Set()).size
    };
    hosts.forEach((h) => h.emit('guest-list', payload));
  }

  // =========================================================
  // JWT Authentication for Socket.IO
  // Same token cookie is used by HTTP and Socket.IO
  // =========================================================
  io.use((socket, next) => {
    try {
      const cookies = cookie.parse(
        socket.handshake.headers.cookie || ''
      );

      // Registered account first, otherwise an invited guest (no account)
      let user = readUser(cookies.token);

      if (!user) {
        const guest = readGuest(cookies.guest_token);
        if (guest) {
          // guest has no DB id: id stays null, guest flag + the one room it may enter
          user = { id: null, name: guest.name, guest: true, room: guest.room, gid: guest.gid };
        }
      }

      if (!user) {
        return next(new Error('unauthorized'));
      }

      // User information socket ke andar store kar rahe hain
      socket.user = user;

      next();

    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('unauthorized'));
    }
  });


  // =========================================================
  // New Socket Connection
  // =========================================================
  io.on('connection', (socket) => {

    console.log(
      `Socket connected: ${socket.id} | User: ${socket.user?.name}`
    );


    // =======================================================
    // JOIN ROOM
    // =======================================================
    socket.on('join-room', async (code) => {

      try {

        // -----------------------------------------------
        // Validate room code
        // -----------------------------------------------
        if (!code) {
          return socket.emit(
            'room-error',
            'Room code is required.'
          );
        }

        // -----------------------------------------------
        // Find meeting from database
        // -----------------------------------------------
        const meeting = await Meeting.findByCode(code);

        // -----------------------------------------------
        // Meeting doesn't exist / already ended
        // -----------------------------------------------
        if (!meeting || meeting.status === 'ended') {

          return socket.emit(
            'room-error',
            'Meeting not available.'
          );

        }


        // A guest may only enter the room named in their invite
        if (socket.user.guest && socket.user.room !== meeting.room_code) {
          return socket.emit('room-error', 'You are not invited to this meeting.');
        }

        // -----------------------------------------------
        // Store meeting information in socket
        // -----------------------------------------------
        // Leave the previous room if this socket joins again (reconnect / double emit)
        if (socket.roomCode && socket.roomCode !== code) {
          socket.leave(socket.roomCode);
          socket.to(socket.roomCode).emit('peer-left', { id: socket.id });
          sendGuestList(socket.roomCode);
        }

        socket.meetingId = meeting.id;
        socket.roomCode = code;

        // Only the account that created the meeting is the host.
        // Checked on the server so nobody can fake it from the browser.
        socket.isHost = !socket.user.guest && meeting.host_id === socket.user.id;


        // -----------------------------------------------
        // Join Socket.IO room
        // -----------------------------------------------
        socket.join(code);


        // -----------------------------------------------
        // Host joins scheduled meeting
        // Change status -> live
        // -----------------------------------------------
        if (
          socket.isHost &&
          meeting.status === 'scheduled'
        ) {

          await Meeting.markLive(meeting.id);

        }


        // =================================================
        // GET OTHER USERS ALREADY IN ROOM
        // =================================================

        const others = [];

        const roomSockets =
          io.sockets.adapter.rooms.get(code) || new Set();


        for (const id of roomSockets) {

          // Current socket ko skip karo
          if (id === socket.id) {
            continue;
          }


          // Socket safely get karo
          const otherSocket =
            io.sockets.sockets.get(id);


          // Socket disconnect ho chuka hai
          if (!otherSocket) {
            continue;
          }


          // User information available nahi hai
          if (!otherSocket.user) {
            continue;
          }


          // User list me add karo
          others.push({
            id: otherSocket.id,
            name: otherSocket.user.name || 'Unknown User',
            host: Boolean(otherSocket.isHost)
          });

        }


        console.log(
          `User ${socket.user.name} joined room ${code}`
        );

        console.log(
          'Existing peers:',
          others
        );


        // -----------------------------------------------
        // Send existing users to new user
        // -----------------------------------------------
        socket.emit('peers', others);

        if (recordingRooms.has(code)) {
          socket.emit('recording-state', { on: true });
        }


        // -----------------------------------------------
        // Notify existing users
        // -----------------------------------------------
        socket.to(code).emit(
          'peer-joined',
          {
            id: socket.id,
            name: socket.user.name,
            host: Boolean(socket.isHost)
          }
        );

        // Remember the guest and refresh the candidate list on the host's screen
        if (socket.user.guest) {
          if (!guestsEver.has(code)) guestsEver.set(code, new Set());
          guestsEver.get(code).add(socket.user.gid);
        }
        sendGuestList(code);


      } catch (error) {

        console.error(
          'Join room error:',
          error
        );

        socket.emit(
          'room-error',
          'Unable to join meeting.'
        );

      }

    });


    // =======================================================
    // WEBRTC SIGNALING
    // offer / answer / ICE candidate
    // =======================================================
    socket.on('signal', ({ to, data }) => {

      if (!to || !data) {
        return;
      }


      // Target socket exist karta hai ya nahi
      const targetSocket =
        io.sockets.sockets.get(to);


      // Only relay signals between sockets that are in the same room
      if (targetSocket && (!socket.roomCode || targetSocket.roomCode !== socket.roomCode)) {
        return;
      }

      if (!targetSocket) {
        console.log(
          `Signal target not found: ${to}`
        );

        return;
      }


      io.to(to).emit(
        'signal',
        {
          from: socket.id,
          name: socket.user?.name || 'Unknown User',
          host: Boolean(socket.isHost),
          data
        }
      );

    });


    // =======================================================
    // CHAT
    // =======================================================
    socket.on('chat', async (text) => {

      try {

        // User ne message nahi bheja
        const message = String(text || '')
          .trim()
          .slice(0, 1000);


        // Meeting join nahi ki hai
        if (!message || !socket.meetingId) {
          return;
        }


        // Save chat message in database
        await ChatMessage.create({
          meetingId: socket.meetingId,
          userId: socket.user.guest ? null : socket.user.id,
          guestName: socket.user.guest ? socket.user.name : null,
          message
        });


        // Send message to everyone in room
        io.to(socket.roomCode).emit(
          'chat',
          {
            name: socket.user.name,
            message,
            at: new Date().toISOString()
          }
        );


      } catch (error) {

        console.error(
          'Chat error:',
          error
        );

      }

    });


    // =======================================================
    // SCREEN SHARE (only tells others to show the tile bigger;
    // the video itself travels over WebRTC)
    // =======================================================
    socket.on('screen-share', (sharing) => {

      if (!socket.roomCode) {
        return;
      }

      socket.to(socket.roomCode).emit(
        'screen-share',
        {
          id: socket.id,
          sharing: Boolean(sharing)
        }
      );

    });


    // =======================================================
    // MIC STATE (so everybody can show who is muted)
    // =======================================================
    socket.on('mic-state', (payload) => {

      if (!socket.roomCode) {
        return;
      }

      socket.to(socket.roomCode).emit(
        'mic-state',
        {
          id: socket.id,
          muted: Boolean(payload && payload.muted)
        }
      );

    });


    // =======================================================
    // HOST CONTROLS - mute / unmute one user
    // Only the meeting host is allowed to use these.
    // =======================================================
    socket.on('host-mute', (payload) => {

      const { to, muted } = payload || {};

      if (!socket.isHost || !socket.roomCode || !to) {
        return;
      }

      const target = io.sockets.sockets.get(to);

      // Target must be in the same room as the host
      if (!target || target.roomCode !== socket.roomCode) {
        return;
      }

      target.emit('force-mute', { muted: Boolean(muted) });

    });


    // =======================================================
    // HOST CONTROLS - mute / unmute everybody else
    // =======================================================
    socket.on('host-mute-all', (payload) => {

      if (!socket.isHost || !socket.roomCode) {
        return;
      }

      socket.to(socket.roomCode).emit(
        'force-mute',
        { muted: Boolean(payload && payload.muted) }
      );

    });


    // =======================================================
    // RECORDING NOTICE - only the host may start/stop.
    // The recording itself is made in the host's browser;
    // this just tells everyone in the room that it is on.
    // =======================================================
    socket.on('recording-state', (payload) => {

      if (!socket.isHost || !socket.roomCode) {
        return;
      }

      const on = Boolean(payload && payload.on);

      if (on) {
        recordingRooms.add(socket.roomCode);
      } else {
        recordingRooms.delete(socket.roomCode);
      }

      socket.to(socket.roomCode).emit('recording-state', { on });

    });


    // =======================================================
    // DISCONNECT
    // =======================================================
    socket.on('disconnect', (reason) => {

      console.log(
        `Socket disconnected: ${socket.id} | Reason: ${reason}`
      );


      // Notify other users
      if (socket.roomCode) {

        if (socket.isHost && recordingRooms.has(socket.roomCode)) {
          recordingRooms.delete(socket.roomCode);
          socket.to(socket.roomCode).emit('recording-state', { on: false });
        }

        socket.to(socket.roomCode).emit(
          'peer-left',
          {
            id: socket.id
          }
        );

        sendGuestList(socket.roomCode);

      }

    });

  });

}
