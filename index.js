const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TerraCraft - Survival Edition</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; user-select: none; image-rendering: pixelated; }
        body { background: #000; overflow: hidden; color: white; }
        canvas { display: block; }
        
        .overlay { position: absolute; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.85); z-index: 100; pointer-events: auto; }
        .hidden { display: none !important; }
        
        .btn { background: #4ade80; border: none; padding: 12px 24px; font-size: 1.1rem; font-weight: bold; cursor: pointer; border-radius: 6px; margin: 8px; width: 250px; text-align: center; color: #000; }
        .btn:hover { background: #22c55e; }
        
        #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
        
        #hud { position: absolute; top: 10px; left: 10px; pointer-events: none; }
        .health-bar { width: 200px; height: 20px; background: #555; border: 2px solid #222; border-radius: 10px; overflow: hidden; }
        .health-fill { width: 100%; height: 100%; background: #ef4444; transition: width 0.2s; }
        
        #hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; pointer-events: auto; background: rgba(0,0,0,0.6); padding: 6px; border-radius: 8px; }
        .slot { width: 44px; height: 44px; background: rgba(255,255,255,0.1); border: 2px solid #555; display: flex; justify-content: center; align-items: center; font-size: 1.2rem; cursor: pointer; position: relative; color: white; }
        .slot.active { border-color: #fff; background: rgba(255,255,255,0.3); }
        .qty { position: absolute; bottom: 2px; right: 4px; font-size: 0.7rem; font-weight: bold; text-shadow: 1px 1px 0 #000; }
        
        .menu-panel { background: #222; border: 4px solid #555; padding: 20px; width: 400px; text-align: center; border-radius: 10px; }
        input[type="file"] { display: none; }
        .file-label { display: inline-block; background: #3b82f6; padding: 10px; border-radius: 6px; cursor: pointer; margin-top: 10px; }

        /* Inventario y Crafteo MC Style */
        #inventory-gui { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #c6c6c6; border: 4px solid #fff; border-bottom-color: #555; border-right-color: #555; padding: 20px; width: 500px; z-index: 50; pointer-events: auto; display: flex; flex-direction: column; gap: 15px; color: black; }
        .inv-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; background: #8b8b8b; padding: 10px; border: 2px solid #333; border-bottom-color: #fff; border-right-color: #fff; }
        .craft-area { display: flex; gap: 20px; align-items: center; justify-content: center; background: #8b8b8b; padding: 10px; border: 2px solid #333; border-bottom-color: #fff; border-right-color: #fff; }
        .craft-btn { background: #16a34a; color: white; padding: 8px 16px; cursor: pointer; border: none; font-weight: bold; }
    </style>
</head>
<body>
    <div id="main-menu" class="overlay">
        <h1>TerraCraft Survival</h1><br>
        <button class="btn" onclick="startGame()">Jugar Mundo</button>
        <button class="btn" onclick="showSettings()">Resource Packs / Ajustes</button>
        <label class="file-label">
            <input type="file" id="skin-upload" accept="image/png">
            Subir Skin (Sprite 2D)
        </label>
        <p style="margin-top:10px; font-size:0.8rem; color:#aaa;">Nota: Sube una imagen 2D vista de lado (ej. 24x44 px), NO una textura 3D de MC.</p>
    </div>

    <div id="settings-menu" class="overlay hidden">
        <div class="menu-panel">
            <h2>Resource Packs & Mods Visuales</h2><br>
            <label><input type="checkbox" id="pack-hd" checked> Texturas Detalladas (Bordes)</label><br><br>
            <label><input type="checkbox" id="pack-grid"> Activar Cuadrícula (Debug)</label><br><br>
            <label><input type="checkbox" id="pack-retro"> Filtro Retro (Colores oscuros)</label><br><br>
            <button class="btn" onclick="hideSettings()">Volver</button>
        </div>
    </div>

    <div id="pause-menu" class="overlay hidden">
        <h2>Juego Pausado</h2><br>
        <button class="btn" onclick="togglePause()">Continuar</button>
        <button class="btn" onclick="exitToMenu()">Salir al Menú</button>
    </div>

    <div id="ui-layer" class="hidden">
        <div id="hud"><div class="health-bar"><div id="hp-fill" class="health-fill"></div></div></div>
        <div id="hotbar"></div>
        
        <div id="inventory-gui" class="hidden">
            <h3>Inventario & Crafteo</h3>
            <div class="craft-area">
                <div>
                    <p style="font-size: 0.8rem; text-align:center;">Madera (x1) ➔ Tablones (x4)</p>
                    <button class="craft-btn" onclick="craftItem(5, 9, 1, 4)">Craftear Tablones</button>
                </div>
            </div>
            <p style="font-size:0.9rem;">Mochila:</p>
            <div class="inv-grid" id="inv-grid"></div>
        </div>
    </div>

    <canvas id="gameCanvas"></canvas>

    <script>
    let gameState = 'MENU'; 
    let customSkin = null;
    let timeOfDay = 8000; // 0 a 24000
    
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

    document.getElementById('skin-upload').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = () => { customSkin = img; alert("Skin Sprite cargada!"); };
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
        if (gameState === 'PLAYING') {
            gameState = 'PAUSED'; document.getElementById('pause-menu').classList.remove('hidden'); document.getElementById('ui-layer').classList.add('hidden');
        } else if (gameState === 'PAUSED') {
            gameState = 'PLAYING'; document.getElementById('pause-menu').classList.add('hidden'); document.getElementById('ui-layer').classList.remove('hidden');
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
            let inner = b.isTool ? b.icon : (id !== 0 ? \`<div style="width:24px;height:24px;background:\${b.hex}"></div>\` : '');
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
            let inner = b.isTool ? b.icon : (id !== 0 ? \`<div style="width:24px;height:24px;background:\${b.hex}"></div>\` : '');
            let qtyLabel = (!b.isTool && id !== 0) ? \`<span class="qty" style="color:white;">\${qty}</span>\` : '';
            grid.innerHTML += \`<div class="slot">\${inner}\${qtyLabel}</div>\`;
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

        const player = { x: (CHUNK_W/2)*TILE, y: 10*TILE, w: 24, h: 44, vx: 0, vy: 0, speed: 5, jump: -10, grounded: false, hp: 100, maxHp: 100, facingRight: true };
        let camera = { x: player.x, y: player.y };
        let keys = {};
        let invOpen = false;

        let mobs = [
            { x: (CHUNK_W/2 + 5)*TILE, y: 15*TILE, w: 24, h: 24, vx: -1, vy: 0, type: 'slime', hp: 20 },
            { x: (CHUNK_W/2 - 8)*TILE, y: 15*TILE, w: 24, h: 44, vx: 1, vy: 0, type: 'zombie', hp: 40 }
        ];

        window.addEventListener('keydown', e => {
            if (e.code === 'Escape') {
                if(invOpen) { invOpen = false; document.getElementById('inventory-gui').classList.add('hidden'); }
                else togglePause();
            }
            if (gameState !== 'PLAYING') return;
            if (e.code === 'KeyE') {
                invOpen = !invOpen;
                if(invOpen) document.getElementById('inventory-gui').classList.remove('hidden');
                else document.getElementById('inventory-gui').classList.add('hidden');
            }
            if (!invOpen) {
                keys[e.code] = true;
                if (e.key >= '1' && e.key <= '9') { selectedSlot = parseInt(e.key) - 1; renderHotbar(); }
            }
        });
        window.addEventListener('keyup', e => keys[e.code] = false);

        let mouseX = 0, mouseY = 0, isMouseDown = false, mouseBtn = 0;
        window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
        window.addEventListener('mousedown', e => { if(gameState==='PLAYING' && !invOpen){ isMouseDown = true; mouseBtn = e.button; }});
        window.addEventListener('mouseup', () => isMouseDown = false);
        window.addEventListener('contextmenu', e => e.preventDefault());

        function handleMouse() {
            if (!isMouseDown) return;
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
                // Ciclo de Día/Noche
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

                // Lógica de Mobs
                mobs.forEach(m => {
                    m.vy += 0.6;
                    if (m.vy > 15) m.vy = 15;
                    if (!checkCol(m.x + m.vx, m.y, m.w, m.h)) { m.x += m.vx; } else { m.vx *= -1; }
                    if (!checkCol(m.x, m.y + m.vy, m.w, m.h)) { m.y += m.vy; } 
                    else {
                        if (m.vy > 0) {
                            m.y = Math.floor((m.y + m.h + m.vy)/TILE)*TILE - m.h;
                            if (m.type === 'slime') m.vy = -8; // Salto del slime
                        } else m.y = Math.floor((m.y + m.vy)/TILE)*TILE + TILE;
                        if(m.type !== 'slime') m.vy = 0;
                    }
                });

                camera.x += (player.x + player.w/2 - cv.width/2 - camera.x) * 0.15;
                camera.y += (player.y + player.h/2 - cv.height/2 - camera.y) * 0.15;
            }

            // Calculo de luz según hora
            let skyColor = '#87CEEB';
            let darkness = 0;
            if (timeOfDay > 12000 && timeOfDay < 14000) { // Atardecer
                skyColor = '#fdba74';
            } else if (timeOfDay >= 14000 && timeOfDay < 22000) { // Noche
                skyColor = '#0f172a';
                darkness = 0.6;
            } else if (timeOfDay >= 22000) { // Amanecer
                skyColor = '#fcd34d';
            }

            if (resourcePacks.retroMode) skyColor = '#5c4033'; // Filtro sepia raro

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
                            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                            ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
                            ctx.fillStyle = BLOCKS[id].acc;
                            ctx.fillRect(x * TILE + TILE - 8, y * TILE + TILE - 8, 8, 8);
                        }
                    }
                    if (resourcePacks.showGrid) {
                        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                        ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
                    }
                }
            }

            // Renderizado de Mobs
            mobs.forEach(m => {
                if (m.type === 'slime') {
                    ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
                    ctx.fillRect(m.x, m.y, m.w, m.h);
                } else if (m.type === 'zombie') {
                    ctx.fillStyle = '#166534';
                    ctx.fillRect(m.x, m.y, m.w, m.h);
                }
            });

            // Renderizado Jugador
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
                ctx.fillStyle = '#374151'; ctx.fillRect(player.x + 2, player.y + 24, 20, 20);
                ctx.fillStyle = '#0284c7'; ctx.fillRect(player.x + 2, player.y + 10, 20, 16); 
                ctx.fillStyle = '#ffcc99'; ctx.fillRect(player.x + 4, player.y - 4, 16, 14); 
                ctx.fillStyle = '#000'; ctx.fillRect(player.x + (player.facingRight ? 14 : 6), player.y + 2, 4, 4);
            }

            // Capa de oscuridad (Noche)
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
