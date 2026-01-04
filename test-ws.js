const WebSocket = require("ws");

const screen = new WebSocket("ws://localhost:8080/screen");
const types = {};
let started = false;

screen.on("open", async () => {
  console.log("Connected, pressing key...");
  await fetch("http://localhost:8080/api/key/left", {method: "POST"});
  started = true;
});

screen.on("message", (data) => {
  if (!started) return;
  const msg = JSON.parse(data.toString());
  types[msg.type] = (types[msg.type] || 0) + 1;
  if (msg.type === "text") {
    console.log("TEXT:", msg.charCode, String.fromCharCode(msg.charCode));
  }
});

setTimeout(() => {
  console.log("Message types after key press:", types);
  screen.close();
  process.exit(0);
}, 3000);
