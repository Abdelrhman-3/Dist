const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();

const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const wss = new WebSocket.Server({ server });

let clients = new Map(); // Map<ws, username>
let groups = {}; // { groupName: Set<username> }

wss.on("connection", (ws) => {
  console.log("New connection");

  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg.toString()); }
    catch { return; }

    if (!data.type) return;

    // ================= USER REGISTER =================
    if (data.type === "register") {
      clients.set(ws, data.username);
      broadcastUserList();
    }

    // ================= PRIVATE CHAT =================
    else if (data.type === "private_chat") {
      // data.to = username
      for (let [client, uname] of clients) {
        if (uname === data.to && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "private_chat",
            from: data.from,
            text: data.text
          }));
        }
      }
    }

    // ================= GROUP CHAT =================
    else if (data.type === "group_chat") {
      const group = groups[data.group];
      if (!group) return;
      for (let [client, uname] of clients) {
        if (group.has(uname) && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "group_chat",
            from: data.from,
            group: data.group,
            text: data.text
          }));
        }
      }
    }

    // ================= CREATE GROUP =================
    else if (data.type === "create_group") {
      const name = data.group;
      groups[name] = new Set(data.members); // members = [username1, username2]
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcastUserList();
  });

  ws.on("error", () => {
    clients.delete(ws);
    broadcastUserList();
  });
});

function broadcastUserList() {
  const userList = Array.from(clients.values());
  for (let [client] of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "user_list", users: userList }));
    }
  }
}
