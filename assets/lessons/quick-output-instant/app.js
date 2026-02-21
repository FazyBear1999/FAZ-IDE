const output = document.getElementById("out");
const target = output || document.body;

// Define who the welcome message is for. [LESSON:instant-output-warmup]
// Store the learner name so we can personalize the output.
const learnerName = "FAZ Student";
// Track a small mission status string for this warmup.
const missionStatus = "ready";
// Render a complete message in the preview panel.
target.textContent = `Welcome ${learnerName}! Your instant output mission is ${missionStatus}.`;

console.log("Instant warmup lesson ready.");
