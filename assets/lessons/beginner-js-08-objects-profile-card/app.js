const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on objects create. [LESSON:objects-create]
const profile = { name: "Noor", level: "Beginner", focus: "JavaScript", streak: 4 };

// This section focuses on objects render. [LESSON:objects-render]
const html = [
    "<article>",
    "<h3>" + profile.name + "</h3>",
    "<p>Level: " + profile.level + "</p>",
    "<p>Focus: " + profile.focus + "</p>",
    "<p>Streak: " + profile.streak + " days</p>",
    "</article>",
].join("");
app.innerHTML = html;

// Beginner JS 08: Objects
// Object properties
