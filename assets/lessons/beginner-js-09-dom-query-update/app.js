const app = document.getElementById("app");
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on dom seed. [LESSON:dom-seed]
app.innerHTML = "<h3 id=\"statusTitle\">Session Status</h3><p id=\"statusValue\">Waiting...</p>";

// This section focuses on dom update. [LESSON:dom-update]
const titleNode = document.getElementById("statusTitle");
const valueNode = document.getElementById("statusValue");
titleNode.textContent = "Session Ready";
valueNode.textContent = "You can now practice beginner JavaScript lessons.";

// Beginner JS 09: DOM Query
// DOM updates
