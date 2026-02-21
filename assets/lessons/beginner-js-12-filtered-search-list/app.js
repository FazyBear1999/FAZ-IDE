const app = document.getElementById("app");
// This lesson updates the preview panel as you complete each guided block.

const topics = ["Variables", "Functions", "Arrays", "Objects", "DOM", "Events"];

// This section focuses on filter seed. [LESSON:filter-seed]
app.innerHTML = "<input id=\"searchInput\" type=\"text\" placeholder=\"Search topics\" /><ul id=\"topicList\"></ul>";

const searchInput = document.getElementById("searchInput");
const topicList = document.getElementById("topicList");

function renderTopicList(list) {
    topicList.innerHTML = list.map(function (item) { return "<li>" + item + "</li>"; }).join("");
}
renderTopicList(topics);

// This section focuses on filter wire. [LESSON:filter-wire]
searchInput.addEventListener("input", function () {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = topics.filter(function (item) { return item.toLowerCase().includes(query); });
    renderTopicList(filtered);
});

// Beginner JS 12: Filtering
// Array filter
