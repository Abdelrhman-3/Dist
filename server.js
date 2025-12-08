const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static("public")); // لو حابب تحط ملفات فرونت في public folder

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

let clients = new Map(); // Map<username, ws>
let privateChats = new Map(); // Map<chatKey, [{from,to,text,time}]>
let groupChats = new Map();   // Map<groupKey, [{from,text,time}]>

wss.on("connection", (ws) => {
  let thisUser = null;

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message.toString()); }
    catch (e) { console.log("Non-JSON message ignored"); return; }

    switch(data.type) {
      case "login":
        thisUser = data.username;
        clients.set(thisUser, ws);
        broadcastUserList();
        break;

      case "get_chat":
        if (!data.to) return;
        const chatKey = [thisUser, data.to].sort().join("_");
        ws.send(JSON.stringify({ type: "chat_history", chatId: chatKey, messages: privateChats.get(chatKey) || [] }));
        break;

      case "get_group_chat":
        if (!data.group) return;
        const groupKey = data.group.sort().join("_");
        ws.send(JSON.stringify({ type: "group_history", groupId: groupKey, messages: groupChats.get(groupKey) || [] }));
        break;

      case "chat":
        const { to, text, group } = data;
        const timestamp = Date.now();

        if (group && group.length > 1) {
          // جروب
          const gKey = group.sort().join("_");
          if (!groupChats.has(gKey)) groupChats.set(gKey, []);
          groupChats.get(gKey).push({ from: thisUser, text, time: timestamp });

          group.forEach(u => {
            if (clients.has(u) && clients.get(u).readyState === WebSocket.OPEN) {
              clients.get(u).send(JSON.stringify({ type: "group_message", groupId: gKey, from: thisUser, text, time: timestamp }));
            }
          });

        } else if (to) {
          // شات فردي
          const pKey = [thisUser, to].sort().join("_");
          if (!privateChats.has(pKey)) privateChats.set(pKey, []);
          privateChats.get(pKey).push({ from: thisUser, to, text, time: timestamp });

          [thisUser, to].forEach(u => {
            if (clients.has(u) && clients.get(u).readyState === WebSocket.OPEN) {
              clients.get(u).send(JSON.stringify({ type: "chat_message", chatId: pKey, from: thisUser, to, text, time: timestamp }));
            }
          });
        }
        break;
    }
  });

  ws.on("close", () => {
    if (thisUser) clients.delete(thisUser);
    broadcastUserList();
  });

  ws.on("error", () => {
    if (thisUser) clients.delete(thisUser);
    broadcastUserList();
  });
});

function broadcastUserList() {
  const users = Array.from(clients.keys());
  const msg = JSON.stringify({ type: "user_list", users });
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}
