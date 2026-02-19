// [STEP:build-paddle-game:START]
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const paddle = {
    x: (canvas.width / 2) - 50,
    y: canvas.height - 26,
    width: 100,
    height: 12,
    speed: 6,
};

let moveLeft = false;
let moveRight = false;

window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") moveLeft = true;
    if (event.key === "ArrowRight") moveRight = true;
});

window.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft") moveLeft = false;
    if (event.key === "ArrowRight") moveRight = false;
});

function update() {
    if (moveLeft) paddle.x -= paddle.speed;
    if (moveRight) paddle.x += paddle.speed;
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
}

function draw() {
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
// [STEP:build-paddle-game:END]
