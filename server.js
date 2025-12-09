const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.static("public"));

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


const wss = new WebSocket.Server({ server });

let clients = new Map();         
let privateChats = new Map();    
let groupChats = new Map();      
let userGroups = new Map();       

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

    if (!data.type) return;


    if (data.type === "login") {
      thisUser = data.username;
      clients.set(thisUser, ws);
      broadcastUserList();
      sendUserGroups(thisUser);
    }


    else if (data.type === "get_chat") {
      const chatKey = [thisUser, data.to].sort().join("_");
      ws.send(JSON.stringify({
        type: "chat_history",
        chatId: chatKey,
        messages: privateChats.get(chatKey) || []
      }));
    }


    else if (data.type === "get_group_chat") {
      const groupKey = data.group.sort().join("_");
      ws.send(JSON.stringify({
        type: "group_history",
        groupId: groupKey,
        messages: groupChats.get(groupKey) || []
      }));
    }

    else if (data.type === "create_group") {
      const group = data.members.sort();
      const gKey = group.join("_");

      if (!groupChats.has(gKey)) groupChats.set(gKey, []);
      group.forEach(u => addUserToGroup(u, gKey));
      broadcastUserGroups();  
    }


    else if (data.type === "chat") {
      const { to, text, group: groupList } = data;
      const time = Date.now();


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
      }


      else if (to) {
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
    }

    else if (data.type === "calc") {
      const reqId = data.requestId || null;
      const op = data.op;
      const payload = data.payload || {};
      const deg = !!data.deg;

      function toRad(v){ return deg ? (v*Math.PI)/180 : v; }
      function safeNum(v){ const n = Number(v); return isFinite(n)?n:NaN; }

      let res = null, error = null;
      try {
        switch(op){
          case "add": res = safeNum(payload.x)+safeNum(payload.y); break;
          case "sub": res = safeNum(payload.x)-safeNum(payload.y); break;
          case "mul": res = safeNum(payload.x)*safeNum(payload.y); break;
          case "div": res = safeNum(payload.y)===0?"Division by zero":safeNum(payload.x)/safeNum(payload.y); break;
          case "pow": res = Math.pow(safeNum(payload.x), safeNum(payload.y)); break;
          case "sqrt": res = Math.sqrt(safeNum(payload.x)); break;
          case "log": res = Math.log10(safeNum(payload.x)); break;
          case "ln": res = Math.log(safeNum(payload.x)); break;
          case "sin": res = Math.sin(toRad(safeNum(payload.x))); break;
          case "cos": res = Math.cos(toRad(safeNum(payload.x))); break;
          case "tan": res = Math.tan(toRad(safeNum(payload.x))); break;
          default: error="Unknown operation";
        }
        if(isNaN(res)) error="Invalid number";
      } catch(e){ error="Calculation error"; }

      ws.send(JSON.stringify({ type:"calc_result", requestId:reqId, result:res, error:error }));
    }

  });

  ws.on("close", () => {
    if(thisUser) clients.delete(thisUser);
    broadcastUserList();
  });

  ws.on("error", () => {
    if(thisUser) clients.delete(thisUser);
    broadcastUserList();
  });

});


function broadcastUserList() {
  const users = Array.from(clients.keys());
  const msg = JSON.stringify({ type: "user_list", users });
  clients.forEach(ws => {
    if(ws.readyState===WebSocket.OPEN) ws.send(msg);
  });
}

function sendUserGroups(user) {
  if (!clients.has(user)) return;
  const groups = userGroups.get(user) || [];
  clients.get(user).send(JSON.stringify({ type:"group_list", groups }));
}

function broadcastUserGroups() {
  clients.forEach((ws, user) => {
    sendUserGroups(user);
  });
}
