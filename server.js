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

let clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("New client connected (total: " + clients.size + ")");

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message.toString()); }
    catch (e) { console.log("Non-JSON message ignored"); return; }

    if (!data.type) { console.log("Message without type ignored"); return; }

    // ================= CHAT =================
    if (data.type === "chat") {
      broadcast({ type:"chat", username:data.username, text:data.text });
    }

    // ================= CALCULATOR =================
    else if (data.type === "calc") {
      const reqId = data.requestId || null;
      const op = data.op;
      const payload = data.payload || {};
      const deg = !!data.deg;

      function toRad(v) { return deg ? (v*Math.PI)/180 : v; }
      function safeNum(v) { const n = Number(v); return isFinite(n)?n:NaN; }

      let res=null, error=null;
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

  ws.on("close", () => { clients.delete(ws); console.log("Client disconnected (total:"+clients.size+")"); });
  ws.on("error", () => { clients.delete(ws); console.log("Client error and removed"); });
});

function broadcast(obj) {
  const str = JSON.stringify(obj);
  for (let client of clients)
    if (client.readyState===WebSocket.OPEN)
      try { client.send(str); } catch(e) {}
}
