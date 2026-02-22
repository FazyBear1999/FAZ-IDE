const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on vars setup. [LESSON:vars-setup]
const learner = "FAZ Student";
let completed = 1;
const topic = "Variables";

// This section focuses on vars message. [LESSON:vars-message]
const message = learner + " completed " + completed + " lesson on " + topic + ".";

// This section focuses on vars render. [LESSON:vars-render]
app.textContent = message;
console.log(message);

// Beginner JS 01: Variables + Output
// Variables and output
