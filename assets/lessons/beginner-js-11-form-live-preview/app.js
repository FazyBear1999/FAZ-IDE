const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on input seed. [LESSON:input-seed]
app.innerHTML = "<label for=\"nameInput\">Your Name</label><input id=\"nameInput\" type=\"text\" placeholder=\"Type your name\" /><p id=\"namePreview\">Preview: --</p>";

const nameInput = document.getElementById("nameInput");
const namePreview = document.getElementById("namePreview");

// This section focuses on input wire. [LESSON:input-wire]
nameInput.addEventListener("input", function () {
    const value = nameInput.value.trim();
    namePreview.textContent = "Preview: " + (value || "--");
});

// Beginner JS 11: Input Events
// Live preview
