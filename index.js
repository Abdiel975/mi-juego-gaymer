const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);
app.use(express.json());

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1543161653523255379/_LaPPSocrBnSYKF0TD5gwCDMBl3FXjYyoImmLRiEd6AAl1c1F9IULR7m2--mgP6RN8Ea";

app.post('/api/telemetry', async (req, res) => {
    // (Misma lógica de telemetría que ya tenías)
    res.sendStatus(200);
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TerraCraft - Survival</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; user-select: none; }
        body { background: #000; overflow: hidden; color: white; }
        canvas { display: block; image-rendering: pixelated; }
        
        .overlay { position: absolute; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.85); z-index: 100; pointer-events: auto; }
        .hidden { display: none !important; }
        
        .btn { background: #4ade80; border: none; padding: 12px 24px; font-size: 1.1rem; font-weight: bold; cursor: pointer; border-radius: 6px; margin: 8px; width: 250px; text-align: center; color: #000; }
        .btn:hover { background: #22c55e; }
        
        #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
        
        /* HUD Survival */
        #hud { position: absolute; top: 10px; left: 10px; pointer-events: none; }
        .health-bar { width: 200px; height: 20px; background: #555; border: 2px solid #222; border-radius: 10px; overflow: hidden; }
        .health-fill { width: 100%; height: 100%; background: #ef4444; transition: width 0.2s; }
        
        #hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; pointer-events: auto; background: rgba(0,0,0,0.6); padding: 6px; border-radius: 8px; }
        .slot { width: 44px; height: 44px; background: rgba(255,255,255,0.1); border: 2px solid #555; display: flex; justify-content: center; align-items: center; font-size: 1.2rem; cursor: pointer; position: relative; }
        .slot.active { border-color: #fff; background: rgba(255,255,255,0.3); }
        .qty { position: absolute; bottom: 2px; right: 4px; font-size: 0.7rem; font-weight: bold; }
        
        .menu-panel { background: #222; border: 4px solid #555; padding: 20px; width: 400px; text-align: center; border-radius: 10px; }
        input[type="file"] { display: none; }
        .file-label { display: inline-block; background: #3b82f6; padding: 10px; border-radius: 6px; cursor: pointer; margin-top: 10px; }
    </style>
</head>
<body>
    <!-- Menú Principal -->
    <div id="main-menu" class="overlay">
        <h1>TerraCraft Survival</h1>
        <br>
        <button class="btn" onclick="startGame()">Jugar</button>
        <button class="btn" onclick="showSettings()">Ajustes</button>
        <label class="file-label">
            <input type="file" id="skin-upload" accept="image/png">
            Subir Skin (PNG)
        </label>
    </div>

    <!-- Menú de Ajustes -->
    <div id="settings-menu" class="overlay hidden">
        <div class="menu-panel">
            <h2>Ajustes</h2>
            <br>
            <label>Volumen: <input type="range" id="vol-slider" min="0" max="1" step="0.1" value="0.5"></label>
            <br><br>
            <label><input type="checkbox" id="graphics-toggle" checked> Gráficos Altos (Bordes)</label>
            <br><br>
            <button class="btn" onclick="hideSettings()">Volver</button>
        </div>
    </div>

    <!-- Menú de Pausa -->
    <div id="pause-menu" class="overlay hidden">
        <h2>Juego Pausado</h2>
        <br>
        <button class="btn" onclick="togglePause()">Continuar</button>
        <button class="btn" onclick="exitToMenu()">Salir al Menú</button>
    </div>

    <!-- Interfaz en Juego -->
    <div id="ui-layer" class="hidden">
        <div id="hud">
            <div class="health-bar"><div id="hp-fill" class="health-fill"></div></div>
        </div>
        <div id="hotbar"></div>
    </div>

    <canvas id="gameCanvas"></canvas>

    <script>
    const bgMusic = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
    bgMusic.loop = true;
    
    // Configuración global
    let gameState = 'MENU'; // MENU, PLAYING, PAUSED
    let settings = { volume: 0.5, fancyGraphics: true };
    let customSkin = null;

    // Elementos DOM
    const mainMenu = document.getElementById('main-menu');
    const pauseMenu = document.getElementById('pause-menu');
    const settingsMenu = document.getElementById('settings-menu');
    const uiLayer = document.getElementById('ui-layer');
    const volSlider = document.getElementById('vol-slider');
    const graphToggle = document.getElementById('graphics-toggle');
    const hpFill = document.getElementById('hp-fill');

    // Cargar Skin
    document.getElementById('skin-upload').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = () => { customSkin = img; alert("Skin cargada exitosamente"); };
                img.src = event.target.result;
            }
            reader.readAsDataURL(file);
        }
    });

    volSlider.addEventListener('input', e => { settings.volume = e.target.value; bgMusic.volume = settings.volume; });
    graphToggle.addEventListener('change', e => { settings.fancyGraphics = e.target.checked; });

    function showSettings() { mainMenu.classList.add('hidden'); settingsMenu.classList.remove('hidden'); }
    function hideSettings() { settingsMenu.classList.add('hidden'); mainMenu.classList.remove('hidden'); }
    
    function startGame() {
        mainMenu.classList.add('hidden');
        uiLayer.classList.remove('hidden');
        gameState = 'PLAYING';
        bgMusic.play().catch(()=>{});
        if(!window.gameInitialized) { initGame(); window.gameInitialized = true; }
    }

    function togglePause() {
        if (gameState === 'MENU') return;
        if (gameState === 'PLAYING') {
            gameState = 'PAUSED';
            pauseMenu.classList.remove('hidden');
            uiLayer.classList.add('hidden');
        } else {
            gameState = 'PLAYING';
            pauseMenu.classList.add('hidden');
            uiLayer.classList.remove('hidden');
        }
    }

    function exitToMenu() {
        gameState = 'MENU';
        pauseMenu.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    }

    const BLOCKS = {
        0: { name: 'Aire' },
        1: { name: 'Pico', isTool: true, icon: '⛏️' },
        2: { name: 'Pasto', hex: '#4ade80', acc: '#15803d' },
        3: { name: 'Tierra', hex: '#78350f', acc: '#92400e' },
        4: { name: 'Piedra', hex: '#52525b', acc: '#3f3f46' },
        5: { name: 'Madera', hex: '#5c3a21', acc: '#452b18' }
    };

    // Inventario Survival (ID: Cantidad)
    let inventory = { 1: 1, 2: 50, 3: 50, 5: 10 };
    let hotbarSlots = [1, 2, 3, 5, 0, 0, 0, 0, 0];
    let selectedSlot = 0;

    function renderHotbar() {
        const hb = document.getElementById('hotbar');
        hb.innerHTML = '';
        hotbarSlots.forEach((id, i) => {
            const b = BLOCKS[id] || BLOCKS[0];
            let qty = inventory[id] || 0;
            let inner = b.isTool ? b.icon : (id !== 0 ? \`<div style="width:20px;height:20px;background:\${b.hex}"></div>\` : '');
            let qtyLabel = (!b.isTool && id !== 0) ? \`<span class="qty">\${qty}</span>\` : '';
            hb.innerHTML += \`<div class="slot \${i === selectedSlot ? 'active' : ''}" onclick="selectedSlot=\${i}; renderHotbar()">\${inner}\${qtyLabel}</div>\`;
        });
    }

    function initGame() {
        const cv = document.getElementById('gameCanvas');
        const ctx = cv.getContext('2d', { alpha: false });
        function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
        window.addEventListener('resize', resize);
        resize();

        const TILE = 32, CHUNK_W = 100, CHUNK_H = 100;
        let world = Array.from({ length: CHUNK_W }, () => Array(CHUNK_H).fill(0));
        
        for (let x = 0; x < CHUNK_W; x++) {
            let h = Math.floor(30 + Math.sin(x * 0.1) * 3);
            for (let y = h; y < CHUNK_H; y++) world[x][y] = (y === h) ? 2 : (y < h + 4 ? 3 : 4);
        }

        const player = { 
            x: (CHUNK_W/2)*TILE, y: 10*TILE, w: 24, h: 44, 
            vx: 0, vy: 0, speed: 5, jump: -10, grounded: false, 
            hp: 100, maxHp: 100, facingRight: true 
        };
        let camera = { x: player.x, y: player.y };
        const keys = {};

        window.addEventListener('keydown', e => {
            if (e.code === 'Escape') togglePause();
            if (gameState !== 'PLAYING') return;
            keys[e.code] = true;
            if (e.key >= '1' && e.key <= '9') { selectedSlot = parseInt(e.key) - 1; renderHotbar(); }
        });
        window.addEventListener('keyup', e => keys[e.code] = false);

        let mouseX = 0, mouseY = 0, isMouseDown = false, mouseBtn = 0;
        window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
        window.addEventListener('mousedown', e => { if(gameState==='PLAYING'){ isMouseDown = true; mouseBtn = e.button; }});
        window.addEventListener('mouseup', () => isMouseDown = false);
        window.addEventListener('contextmenu', e => e.preventDefault());

        function handleMouse() {
            if (!isMouseDown) return;
            const tx = Math.floor((mouseX + camera.x) / TILE);
            const ty = Math.floor((mouseY + camera.y) / TILE);
            if (tx < 0 || tx >= CHUNK_W || ty < 0 || ty >= CHUNK_H) return;
            
            const dist = Math.hypot((player.x + player.w/2) - (tx*TILE), (player.y + player.h/2) - (ty*TILE));
            if (dist > TILE * 6) return; // Rango de minado

            let currentId = hotbarSlots[selectedSlot];
            
            if (mouseBtn === 0 && currentId === 1) { // Minar
                let minedBlock = world[tx][ty];
                if (minedBlock !== 0) {
                    inventory[minedBlock] = (inventory[minedBlock] || 0) + 1;
                    world[tx][ty] = 0;
                    renderHotbar();
                    isMouseDown = false; // Requiere click por bloque
                }
            } else if ((mouseBtn === 2 || currentId !== 1) && world[tx][ty] === 0) { // Colocar
                if (currentId !== 0 && currentId !== 1 && inventory[currentId] > 0) {
                    world[tx][ty] = currentId;
                    inventory[currentId]--;
                    if(inventory[currentId] <= 0) inventory[currentId] = 0;
                    renderHotbar();
                    isMouseDown = false;
                }
            }
        }

        function checkCol(nx, ny) {
            const l = Math.floor(nx / TILE), r = Math.floor((nx + player.w - 1) / TILE);
            const t = Math.floor(ny / TILE), b = Math.floor((ny + player.h - 1) / TILE);
            if (l < 0 || r >= CHUNK_W || t < 0 || b >= CHUNK_H) return true;
            for (let y = t; y <= b; y++) {
                for (let x = l; x <= r; x++) { if (world[x][y] !== 0) return true; }
            }
            return false;
        }

        renderHotbar();

        function update() {
            if (gameState === 'PLAYING') {
                // Físicas mejoradas (Aceleración y Fricción)
                if (keys['KeyA']) { player.vx -= 1; player.facingRight = false; }
                else if (keys['KeyD']) { player.vx += 1; player.facingRight = true; }
                else { player.vx *= 0.7; } // Fricción
                
                // Límite de velocidad
                if (player.vx > player.speed) player.vx = player.speed;
                if (player.vx < -player.speed) player.vx = -player.speed;

                if ((keys['Space'] || keys['KeyW']) && player.grounded) {
                    player.vy = player.jump;
                    player.grounded = false;
                    keys['Space'] = false; 
                }

                player.vy += 0.6; // Gravedad
                if (player.vy > 15) player.vy = 15;

                // Colisión X
                if (!checkCol(player.x + player.vx, player.y)) { player.x += player.vx; } 
                else { player.vx = 0; }

                // Colisión Y
                player.grounded = false;
                if (!checkCol(player.x, player.y + player.vy)) { player.y += player.vy; } 
                else {
                    if (player.vy > 10) { player.hp -= Math.floor(player.vy); hpFill.style.width = \`\${(player.hp/player.maxHp)*100}%\`; } // Daño por caída
                    if (player.vy > 0) { player.grounded = true; player.y = Math.floor((player.y + player.h + player.vy)/TILE)*TILE - player.h; } 
                    else if (player.vy < 0) { player.y = Math.floor((player.y + player.vy)/TILE)*TILE + TILE; }
                    player.vy = 0;
                }
                
                handleMouse();

                // Cámara suave (Lerp)
                camera.x += (player.x + player.w/2 - cv.width/2 - camera.x) * 0.15;
                camera.y += (player.y + player.h/2 - cv.height/2 - camera.y) * 0.15;
            }

            // Renderizado
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
                    let id = world[x][y];
                    if (id !== 0) {
                        ctx.fillStyle = BLOCKS[id].hex;
                        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
                        if (settings.fancyGraphics) {
                            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                            ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
                            ctx.fillStyle = BLOCKS[id].acc;
                            ctx.fillRect(x * TILE + TILE - 8, y * TILE + TILE - 8, 8, 8);
                        }
                    }
                }
            }

            // Dibujar Jugador
            if (customSkin) {
                // Si subió skin, la dibuja adaptada a su caja de colisión
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
                // Skin por defecto
                ctx.fillStyle = '#374151'; ctx.fillRect(player.x + 2, player.y + 24, 20, 20);
                ctx.fillStyle = '#0284c7'; ctx.fillRect(player.x + 2, player.y + 10, 20, 16); 
                ctx.fillStyle = '#ffcc99'; ctx.fillRect(player.x + 4, player.y - 4, 16, 14); 
                ctx.fillStyle = '#452b18'; ctx.fillRect(player.x + 4, player.y - 4, 16, 4);
                ctx.fillRect(player.x + (player.facingRight ? 2 : 18), player.y - 4, 4, 10);
                ctx.fillStyle = '#000'; ctx.fillRect(player.x + (player.facingRight ? 14 : 6), player.y + 2, 4, 4);
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
