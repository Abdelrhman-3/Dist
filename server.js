const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();

// لو حبيت بعدين تخدم ملفات فرونت، ممكن تحط public folder
// app.use(express.static("public"));

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Map لتخزين اليوزرز مع الـ WebSocket الخاص بهم
let clients = new Map(); // Map<username, ws>

wss.on("connection", (ws) => {
  let thisUser = null;

  console.log("New client connected");

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message.toString()); } 
    catch(e) { console.log("Invalid JSON message"); return; }

    // ================= تسجيل الدخول =================
    if (data.type === "login") {
      thisUser = data.username;
      clients.set(thisUser, ws);
      console.log(`User logged in: ${thisUser}`);
      broadcastUsers();
      return;
    }

    // ================= شات =================
    if (data.type === "chat") {
      // شات فردي
      if (data.to) {
        const target = clients.get(data.to);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(data));
        }
      }
      // شات جروب
      else if (data.group && Array.isArray(data.group)) {
        data.group.forEach(u => {
          const target = clients.get(u);
          if (target && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify(data));
          }
        });
      }
      // إظهار الرسالة عند المرسل أيضاً
      if (thisUser && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    }

  });

  ws.on("close", () => { 
    if (thisUser) {
      clients.delete(thisUser); 
      console.log(`User disconnected: ${thisUser}`);
      broadcastUsers();
    }
  });

  ws.on("error", () => { 
    if (thisUser) {
      clients.delete(thisUser); 
      console.log(`User error & removed: ${thisUser}`);
      broadcastUsers();
    }
  });
});

// إرسال قائمة المستخدمين أونلاين لكل الكلاينتس
function broadcastUsers() {
  const list = Array.from(clients.keys());
  const msg = JSON.stringify({ type:"users", list });
  clients.forEach(ws => { 
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}
