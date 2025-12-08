const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();

// لو حبيت بعدين تخدم ملفات فرونت
app.use(express.static("public"));

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Map<username, ws>
let clients = new Map();
// حفظ الشات لكل شخص أو جروب
let chats = {}; // { "user1_user2": [messages], "groupId": [messages] }
let groups = {}; // { groupId: {name, members: [username] } }

wss.on("connection", (ws) => {
  let thisUser = null;

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message.toString()); }
    catch(e){ console.log("Invalid JSON"); return; }

    if(!data.type) return;

    switch(data.type) {
      case "login":
        thisUser = data.username;
        clients.set(thisUser, ws);
        broadcastUserList();
        break;

      case "chat":
        const { to, text } = data; // to ممكن يكون user أو groupId
        const msgObj = { from: thisUser, text };

        // حفظ الرسالة
        if(!chats[to]) chats[to] = [];
        chats[to].push(msgObj);

        // إرسال للمتلقيين
        if(groups[to]) {
          groups[to].members.forEach(member => {
            const client = clients.get(member);
            if(client && client.readyState === WebSocket.OPEN) client.send(JSON.stringify({type:"chat", to, msg: msgObj}));
          });
        } else {
          // شات فردي
          const client = clients.get(to);
          if(client && client.readyState === WebSocket.OPEN) client.send(JSON.stringify({type:"chat", to, msg: msgObj}));
          // لازم يظهر للمرسل كمان
          if(clients.get(thisUser) && clients.get(thisUser).readyState===WebSocket.OPEN)
            clients.get(thisUser).send(JSON.stringify({type:"chat", to, msg: msgObj}));
        }
        break;

      case "getHistory":
        const key = data.to;
        const history = chats[key] || [];
        ws.send(JSON.stringify({type:"history", to: key, messages: history}));
        break;

      case "createGroup":
        const groupId = "group_" + Date.now();
        groups[groupId] = { name: data.name, members: data.members };
        broadcastUserList(); // تحديث للجميع
        break;
    }
  });

  ws.on("close", () => {
    if(thisUser) {
      clients.delete(thisUser);
      broadcastUserList();
    }
  });

  ws.on("error", () => {
    if(thisUser) {
      clients.delete(thisUser);
      broadcastUserList();
    }
  });
});

function broadcastUserList() {
  const online = Array.from(clients.keys());
  const obj = { type:"userList", users: online, groups };
  for(let client of clients.values()) {
    if(client.readyState === WebSocket.OPEN) client.send(JSON.stringify(obj));
  }
}
