const app = document.getElementById("app");
// This lesson updates the preview panel as you complete each guided block.

const quotes = [
    "Small steps build strong skills.",
    "Practice turns confusion into confidence.",
    "Debugging is learning in slow motion.",
    "Consistency beats intensity.",
];

// This section focuses on random seed. [LESSON:random-seed]
app.innerHTML = "<button id=\"quoteBtn\" type=\"button\">New Quote</button><p id=\"quoteText\">Click the button to load a quote.</p>";

const quoteBtn = document.getElementById("quoteBtn");
const quoteText = document.getElementById("quoteText");

// This section focuses on random wire. [LESSON:random-wire]
quoteBtn.addEventListener("click", function () {
    const index = Math.floor(Math.random() * quotes.length);
    quoteText.textContent = quotes[index];
});

// Beginner JS 14: Random Choice
// Random index
