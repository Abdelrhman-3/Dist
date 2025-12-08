const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

// map username -> ws
let users = {};

wss.on("connection", (ws) => {
  let currentUsername = null;

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message.toString()); }
    catch (e) { console.log("Non-JSON message ignored"); return; }

    if (!data.type) return;

    // تسجيل اليوزر
    if (data.type === "register") {
      currentUsername = data.username;
      users[currentUsername] = ws;
      broadcastUserList();
      return;
    }

    // شات فردي أو جروب
    if (data.type === "chat") {
      if (data.to) {
        // رسالة فردية
        if (users[data.to] && users[data.to].readyState === WebSocket.OPEN)
          users[data.to].send(JSON.stringify({ type:"chat", from:data.from, text:data.text }));

        // نرسل للمرسل نفسه
        if (users[data.from] && users[data.from].readyState === WebSocket.OPEN)
          users[data.from].send(JSON.stringify({ type:"chat", from:data.from, text:data.text }));
      } 
      else if (data.group && Array.isArray(data.group)) {
        // جروب
        data.group.forEach(u => {
          if (users[u] && users[u].readyState === WebSocket.OPEN)
            users[u].send(JSON.stringify({ type:"chat", from:data.from, text:data.text }));
        });
        // نسخة للمرسل
        if (users[data.from] && users[data.from].readyState === WebSocket.OPEN)
          users[data.from].send(JSON.stringify({ type:"chat", from:data.from, text:data.text }));
      }
    }
  });

  ws.on("close", () => {
    if (currentUsername) {
      delete users[currentUsername];
      broadcastUserList();
    }
  });

  ws.on("error", () => {
    if (currentUsername) {
      delete users[currentUsername];
      broadcastUserList();
    }
  });
});

// تحديث قائمة اليوزرز لجميع المستخدمين
function broadcastUserList() {
  const list = Object.keys(users);
  list.forEach(u => {
    if (users[u].readyState === WebSocket.OPEN)
      users[u].send(JSON.stringify({ type:"user_list", users: list }));
  });
}
