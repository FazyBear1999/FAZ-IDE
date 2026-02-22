const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on strings source. [LESSON:strings-source]
const rawName = "  Alex  ";
const rawTrack = "javascript beginner";

// This section focuses on strings format. [LESSON:strings-format]
const name = rawName.trim();
const track = rawTrack.trim().toUpperCase();

// This section focuses on strings render. [LESSON:strings-render]
app.innerHTML = "<strong>" + name + "</strong> is practicing <em>" + track + "</em>.";

// Beginner JS 02: Strings + Formatting
// Strings and formatting
