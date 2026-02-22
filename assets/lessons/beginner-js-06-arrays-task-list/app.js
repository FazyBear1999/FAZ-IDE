const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on arrays create. [LESSON:arrays-create]
const tasks = ["Open FAZ IDE", "Read lesson", "Type code"];

// This section focuses on arrays push. [LESSON:arrays-push]
tasks.push("Run preview");

// This section focuses on arrays render. [LESSON:arrays-render]
app.innerHTML = "<ul>" + tasks.map(function (task) { return "<li>" + task + "</li>"; }).join("") + "</ul>";

// Beginner JS 06: Arrays
// Array basics
