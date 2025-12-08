const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static("public"));

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

let clients = new Map();          // Map<username, ws>
let privateChats = new Map();     // Map<chatKey, messages[]>
let groupChats = new Map();       // Map<groupKey, messages[]>
let userGroups = new Map();       // NEW: Map<username, groupKeys[]>

function addUserToGroup(username, groupKey) {
  if (!userGroups.has(username)) userGroups.set(username, []);
  const arr = userGroups.get(username);
  if (!arr.includes(groupKey)) arr.push(groupKey);
}

wss.on("connection", (ws) => {
  let thisUser = null;

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message.toString()); }
    catch { return; }

    switch(data.type) {

      /* ---------------- LOGIN ---------------- */
      case "login":
        thisUser = data.username;
        clients.set(thisUser, ws);
        broadcastUserList();
        sendUserGroups(thisUser);
        break;

      /* ------------ PRIV CHAT HISTORY -------- */
      case "get_chat":
        const chatKey = [thisUser, data.to].sort().join("_");
        ws.send(JSON.stringify({
          type: "chat_history",
          chatId: chatKey,
          messages: privateChats.get(chatKey) || []
        }));
        break;

      /* ------------ GROUP HISTORY ------------ */
      case "get_group_chat":
        const groupKey = data.group.sort().join("_");
        ws.send(JSON.stringify({
          type: "group_history",
          groupId: groupKey,
          messages: groupChats.get(groupKey) || []
        }));
        break;

      /* ------------ CREATE GROUP ------------- */
      case "create_group":
        const group = data.members.sort();
        const gKey = group.join("_");

        if (!groupChats.has(gKey)) groupChats.set(gKey, []);

        group.forEach(u => addUserToGroup(u, gKey));

        broadcastUserGroups();  // يخلي الجروب يظهر لكل الأعضاء
        break;

      /* --------------- SEND MSG -------------- */
      case "chat":
        const { to, text, group: groupList } = data;
        const time = Date.now();

        // GROUP MESSAGE
        if (groupList && groupList.length > 1) {
          const gKey2 = groupList.sort().join("_");

          if (!groupChats.has(gKey2)) groupChats.set(gKey2, []);
          groupChats.get(gKey2).push({ from: thisUser, text, time });

          groupList.forEach(u => {
            if (clients.has(u)) {
              clients.get(u).send(JSON.stringify({
                type: "group_message",
                groupId: gKey2,
                from: thisUser,
                text,
                time
              }));
            }
          });
          return;
        }

        // PRIVATE MESSAGE
        if (to) {
          const pKey = [thisUser, to].sort().join("_");
          if (!privateChats.has(pKey)) privateChats.set(pKey, []);

          privateChats.get(pKey).push({ from: thisUser, text, time });

          [thisUser, to].forEach(u => {
            if (clients.has(u)) {
              clients.get(u).send(JSON.stringify({
                type: "chat_message",
                chatId: pKey,
                from: thisUser,
                text,
                time
              }));
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

/* ---------- SEND USERS TO ALL ---------- */
function broadcastUserList() {
  const users = Array.from(clients.keys());
  const msg = JSON.stringify({ type: "user_list", users });

  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

/* -------- SEND GROUPS TO SPECIFIC USER ------- */
function sendUserGroups(user) {
  if (!clients.has(user)) return;

  const groups = userGroups.get(user) || [];
  clients.get(user).send(JSON.stringify({
    type: "group_list",
    groups
  }));
}

/* -------- BROADCAST GROUPS TO EVERYONE ------- */
function broadcastUserGroups() {
  clients.forEach((ws, user) => {
    sendUserGroups(user);
  });
}
