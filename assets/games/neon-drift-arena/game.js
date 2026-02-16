(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas?.getContext("2d");
  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const scoreEl = document.getElementById("scoreValue");
  const bestEl = document.getElementById("bestValue");
  const levelEl = document.getElementById("levelValue");
  const boostEl = document.getElementById("boostValue");
  const comboEl = document.getElementById("comboValue");
  const pulseEl = document.getElementById("pulseValue");

  if (!canvas || !ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const keys = new Set();

  let running = false;
  let last = 0;
  let score = 0;
  let best = Number(localStorage.getItem("neon-drift-best") || 0);
  let level = 1;
  let spawnTimer = 0;
  let sparkTimer = 0;
  let boost = 100;
  let pulse = 100;
  let combo = 1;
  let comboTimer = 0;
  let waveTime = 0;
  let bossLevelSpawned = 0;
  let shake = 0;
  let bossWarning = 0;
  let hypeTimer = 0;
  let hypeText = "";
  let muted = false;
  let shotSeq = 1;
  let musicBeatTimer = 0;

  let audioCtx = null;

  bestEl.textContent = String(best);

  const player = {
    x: W * 0.5,
    y: H * 0.5,
    r: 12,
    speed: 250,
    vx: 0,
    vy: 0,
    color: "#22d3ee",
  };

  const stars = Array.from({ length: 110 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    z: 0.2 + Math.random() * 1.8,
  }));

  const drones = [];
  const sparks = [];
  const particles = [];
  const enemyShots = [];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function showHype(text, duration = 1.1) {
    hypeText = String(text || "");
    hypeTimer = Math.max(hypeTimer, duration);
  }

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  }

  function playTone({ freq = 240, type = "triangle", attack = 0.005, decay = 0.16, gain = 0.06 } = {}) {
    if (muted) return;
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;
    if (ctxAudio.state === "suspended") {
      ctxAudio.resume().catch(() => {});
    }
    const t = ctxAudio.currentTime;
    const osc = ctxAudio.createOscillator();
    const amp = ctxAudio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(amp);
    amp.connect(ctxAudio.destination);
    osc.start(t);
    osc.stop(t + attack + decay + 0.02);
  }

  function playSfx(name) {
    if (name === "spark") {
      playTone({ freq: 760 + Math.random() * 120, type: "square", decay: 0.08, gain: 0.045 });
      return;
    }
    if (name === "pulse") {
      playTone({ freq: 210, type: "sawtooth", decay: 0.28, gain: 0.07 });
      playTone({ freq: 420, type: "triangle", decay: 0.2, gain: 0.045 });
      return;
    }
    if (name === "boss") {
      playTone({ freq: 140, type: "sawtooth", decay: 0.24, gain: 0.085 });
      playTone({ freq: 98, type: "triangle", decay: 0.3, gain: 0.05 });
      return;
    }
    if (name === "hit") {
      playTone({ freq: 120, type: "square", decay: 0.18, gain: 0.08 });
      return;
    }
    if (name === "beat") {
      playTone({ freq: 84 + Math.random() * 10, type: "sine", decay: 0.1, gain: 0.028 });
      return;
    }
  }

  function updateMusic(dt) {
    musicBeatTimer -= dt;
    if (musicBeatTimer > 0) return;
    const tempo = Math.max(0.16, 0.32 - level * 0.0045);
    musicBeatTimer = tempo;
    playSfx("beat");
  }

  function colorWithAlpha(hex, alpha) {
    const value = String(hex || "").trim().replace("#", "");
    const normalized = value.length === 3
      ? value.split("").map((c) => c + c).join("")
      : value;
    const r = Number.parseInt(normalized.slice(0, 2) || "00", 16);
    const g = Number.parseInt(normalized.slice(2, 4) || "00", 16);
    const b = Number.parseInt(normalized.slice(4, 6) || "00", 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
  }

  function spawnDrone() {
    const side = Math.floor(Math.random() * 4);
    const speed = 55 + Math.random() * 45 + level * 6;
    let x = 0;
    let y = 0;
    if (side === 0) { x = -20; y = Math.random() * H; }
    else if (side === 1) { x = W + 20; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = -20; }
    else { x = Math.random() * W; y = H + 20; }

    const eliteChance = Math.min(0.4, Math.max(0, (level - 3) * 0.05));
    const elite = Math.random() < eliteChance;
    drones.push({
      x,
      y,
      r: elite ? 15 + Math.random() * 6 : 10 + Math.random() * 6,
      speed: elite ? speed * 1.12 : speed,
      hue: elite ? 195 + Math.random() * 30 : 270 + Math.random() * 70,
      hp: elite ? 2 : 1,
      kind: elite ? "elite" : "normal",
      life: elite ? 24 : 18,
      t: Math.random() * Math.PI * 2,
      shootCooldown: 1 + Math.random() * 1.2,
    });
  }

  function spawnBoss() {
    const margin = 80;
    const side = Math.floor(Math.random() * 4);
    let x = W * 0.5;
    let y = H * 0.5;
    if (side === 0) { x = margin; y = margin + Math.random() * (H - margin * 2); }
    else if (side === 1) { x = W - margin; y = margin + Math.random() * (H - margin * 2); }
    else if (side === 2) { x = margin + Math.random() * (W - margin * 2); y = margin; }
    else { x = margin + Math.random() * (W - margin * 2); y = H - margin; }

    drones.push({
      x,
      y,
      r: 34,
      speed: 62 + level * 2,
      hue: 330,
      hp: 30 + level * 2,
      maxHp: 30 + level * 2,
      kind: "boss",
      t: 0,
      shootCooldown: 0.8,
    });
  }

  function spawnSpark() {
    sparks.push({
      x: 30 + Math.random() * (W - 60),
      y: 30 + Math.random() * (H - 60),
      r: 7,
      life: 8,
      pulse: Math.random() * Math.PI,
    });
  }

  function burst(x, y, color, count = 14) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 120;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.45,
        t: 0,
        color,
      });
    }
  }

  function fireEnemyShot(x, y, vx, vy, radius = 4.5, life = 4.2) {
    enemyShots.push({ x, y, vx, vy, r: radius, life, t: 0, id: shotSeq += 1, nearMiss: false });
  }

  function chainBlastAt(x, y, radius, damage) {
    for (let i = drones.length - 1; i >= 0; i -= 1) {
      const d = drones[i];
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist > radius + d.r) continue;
      d.hp -= damage;
      if (d.hp <= 0) {
        burst(d.x, d.y, d.kind === "boss" ? "#f472b6" : "#22d3ee", d.kind === "boss" ? 48 : 18);
        score += (d.kind === "boss" ? 140 : d.kind === "elite" ? 36 : 14) * combo;
        drones.splice(i, 1);
      }
    }
  }

  function triggerPulseBlast() {
    if (pulse < 100) return;
    pulse = 0;
    const blastRadius = 180;
    let defeated = 0;
    for (let i = drones.length - 1; i >= 0; i -= 1) {
      const d = drones[i];
      const dist = Math.hypot(player.x - d.x, player.y - d.y);
      if (dist > blastRadius + d.r) continue;
      const damage = d.kind === "boss" ? 8 : 99;
      d.hp -= damage;
      if (d.hp <= 0) {
        defeated += d.kind === "boss" ? 6 : (d.kind === "elite" ? 2 : 1);
        burst(d.x, d.y, d.kind === "boss" ? "#f472b6" : "#22d3ee", d.kind === "boss" ? 52 : 20);
        drones.splice(i, 1);
      } else {
        burst(d.x, d.y, "#f472b6", 14);
      }
    }

    if (defeated > 0) {
      combo = clamp(combo + defeated * 0.15, 1, 6.5);
      comboTimer = 2.6;
      score += defeated * 22 * combo;
      showHype("PULSE BREAKER");
    }

    shake = Math.max(shake, 0.45);
    playSfx("pulse");
    burst(player.x, player.y, "#a78bfa", 56);
    chainBlastAt(player.x, player.y, 120, 1.4);
  }

  function reset() {
    score = 0;
    level = 1;
    spawnTimer = 0;
    sparkTimer = 0;
    boost = 100;
    pulse = 100;
    combo = 1;
    comboTimer = 0;
    waveTime = 0;
    bossLevelSpawned = 0;
    shake = 0;
    bossWarning = 0;
    hypeTimer = 0;
    hypeText = "";
    musicBeatTimer = 0;
    drones.length = 0;
    sparks.length = 0;
    particles.length = 0;
    enemyShots.length = 0;
    player.x = W * 0.5;
    player.y = H * 0.5;
    player.vx = 0;
    player.vy = 0;
  }

  function startGame() {
    reset();
    running = true;
    overlay.style.display = "none";
    overlay.querySelector("h1").textContent = "Neon Drift Arena";
    overlay.querySelector("p").textContent = "Dodge drones, collect sparks, survive as long as possible.";
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    if (score > best) {
      best = Math.floor(score);
      localStorage.setItem("neon-drift-best", String(best));
      bestEl.textContent = String(best);
    }
    overlay.querySelector("h1").textContent = "Run Complete";
    overlay.querySelector("p").textContent = `Final score: ${Math.floor(score)} • Level ${level}`;
    overlay.style.display = "grid";
  }

  function update(dt) {
    waveTime += dt;
    const speedBoosting = (keys.has("ShiftLeft") || keys.has("ShiftRight")) && boost > 0;
    const speedMul = speedBoosting ? 1.8 : 1;
    if (speedBoosting) boost = clamp(boost - dt * 28, 0, 100);
    else boost = clamp(boost + dt * 14, 0, 100);
    pulse = clamp(pulse + dt * 12, 0, 100);

    if (comboTimer > 0) {
      comboTimer -= dt;
    } else {
      combo = Math.max(1, combo - dt * 0.35);
    }

    if (hypeTimer > 0) hypeTimer -= dt;

    updateMusic(dt);

    if ((keys.has("Space") || keys.has("KeyE")) && pulse >= 100) {
      triggerPulseBlast();
    }

    const ix = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
    const iy = (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);
    const len = Math.hypot(ix, iy) || 1;

    player.vx = (ix / len) * player.speed * speedMul;
    player.vy = (iy / len) * player.speed * speedMul;
    player.x = clamp(player.x + player.vx * dt, player.r, W - player.r);
    player.y = clamp(player.y + player.vy * dt, player.r, H - player.r);

    spawnTimer -= dt;
    sparkTimer -= dt;
    if (spawnTimer <= 0) {
      spawnDrone();
      spawnTimer = Math.max(0.18, 1.05 - level * 0.045);
    }
    if (sparkTimer <= 0) {
      spawnSpark();
      sparkTimer = 1.5 + Math.random() * 1.2;
    }

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      s.life -= dt;
      s.pulse += dt * 4;
      if (s.life <= 0) sparks.splice(i, 1);
      const hit = Math.hypot(player.x - s.x, player.y - s.y) < player.r + s.r + 2;
      if (hit) {
        combo = clamp(combo + 0.2, 1, 6.5);
        comboTimer = 2.2;
        score += 20 * combo;
        burst(s.x, s.y, "#22d3ee", 20);
        playSfx("spark");
        sparks.splice(i, 1);
      }
    }

    if (level >= 6 && level % 6 === 0 && bossLevelSpawned !== level && !drones.some((d) => d.kind === "boss")) {
      if (bossWarning <= 0) {
        bossWarning = 2.2;
        showHype("BOSS INBOUND", 1.6);
      }
    }

    if (bossWarning > 0) {
      bossWarning -= dt;
      if (bossWarning <= 0 && bossLevelSpawned !== level) {
        spawnBoss();
        bossLevelSpawned = level;
        playSfx("boss");
        showHype("BOSS ONLINE", 1.4);
      }
    }

    for (let i = drones.length - 1; i >= 0; i -= 1) {
      const d = drones[i];
      const dx = player.x - d.x;
      const dy = player.y - d.y;
      const dl = Math.hypot(dx, dy) || 1;

      if (d.kind !== "boss") {
        d.life -= dt;
        if (d.life <= 0) {
          drones.splice(i, 1);
          continue;
        }
      }

      if (d.kind === "normal") {
        d.x += (dx / dl) * d.speed * dt;
        d.y += (dy / dl) * d.speed * dt;
      } else if (d.kind === "elite") {
        d.t += dt * 3.6;
        const sx = -dy / dl;
        const sy = dx / dl;
        const strafe = Math.sin(d.t) * 55;
        d.x += ((dx / dl) * d.speed + sx * strafe) * dt;
        d.y += ((dy / dl) * d.speed + sy * strafe) * dt;
        d.shootCooldown -= dt;
        if (d.shootCooldown <= 0) {
          d.shootCooldown = 1.05 + Math.random() * 0.6;
          fireEnemyShot(d.x, d.y, (dx / dl) * 210, (dy / dl) * 210, 4.2, 3.8);
        }
      } else {
        const hpRatio = clamp(d.hp / d.maxHp, 0, 1);
        const phase2 = hpRatio < 0.45;
        d.t += dt;
        const orbit = 34 + Math.sin(d.t * 1.4) * 20;
        const tx = player.x + Math.cos(d.t * 0.75) * orbit;
        const ty = player.y + Math.sin(d.t * 0.75) * orbit;
        const bdx = tx - d.x;
        const bdy = ty - d.y;
        const bdl = Math.hypot(bdx, bdy) || 1;
        d.x += (bdx / bdl) * d.speed * dt;
        d.y += (bdy / bdl) * d.speed * dt;
        d.shootCooldown -= dt;
        if (d.shootCooldown <= 0) {
          d.shootCooldown = phase2 ? 0.34 : 0.55;
          const base = Math.atan2(dy, dx);
          const spread = phase2 ? 0.24 : 0.38;
          for (let i = -1; i <= 1; i += 1) {
            const a = base + i * spread;
            fireEnemyShot(d.x, d.y, Math.cos(a) * 240, Math.sin(a) * 240, 5.2, 4.2);
          }
          if (phase2) {
            for (let i = 0; i < 8; i += 1) {
              const a = d.t * 2 + (Math.PI * 2 * i) / 8;
              fireEnemyShot(d.x, d.y, Math.cos(a) * 180, Math.sin(a) * 180, 3.8, 2.6);
            }
          }
        }
      }
    }

    for (let i = enemyShots.length - 1; i >= 0; i -= 1) {
      const shot = enemyShots[i];
      shot.t += dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (
        shot.t > shot.life
        || shot.x < -20
        || shot.y < -20
        || shot.x > W + 20
        || shot.y > H + 20
      ) {
        enemyShots.splice(i, 1);
        continue;
      }

      const hitDist = Math.hypot(player.x - shot.x, player.y - shot.y);
      const safe = player.r + shot.r + 18;
      const lethal = player.r + shot.r - 1;
      if (!shot.nearMiss && hitDist > lethal && hitDist < safe) {
        shot.nearMiss = true;
        combo = clamp(combo + 0.06, 1, 6.5);
        comboTimer = Math.max(comboTimer, 1.15);
        score += 3 * combo;
      }
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.t >= p.life) particles.splice(i, 1);
    }

    for (const d of drones) {
      if (Math.hypot(player.x - d.x, player.y - d.y) < player.r + d.r - 1) {
        burst(player.x, player.y, "#f43f5e", 34);
        playSfx("hit");
        shake = 0.6;
        endGame();
        return;
      }
    }

    for (const shot of enemyShots) {
      if (Math.hypot(player.x - shot.x, player.y - shot.y) < player.r + shot.r - 1) {
        burst(player.x, player.y, "#f43f5e", 34);
        playSfx("hit");
        shake = 0.6;
        endGame();
        return;
      }
    }

    score += dt * (8 + level * 0.9) * combo;
    level = 1 + Math.floor(score / 140);
    shake = Math.max(0, shake - dt * 2.4);
  }

  function drawGrid(t) {
    ctx.save();
    ctx.strokeStyle = "rgba(34, 211, 238, 0.08)";
    ctx.lineWidth = 1;
    const size = 38;
    const ox = (t * 20) % size;
    for (let x = -size + ox; x < W + size; x += size) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = -size + ox; y < H + size; y += size) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render(now) {
    const t = now * 0.001;
    const sx = shake > 0 ? (Math.random() - 0.5) * 16 * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * 16 * shake : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sx, sy);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#060b1a");
    g.addColorStop(1, "#03060f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (bossWarning > 0) {
      ctx.save();
      const pulseAlpha = 0.28 + Math.sin(t * 18) * 0.12;
      ctx.fillStyle = `rgba(244, 114, 182, ${clamp(pulseAlpha, 0, 0.5)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    for (const star of stars) {
      star.y += star.z * 0.25;
      if (star.y > H + 4) {
        star.y = -4;
        star.x = Math.random() * W;
      }
      ctx.fillStyle = `rgba(167,139,250,${0.25 + star.z * 0.22})`;
      ctx.fillRect(star.x, star.y, star.z, star.z);
    }

    drawGrid(t);

    for (const s of sparks) {
      const r = s.r + Math.sin(s.pulse) * 1.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34, 211, 238, 0.95)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34, 211, 238, 0.12)";
      ctx.fill();
    }

    for (const d of drones) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      const sat = d.kind === "boss" ? 100 : 95;
      const light = d.kind === "boss" ? 70 : 62;
      ctx.fillStyle = `hsla(${d.hue}, ${sat}%, ${light}%, 0.92)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r + 8, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${d.hue}, 95%, 62%, ${d.kind === "boss" ? 0.2 : 0.12})`;
      ctx.fill();

      if (d.kind === "boss") {
        const hpRatio = clamp(d.hp / d.maxHp, 0, 1);
        const bw = 76;
        const bh = 6;
        const bx = d.x - bw * 0.5;
        const by = d.y - d.r - 16;
        ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "rgba(244, 114, 182, 0.95)";
        ctx.fillRect(bx, by, bw * hpRatio, bh);
      }
    }

    for (const shot of enemyShots) {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(244, 114, 182, 0.94)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r + 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(244, 114, 182, 0.18)";
      ctx.fill();
    }

    for (const p of particles) {
      const alpha = 1 - p.t / p.life;
      ctx.fillStyle = colorWithAlpha(p.color, alpha);
      ctx.fillRect(p.x, p.y, 2.4, 2.4);
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    const angle = Math.atan2(player.vy || 0.01, player.vx || 1);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-11, -8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, 8);
    ctx.closePath();
    ctx.fillStyle = player.color;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.lineTo(-18 - Math.random() * 6, 0);
    ctx.strokeStyle = "rgba(167,139,250,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    if (hypeTimer > 0 && hypeText) {
      const a = clamp(hypeTimer / 1.2, 0, 1);
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "700 28px JetBrains Mono, monospace";
      ctx.fillStyle = `rgba(226, 241, 255, ${0.85 * a})`;
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.42 * a})`;
      ctx.lineWidth = 2;
      ctx.strokeText(hypeText, W * 0.5, 64);
      ctx.fillText(hypeText, W * 0.5, 64);
      ctx.restore();
    }

    if (bossWarning > 0) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "700 20px JetBrains Mono, monospace";
      const blink = 0.35 + Math.sin(t * 22) * 0.3;
      ctx.fillStyle = `rgba(251, 113, 133, ${clamp(blink, 0.2, 0.95)})`;
      ctx.fillText("WARNING: BOSS APPROACHING", W * 0.5, 96);
      ctx.restore();
    }

    ctx.save();
    const vignette = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.15, W * 0.5, H * 0.5, H * 0.72);
    vignette.addColorStop(0, "rgba(3, 7, 18, 0)");
    vignette.addColorStop(1, "rgba(3, 7, 18, 0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    scoreEl.textContent = String(Math.floor(score));
    levelEl.textContent = String(level);
    boostEl.textContent = `${Math.floor(boost)}%`;
    if (comboEl) comboEl.textContent = `x${combo.toFixed(1)}`;
    if (pulseEl) pulseEl.textContent = `${Math.floor(pulse)}%`;
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    update(dt);
    render(now);
    if (running) requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (!running && event.code === "KeyR") startGame();
    if (event.code === "KeyM") {
      muted = !muted;
      showHype(muted ? "AUDIO: OFF" : "AUDIO: ON", 0.8);
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  startBtn?.addEventListener("click", startGame);
})();
