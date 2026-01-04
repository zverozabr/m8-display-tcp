const WebSocket = require("ws");

const screen = new WebSocket("ws://localhost:8080/screen");
let textSamples = [];

screen.on("open", async () => {
  console.log("Connected, resetting display...");
  await fetch("http://localhost:8080/api/reset", {method: "POST"});
});

screen.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "text" && msg.charCode !== 32 && textSamples.length < 20) {
    textSamples.push({
      char: msg.char || String.fromCharCode(msg.charCode),
      code: msg.charCode,
      x: msg.x,
      y: msg.y,
      fg: msg.fg
    });
  }
});

setTimeout(() => {
  console.log("Non-space text samples:");
  textSamples.forEach(s => console.log(`  '${s.char}' (${s.code}) at ${s.x},${s.y} color: rgb(${s.fg.r},${s.fg.g},${s.fg.b})`));
  screen.close();
  process.exit(0);
}, 5000);
