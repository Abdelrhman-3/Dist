const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();

// لو حبيت بعدين تخدم ملفات فرونت، ممكن تحط public folder
// app.use(express.static("public"));

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

// Map لتخزين اليوزرز مع WebSocket
let clients = new Map(); // Map<username, ws>

// Map لتخزين الشات الفردي
let privateChats = new Map(); // Map<user1_user2, [{from,to,text,time}]>

// Map لتخزين الشات للجروبات
let groupChats = new Map(); // Map<groupId, [{from,text,time}]>

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

      // إرسال قائمة المستخدمين
      broadcastUsers();

      // إرسال شات فردي محفوظ لكل يوزر
      privateChats.forEach((msgs, key) => {
        if (key.includes(thisUser)) {
          ws.send(JSON.stringify({ type: "chat_history", chatId: key, messages: msgs }));
        }
      });

      // إرسال شات جروبات محفوظة للمستخدم
      groupChats.forEach((msgs, groupId) => {
        if (groupId.includes(thisUser)) {
          ws.send(JSON.stringify({ type: "group_history", groupId, messages: msgs }));
        }
      });

      return;
    }

    // ================= شات =================
    if (data.type === "chat") {
      const timestamp = new Date().toISOString();

      // شات فردي
      if (data.to) {
        const chatKey = [thisUser, data.to].sort().join("_");
        if (!privateChats.has(chatKey)) privateChats.set(chatKey, []);
        const chatArray = privateChats.get(chatKey);
        chatArray.push({ from: thisUser, to: data.to, text: data.text, time: timestamp });

        // إرسال للمستقبل فقط
        const target = clients.get(data.to);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ type: "chat", from: thisUser, to: data.to, text: data.text, time: timestamp }));
        }
        // إرسال للمرسل
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "chat", from: thisUser, to: data.to, text: data.text, time: timestamp }));
        }
      }

      // شات جروب
      else if (data.group && Array.isArray(data.group)) {
        const groupId = data.group.sort().join("_");
        if (!groupChats.has(groupId)) groupChats.set(groupId, []);
        const chatArray = groupChats.get(groupId);
        chatArray.push({ from: thisUser, text: data.text, time: timestamp });

        data.group.forEach(u => {
          const target = clients.get(u);
          if (target && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify({ type: "group_chat", from: thisUser, groupId, text: data.text, time: timestamp }));
          }
        });

        // المرسل نفسه
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "group_chat", from: thisUser, groupId, text: data.text, time: timestamp }));
        }
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
