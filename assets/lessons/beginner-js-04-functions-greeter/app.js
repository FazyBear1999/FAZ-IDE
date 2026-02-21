const app = document.getElementById("app");
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on functions create. [LESSON:functions-create]
function buildGreeting(name, topic) {
    return "Hi " + name + ", welcome to " + topic + "!";
}

// This section focuses on functions call. [LESSON:functions-call]
const lineA = buildGreeting("Sam", "Functions");
const lineB = buildGreeting("Mia", "JavaScript basics");

// This section focuses on functions render. [LESSON:functions-render]
app.innerHTML = "<p>" + lineA + "</p><p>" + lineB + "</p>";

// Beginner JS 04: Functions
// Function parameters
