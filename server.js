const WebSocket = require("ws");
const express = require("express");

const PORT = process.env.PORT || 3000;
const app = express();
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const wss = new WebSocket.Server({ server });

// حفظ اليوزرز أونلاين: { username: ws }
let users = {};

wss.on("connection", ws => {

  ws.on("message", msg => {
    let data;
    try { data = JSON.parse(msg); } 
    catch(e) { return; }

    if(data.type === "register") {
      ws.username = data.username;
      users[data.username] = ws;
      broadcastUserList();
    }

    else if(data.type === "chat") {
      if(data.to) { 
        // شات فردي
        const target = users[data.to];
        if(target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ type:"chat", from:data.from, text:data.text }));
        }
        // رسائل الself تظهر عند المرسل نفسه
        ws.send(JSON.stringify({ type:"chat", from:data.from, text:data.text }));
      }
      else if(data.group) {
        // جروب شات
        data.group.forEach(u=>{
          const target = users[u];
          if(target && target.readyState===WebSocket.OPEN) {
            target.send(JSON.stringify({ type:"chat", from:data.from, text:data.text, group:data.group }));
          }
        });
        // المرسل يشوف رسالته أيضا
        ws.send(JSON.stringify({ type:"chat", from:data.from, text:data.text, group:data.group }));
      }
    }
  });

  ws.on("close", ()=> {
    if(ws.username) delete users[ws.username];
    broadcastUserList();
  });
  ws.on("error", ()=> {
    if(ws.username) delete users[ws.username];
    broadcastUserList();
  });
});

// إرسال قائمة اليوزرز أونلاين لكل الكلاينتس
function broadcastUserList() {
  const list = Object.keys(users);
  Object.values(users).forEach(u=>{
    if(u.readyState === WebSocket.OPEN) {
      u.send(JSON.stringify({ type:"user_list", users:list }));
    }
  });
}
