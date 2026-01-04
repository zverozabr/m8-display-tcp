const WebSocket = require("ws");
const fs = require("fs");

const ws = new WebSocket("ws://localhost:8080/screen");
ws.binaryType = "nodebuffer";

let frameCount = 0;
let totalBytes = 0;

ws.on("open", () => console.log("Connected to /screen"));

ws.on("message", (data) => {
  frameCount++;
  totalBytes += data.length;
  // Save first frame
  if (frameCount === 1) {
    fs.writeFileSync("/tmp/first_frame.jpg", data);
    console.log("Frame 1: " + data.length + " bytes, saved to /tmp/first_frame.jpg");
  }
  if (frameCount % 10 === 0) {
    console.log("Frames: " + frameCount + ", avg size: " + Math.round(totalBytes/frameCount) + " bytes");
  }
});

setTimeout(() => {
  console.log("\nTotal: " + frameCount + " frames in 3 sec, avg " + Math.round(totalBytes/frameCount) + " bytes/frame");
  ws.close();
  process.exit(0);
}, 3000);
