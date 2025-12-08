const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();

// لو حبيت تقدم ملفات فرونت من السيرفر
app.use(express.static("public"));

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

let clients = new Map(); // key = ws, value = {username}

function broadcastUserList() {
  const users = Array.from(clients.values()).map(u => u.username);
  const data = JSON.stringify({ type: "user_list", users });
  for (let client of clients.keys()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on("connection", (ws) => {

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message); } 
    catch (e) { return; }

    // تسجيل المستخدم عند الدخول
    if (data.type === "register") {
      clients.set(ws, { username: data.username });
      broadcastUserList();
      return;
    }

    // Chat message
    if (data.type === "chat") {
      // إذا message فردي
      if (data.to) {
        // نرسل فقط للشخص المحدد
        for (let [client, info] of clients.entries()) {
          if (info.username === data.to && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "chat",
              from: data.from,
              text: data.text
            }));
          }
        }
      }
      // جروب
      else if (data.group && data.group.length > 0) {
        for (let [client, info] of clients.entries()) {
          if (data.group.includes(info.username) && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "chat",
              from: data.from,
              text: data.text,
              group: true
            }));
          }
        }
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcastUserList();
  });
});
