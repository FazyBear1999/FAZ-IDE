const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on conditions score. [LESSON:conditions-score]
const score = 78;

let label = "Not graded";
// This section focuses on conditions map. [LESSON:conditions-map]
if (score >= 90) {
    label = "Excellent";
} else if (score >= 70) {
    label = "Great progress";
} else if (score >= 50) {
    label = "Keep practicing";
} else {
    label = "Review basics";
}

// This section focuses on conditions render. [LESSON:conditions-render]
app.textContent = "Score: " + score + " • " + label;

// Beginner JS 03: Conditionals
// if/else decisions
