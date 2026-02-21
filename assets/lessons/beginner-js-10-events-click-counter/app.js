const app = document.getElementById("app");
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on events seed. [LESSON:events-seed]
app.innerHTML = "<button id=\"countBtn\" type=\"button\">Add +1</button><p id=\"countValue\">Count: 0</p>";

const countBtn = document.getElementById("countBtn");
const countValue = document.getElementById("countValue");
let count = 0;

// This section focuses on events wire. [LESSON:events-wire]
countBtn.addEventListener("click", function () {
    count += 1;
    countValue.textContent = "Count: " + count;
});

// Beginner JS 10: Click Events
// Event listeners
