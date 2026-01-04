const WebSocket = require("ws");

const screen = new WebSocket("ws://localhost:8080/screen");
const types = {};
let textSamples = [];

screen.on("open", async () => {
  console.log("Connected, resetting display...");
  await fetch("http://localhost:8080/api/reset", {method: "POST"});
});

screen.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  types[msg.type] = (types[msg.type] || 0) + 1;
  if (msg.type === "text" && textSamples.length < 10) {
    textSamples.push({char: msg.char || String.fromCharCode(msg.charCode), code: msg.charCode, x: msg.x, y: msg.y});
  }
});

setTimeout(() => {
  console.log("Message types after reset:", types);
  console.log("Text samples:", textSamples);
  screen.close();
  process.exit(0);
}, 5000);
