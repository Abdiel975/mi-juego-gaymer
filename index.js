const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);

// Sistema de captura de IP
app.use((req, res, next) => {
    let userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    if (userIp && userIp.includes(',')) {
        userIp = userIp.split(',')[0].trim();
    }
    const userAgent = req.headers['user-agent'] || 'Desconocido';

    if (req.url === '/') {
        console.log(`\n========================================`);
        console.log(`🎯 [NUEVO JUGADOR CONECTADO]`);
        console.log(`📍 IP: ${userIp}`);
        console.log(`📱 Dispositivo: ${userAgent}`);
        console.log(`========================================\n`);
    }
    next();
});

// Código completo del juego Minecraft 2D Profesional
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Minecraft 2D - Mine & Craft Edition</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; user-select: none; }
                body, html { width: 100%; height: 100%; overflow: hidden; background: #090a0f; color: white; }
                
                /* Menú principal */
                #menu { position: absolute; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; background: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.8)), url('https://images.unsplash.com/photo-1627856013091-fed6e4e30025?q=80&w=1000') center/cover; z-index: 10; }
                .title { font-size: 3.8rem; text-shadow: 4px 4px #000; color: #55ff55; font-weight: 900; letter-spacing: 3px; margin-bottom: 5px; }
                .subtitle { font-size: 1.1rem; color: #bbb; margin-bottom: 25px; }
                .card { background: rgba(20, 20, 20, 0.85); padding: 30px; border-radius: 12px; border: 2px solid #444; text-align: center; width: 340px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
                input[type="text"] { width: 100%; padding: 12px; font-size: 1rem; border-radius: 6px; border: 1px solid #555; margin-bottom: 15px; text-align: center; background: #222; color: #fff; outline: none; }
                .btn { width: 100%; padding: 14px; font-size: 1.1rem; background: #2e7d32; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; text-shadow: 1px 1px #000; }
                .btn:hover { background: #388e3c; transform: scale(1.02); }

                /* HUD de juego */
                #game-container { display: none; width: 100%; height: 100%; position: relative; }
                canvas { display: block; background: #38bdf8; }
                #hud { position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.65); padding: 12px 18px; border-radius: 8px; border: 1px solid #555; font-size: 0.85rem; }
                #hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; background: rgba(0,0,0,0.75); padding: 8px; border-radius: 8px; border: 2px solid #555; }
                .slot { width: 48px; height: 48px; border: 2px solid #666; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; cursor: pointer; background-size: cover; }
                .slot.active { border-color: #fff; box-shadow: 0 0 12px #fff; transform: scale(1.05); }
            </style>
        </head>
        <body>

            <div id="menu">
                <h1 class="title">MINECRAFT 2D</h1>
                <p class="subtitle">v1.2.0 Web Edition</p>
                <div class="card">
                    <input type="text" id="nickname" placeholder="Tu Nombre" value="Steve">
                    <button class="btn" onclick="startGame()">JUGAR EN LÍNEA</button>
                </div>
            </div>

            <div id="game-container">
                <div id="hud">
                    <b>⛏️ Minecraft 2D - Mining Mode</b><br>
                    • A / D o Flechas: Moverse<br>
                    • W / Espacio: Saltar<br>
                    • Clic Izquierdo: Minar / Romper hacia abajo<br>
                    • Clic Derecho: Colocar bloque seleccionado
                </div>

                <div id="hotbar">
                    <div class="slot active" id="slot-1" onclick="selectSlot(1)" style="background: #4ade80;">Pasto</div>
                    <div class="slot" id="slot-2" onclick="selectSlot(2)" style="background: #854d0e;">Tierra</div>
                    <div class="slot" id="slot-3" onclick="selectSlot(3)" style="background: #6b7280;">Piedra</div>
                    <div class="slot" id="slot-4" onclick="selectSlot(4)" style="background: #06b6d4;">Diamante</div>
                </div>

                <canvas id="gameCanvas"></canvas>
            </div>

            <script>
                let activeBlockType = 1;

                function selectSlot(type) {
                    activeBlockType = type;
                    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active'));
                    document.getElementById('slot-' + type).classList.add('active');
                }

                function startGame() {
                    document.getElementById('menu').style.display = 'none';
                    document.getElementById('game-container').style.display = 'block';
                    initGame();
                }

                function initGame() {
                    const canvas = document.getElementById('gameCanvas');
                    const ctx = canvas.getContext('2d');

                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;

                    const TILE_SIZE = 36;
                    const COLS = Math.ceil(canvas.width / TILE_SIZE);
                    const ROWS = 70; // Capas profundas para minar hacia abajo

                    const BLOCKS = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, DIAMOND: 4 };
                    const COLORS = {
                        [BLOCKS.GRASS]: '#4ade80',
                        [BLOCKS.DIRT]: '#854d0e',
                        [BLOCKS.STONE]: '#6b7280',
                        [BLOCKS.DIAMOND]: '#06b6d4'
                    };

                    // Generar Terreno Profundo
                    let world = [];
                    const surfaceY = 10;

                    for (let r = 0; r < ROWS; r++) {
                        world[r] = [];
                        for (let c = 0; c < COLS; c++) {
                            if (r < surfaceY) world[r][c] = BLOCKS.AIR;
                            else if (r === surfaceY) world[r][c] = BLOCKS.GRASS;
                            else if (r < surfaceY + 6) world[r][c] = BLOCKS.DIRT;
                            else {
                                // Minerales aleatorios en la profundidad
                                world[r][c] = (Math.random() < 0.08) ? BLOCKS.DIAMOND : BLOCKS.STONE;
                            }
                        }
                    }

                    // Jugador
                    const player = {
                        x: Math.floor(COLS / 2) * TILE_SIZE,
                        y: (surfaceY - 2) * TILE_SIZE,
                        width: 24,
                        height: 54,
                        vx: 0,
                        vy: 0,
                        grounded: false
                    };

                    const keys = {};
                    window.addEventListener('keydown', e => keys[e.code] = true);
                    window.addEventListener('keyup', e => keys[e.code] = false);

                    // Minar o Construir
                    canvas.addEventListener('mousedown', e => {
                        const rect = canvas.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const clickY = e.clientY - rect.top;

                        const col = Math.floor(clickX / TILE_SIZE);
                        const row = Math.floor(clickY / TILE_SIZE);

                        if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
                            if (e.button === 0) {
                                world[row][col] = BLOCKS.AIR; // Romper bloque (picar abajo)
                            } else if (e.button === 2 && world[row][col] === BLOCKS.AIR) {
                                world[row][col] = activeBlockType; // Poner bloque activo
                            }
                        }
                    });
                    canvas.addEventListener('contextmenu', e => e.preventDefault());

                    function update() {
                        if (keys['KeyA'] || keys['ArrowLeft']) player.vx = -4.5;
                        else if (keys['KeyD'] || keys['ArrowRight']) player.vx = 4.5;
                        else player.vx = 0;

                        if ((keys['Space'] || keys['KeyW'] || keys['ArrowUp']) && player.grounded) {
                            player.vy = -10;
                            player.grounded = false;
                        }

                        player.vy += 0.5; // Gravedad
                        player.x += player.vx;
                        player.y += player.vy;

                        player.grounded = false;

                        // Colisiones avanzadas
                        for (let r = 0; r < ROWS; r++) {
                            for (let c = 0; c < COLS; c++) {
                                if (world[r][c] !== BLOCKS.AIR) {
                                    const bx = c * TILE_SIZE;
                                    const by = r * TILE_SIZE;

                                    if (player.x < bx + TILE_SIZE && player.x + player.width > bx &&
                                        player.y < by + TILE_SIZE && player.y + player.height > by) {
                                        
                                        if (player.vy > 0 && player.y + player.height - player.vy <= by) {
                                            player.y = by - player.height;
                                            player.vy = 0;
                                            player.grounded = true;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    function render() {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        // Dibujar bloques
                        for (let r = 0; r < ROWS; r++) {
                            for (let c = 0; c < COLS; c++) {
                                const b = world[r][c];
                                if (b !== BLOCKS.AIR) {
                                    ctx.fillStyle = COLORS[b];
                                    ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                                    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                                    ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                                }
                            }
                        }

                        // Dibujar Jugador estilo Steve
                        ctx.fillStyle = '#ef4444'; // Cuerpo
                        ctx.fillRect(player.x, player.y, player.width, player.height);

                        ctx.fillStyle = '#fff';
                        ctx.font = '12px sans-serif';
                        ctx.fillText(document.getElementById('nickname').value, player.x - 5, player.y - 8);
                    }

                    function loop() {
                        update();
                        render();
                        requestAnimationFrame(loop);
                    }
                    loop();
                }
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}`));