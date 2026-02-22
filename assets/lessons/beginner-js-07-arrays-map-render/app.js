const app = document.getElementById("app") || document.getElementById("out") || document.body;
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on map source. [LESSON:map-source]
const scores = [45, 68, 92, 81];

// This section focuses on map transform. [LESSON:map-transform]
const badges = scores.map(function (score) {
    if (score >= 90) return "Score " + score + " => A";
    if (score >= 75) return "Score " + score + " => B";
    if (score >= 60) return "Score " + score + " => C";
    return "Score " + score + " => D";
});

// This section focuses on map render. [LESSON:map-render]
app.innerHTML = badges.map(function (line) { return "<p>" + line + "</p>"; }).join("");

// Beginner JS 07: map + join
// Transform data
