import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot, collection, writeBatch, 
    updateDoc, deleteDoc, getDocs, addDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const CUSTOM_FIREBASE_CONFIG = {
    apiKey: "AIzaSyC-QaPr7O6RkWR3vpXCg4zrnUWw3TzU9ss",
    authDomain: "g-2cb53.firebaseapp.com",
    projectId: "g-2cb53",
    storageBucket: "g-2cb53.firebasestorage.app",
    messagingSenderId: "292095146978",
    appId: "1:292095146978:web:836d833230907d081017bb"
};

const appId = CUSTOM_FIREBASE_CONFIG.projectId;
let app, db, auth;

let isMasterAdminMode = false; 
let isWriterMode = false; 
let currentPage = 'home';
let currentAccessId = 'ANONYMOUS'; 
let currentReportId = ''; 
let processingPendingId = null; 

let selectedKillers = []; 
let selectedAssists = []; 
let selectedHealers = []; 
let targetEntryCount = 0; 
window.isEditingMode = false; 

// Base de Dados Local
let ninjasData = {}; 
let reportsData = []; 
let eventReportsData = []; 
let pendingData = []; 
let accessKeysData = {}; 

const COLLECTIONS = {
    REPORTS: `artifacts/${appId}/public/data/reports`,
    EVENT_REPORTS: `artifacts/${appId}/public/data/event_reports`, 
    PENDING_REPORTS: `artifacts/${appId}/public/data/pending_reports`, 
    NINJAS: `artifacts/${appId}/public/data/ninjas`, 
    ACCESS_KEYS: `artifacts/${appId}/public/data/access_keys`
};

const MAESTRIAS_OPCOES = ["Fogo", "Água", "Vento", "Terra", "Raio", "Med (Chakra)", "Med (Int)", "WM", "TAI"];

// ==========================================
// FUNÇÕES ÚTEIS E MODAIS
// ==========================================
function getRankIcon(rank) {
    if (rank === 1) return '🥇'; if (rank === 2) return '🥈'; if (rank === 3) return '🥉'; return `#${rank}`;
}
function normalizeId(id) { return id.trim().toLowerCase(); }

let resolveModalPromise = null; 
window.openCustomModal = function(title, message, type, data = {}) {
    return new Promise(resolve => {
        resolveModalPromise = resolve;
        const modal = document.getElementById('custom-modal');
        document.getElementById('modal-title').textContent = title; 
        document.getElementById('modal-message').innerHTML = message;
        
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const inputContainer = document.getElementById('modal-input-container');
        const input1 = document.getElementById('modal-input-1'), select1 = document.getElementById('modal-select-1'), select2 = document.getElementById('modal-select-2');
        const label1 = document.getElementById('input-label-1'), label2 = document.getElementById('input-label-2');

        inputContainer.classList.add('hidden'); input1.classList.add('hidden'); select1.classList.add('hidden'); select2.classList.add('hidden'); label1.classList.add('hidden'); label2.classList.add('hidden');
        confirmBtn.className = 'px-4 py-2 text-white font-semibold rounded-lg transition duration-150 bg-blue-600 hover:bg-blue-700';

        if (type === 'confirm') { 
            confirmBtn.textContent = 'Confirmar'; confirmBtn.classList.replace('bg-blue-600', 'bg-red-600'); 
        } else if (type === 'photoEdit') {
            inputContainer.classList.remove('hidden'); label1.classList.remove('hidden'); input1.classList.remove('hidden');
            label1.textContent = 'URL da Imagem:'; input1.type = 'text'; input1.value = data.url || '';
            confirmBtn.textContent = 'Salvar Foto';
            confirmBtn.onclick = () => closeCustomModal({ url: input1.value.trim() });
        }

        cancelBtn.onclick = () => closeCustomModal(false);
        if (type !== 'photoEdit') confirmBtn.onclick = () => closeCustomModal(true);
        modal.classList.remove('hidden'); modal.classList.add('flex');
    });
}

function closeCustomModal(result) {
    document.getElementById('custom-modal').classList.add('hidden'); document.getElementById('custom-modal').classList.remove('flex');
    if (resolveModalPromise) { resolveModalPromise(result); resolveModalPromise = null; }
}

// ==========================================
// FORMULÁRIO DE REGISTRO E CÁLCULOS
// ==========================================
window.generateReportId = function() {
    const el = document.getElementById('report-id-display');
    if (!el) return;
    currentReportId = `BT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${crypto.randomUUID().substring(0, 8)}`;
    el.value = currentReportId;
}

window.addTargetEntry = function() {
    const container = document.getElementById('targets-container'); if (!container) return;
    targetEntryCount++; const targetId = `target-${targetEntryCount}`;
    container.insertAdjacentHTML('beforeend', `
        <div id="${targetId}" class="target-entry bg-gray-700 p-4 rounded-lg border border-gray-600 space-y-3 relative mb-4">
            <button type="button" onclick="window.removeTargetEntry('${targetId}')" class="absolute top-2 right-2 text-red-400 font-bold">✖</button>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label class="block text-sm text-gray-300">Alvo Morto (Nick)</label><input type="text" class="target-name w-full p-2 rounded bg-gray-800 text-white" oninput="window.updateDescriptionPreview()"></div>
                <div><label class="block text-sm text-gray-300">BT Base</label><input type="number" min="0" class="target-bt w-full p-2 rounded bg-gray-800 text-white font-bold" oninput="window.updateDescriptionPreview()"></div>
            </div>
            <div class="flex gap-4 mt-2 pt-2 border-t border-gray-600">
                <label><input type="checkbox" class="target-chk-special" onchange="window.updateDescriptionPreview()"><span class="text-gray-200 text-sm ml-2">Kage (x3)</span></label>
                <label><input type="checkbox" class="target-chk-org" onchange="window.updateDescriptionPreview()"><span class="text-gray-200 text-sm ml-2">ORG (+100)</span></label>
                <label><input type="checkbox" class="target-chk-trashtalk" onchange="window.updateDescriptionPreview()"><span class="text-gray-200 text-sm ml-2">Trash Talk (+20)</span></label>
            </div>
        </div>`);
    window.updateDescriptionPreview();
}

window.removeTargetEntry = function(id) { const el = document.getElementById(id); if (el) { el.remove(); window.updateDescriptionPreview(); } }

function _gatherReportData() {
    let totalPointsRaw = 0; const targetsData = [];
    document.querySelectorAll('.target-entry').forEach((entry, idx) => {
        const name = entry.querySelector('.target-name').value.trim() || `Alvo ${idx + 1}`;
        let btBase = parseInt(entry.querySelector('.target-bt').value || '0', 10); if (isNaN(btBase)) btBase = 0;
        const isSpecial = entry.querySelector('.target-chk-special').checked, isOrg = entry.querySelector('.target-chk-org').checked, isTrashTalk = entry.querySelector('.target-chk-trashtalk').checked;
        let targetTotal = btBase; if (isSpecial) targetTotal *= 3; if (isOrg) targetTotal += 100; if (isTrashTalk) targetTotal += 20;
        totalPointsRaw += targetTotal;
        targetsData.push({ name, btBase, isSpecial, isOrg, isTrashTalk, total: targetTotal });
    });

    if (!currentReportId) window.generateReportId();
    
    // Captura qual radio button está marcado (Dia a dia ou Evento)
    const reportTypeRadio = document.querySelector('input[name="report_type"]:checked');
    const isEvent = reportTypeRadio ? reportTypeRadio.value === 'event' : false;

    return {
        reportId: currentReportId, isEvent: isEvent,
        targets: targetsData, killerIds: selectedKillers, assistIds: selectedAssists, healerIds: selectedHealers,
        totalPointsRaw: totalPointsRaw, pointsPerKiller: totalPointsRaw, pointsPerAssist: selectedAssists.length > 0 ? Math.floor(totalPointsRaw / 3) : 0, pointsPerHealer: totalPointsRaw,
        timestamp: new Date().toISOString()
    };
}

window.updateDescriptionPreview = function() {
    const data = _gatherReportData();
    const btn = document.getElementById('submit-report');
    if (!btn) return;
    
    document.getElementById('total-points').value = `Soma: ${data.totalPointsRaw} (Killer: ${data.pointsPerKiller} | Assists: ${data.pointsPerAssist})`;
    const isReady = isWriterMode && (data.killerIds.length + data.assistIds.length + data.healerIds.length) > 0 && data.targets.length > 0 && data.totalPointsRaw > 0;
    
    btn.disabled = !isReady; 
    btn.className = isReady ? 'w-full py-3 mt-4 bg-red-600 hover:bg-red-700 rounded-lg font-bold text-white shadow-lg' : 'w-full py-3 mt-4 bg-red-600/50 rounded-lg font-bold text-white cursor-not-allowed';
}

window.submitReport = async function() {
    if (!isWriterMode) return;
    const data = _gatherReportData(), statusEl = document.getElementById('status');
    
    if (!data.reportId) { window.openCustomModal('Erro', 'ID Inválido, recarregue a página.', 'info'); return; }

    statusEl.classList.remove('hidden'); statusEl.className = 'text-yellow-400 p-4 bg-yellow-900/50 rounded block';
    statusEl.textContent = 'Salvando no Banco de Dados...';

    const batch = writeBatch(db);
    try {
        // Define para qual coleção vai (Histórico Geral ou Histórico do Evento)
        const collectionToUse = data.isEvent ? COLLECTIONS.EVENT_REPORTS : COLLECTIONS.REPORTS;
        batch.set(doc(db, collectionToUse, data.reportId), data); 
        
        if (processingPendingId) { batch.delete(doc(db, COLLECTIONS.PENDING_REPORTS, processingPendingId)); }

        // Atualiza a pontuação dos membros
        const pointField = data.isEvent ? 'eventPoints' : 'rankPoints';
        const missionField = data.isEvent ? 'eventMissionsCompleted' : 'missionsCompleted';

        data.killerIds.forEach(id => batch.set(doc(db, COLLECTIONS.NINJAS, id), { [pointField]: Number(ninjasData[id]?.[pointField] || 0) + data.pointsPerKiller, [missionField]: Number(ninjasData[id]?.[missionField] || 0) + 1 }, { merge: true }));
        data.assistIds.forEach(id => batch.set(doc(db, COLLECTIONS.NINJAS, id), { [pointField]: Number(ninjasData[id]?.[pointField] || 0) + data.pointsPerAssist, [missionField]: Number(ninjasData[id]?.[missionField] || 0) + 1 }, { merge: true }));
        data.healerIds.forEach(id => batch.set(doc(db, COLLECTIONS.NINJAS, id), { [pointField]: Number(ninjasData[id]?.[pointField] || 0) + data.pointsPerHealer, [missionField]: Number(ninjasData[id]?.[missionField] || 0) + 1 }, { merge: true }));

        await batch.commit();
        
        statusEl.textContent = `✅ Registro efetuado com sucesso!`; statusEl.className = 'text-green-400 p-4 bg-green-900/50 rounded block';
        
        // Limpa o form
        selectedKillers = []; selectedAssists = []; selectedHealers = []; processingPendingId = null;
        window.updateExecutorTags(); window.updateExecutorSelect(); window.generateReportId();
        document.getElementById('targets-container').innerHTML = ''; window.addTargetEntry(); window.updateDescriptionPreview();

        setTimeout(() => { statusEl.classList.add('hidden'); }, 3000);

    } catch (e) { statusEl.textContent = `❌ Erro: ${e.message}`; statusEl.className = 'text-red-400 p-4 bg-red-900/50 rounded block'; }
}

// ==========================================
// SELEÇÃO DE MEMBROS (PT)
// ==========================================
window.updateExecutorSelect = function() {
    const sK = document.getElementById('new-killer-id-select'), sA = document.getElementById('new-assist-id-select'), sH = document.getElementById('new-healer-id-select');
    if (!sK) return;
    const active = Object.values(ninjasData).filter(n => n.isActive).sort((a,b) => (a.id||'').localeCompare(b.id||''));
    let optK = '<option value="" disabled selected>Selecionar Killer</option>', optA = '<option value="" disabled selected>Selecionar Assist</option>', optH = '<option value="" disabled selected>Selecionar Healer</option>';

    active.forEach(n => {
        if (!selectedKillers.includes(n.id) && !selectedAssists.includes(n.id) && !selectedHealers.includes(n.id)) {
            optK += `<option value="${n.id}">${n.id}</option>`; optA += `<option value="${n.id}">${n.id}</option>`; optH += `<option value="${n.id}">${n.id}</option>`;
        }
    });
    sK.innerHTML = optK; sA.innerHTML = optA; sH.innerHTML = optH;
}

window.addExecutor = function(type) {
    const targetArray = type === 'killer' ? selectedKillers : (type === 'assist' ? selectedAssists : selectedHealers);
    const select = document.getElementById(`new-${type}-id-select`);
    if (!select || !select.value) return;
    targetArray.push(select.value); select.value = ''; 
    window.updateExecutorTags(); window.updateExecutorSelect(); window.updateDescriptionPreview(); 
}

window.removeExecutor = function(id, type) {
    if (type === 'killer') selectedKillers = selectedKillers.filter(x => x !== id);
    if (type === 'assist') selectedAssists = selectedAssists.filter(x => x !== id);
    if (type === 'healer') selectedHealers = selectedHealers.filter(x => x !== id);
    window.updateExecutorTags(); window.updateExecutorSelect(); window.updateDescriptionPreview(); 
}

window.updateExecutorTags = function() { 
    const cK = document.getElementById('killers-tag-container'), cA = document.getElementById('assists-tag-container'), cH = document.getElementById('healers-tag-container');
    if (!cK) return;
    cK.innerHTML = selectedKillers.length ? selectedKillers.map(id => `<span class="executor-tag killer-tag">${id}<span class="executor-remove-btn" onclick="window.removeExecutor('${id}', 'killer')">✖</span></span>`).join('') : '';
    cA.innerHTML = selectedAssists.length ? selectedAssists.map(id => `<span class="executor-tag assist-tag">${id}<span class="executor-remove-btn" onclick="window.removeExecutor('${id}', 'assist')">✖</span></span>`).join('') : '';
    cH.innerHTML = selectedHealers.length ? selectedHealers.map(id => `<span class="executor-tag healer-tag">${id}<span class="executor-remove-btn" onclick="window.removeExecutor('${id}', 'healer')">✖</span></span>`).join('') : '';
}

// ==========================================
// PAINEL DE ADMINISTRAÇÃO E CADASTRO
// ==========================================
window.addNinja = async function() {
    if (!isMasterAdminMode) return;
    const ninjaId = document.getElementById('new-ninja-id').value.trim();
    const m1 = document.getElementById('new-ninja-mastery-1').value;
    const m2 = document.getElementById('new-ninja-mastery-2').value;
    const normalizedId = normalizeId(ninjaId);

    if (!ninjaId) { alert("O ID não pode ser vazio."); return; }
    if (ninjasData[normalizedId]) { alert(`Membro '${normalizedId}' já existe!`); return; }

    let finalElement = m1; if (m2 && m2 !== m1) finalElement += ` / ${m2}`;

    try {
        await setDoc(doc(db, COLLECTIONS.NINJAS, normalizedId), {
            id: normalizedId, element: finalElement, isActive: true, 
            rankPoints: 0, missionsCompleted: 0, eventPoints: 0, eventMissionsCompleted: 0
        });
        document.getElementById('new-ninja-id').value = ''; 
        alert("Cadastrado com sucesso!");
    } catch (e) { alert("Erro ao cadastrar: " + e.message); }
}

window.deleteNinja = async function(id) {
    if (!isMasterAdminMode) return;
    const confirm = await window.openCustomModal('Excluir Membro', `Deseja realmente apagar os dados de ${id}?`, 'confirm');
    if (confirm) {
        try { await deleteDoc(doc(db, COLLECTIONS.NINJAS, id)); } catch(e) {}
    }
}

window.editNinjaAvatar = function(id) {
    if (!isMasterAdminMode) return;
    const ninja = ninjasData[id];
    window.openCustomModal('Foto de Perfil', `Cole o link (URL) da imagem.`, 'photoEdit', { url: ninja.avatarUrl || '' })
    .then(async (res) => {
        if (res !== false) { try { await updateDoc(doc(db, COLLECTIONS.NINJAS, id), { avatarUrl: res.url }); } catch (e) {} }
    });
}

// ==========================================
// RENDERIZAÇÃO DAS TELAS
// ==========================================
window.renderScoreboard = function(isEvent = false) {
    const scoreboardBody = document.getElementById(isEvent ? 'event-scoreboard' : 'ninjas-scoreboard');
    if (!scoreboardBody) return; 
    
    const guardians = Object.values(ninjasData).filter(n => n.isActive && n.id); 
    const pointProperty = isEvent ? 'eventPoints' : 'rankPoints';
    const missionProperty = isEvent ? 'eventMissionsCompleted' : 'missionsCompleted';
    
    guardians.sort((a, b) => Number(b[pointProperty] || 0) - Number(a[pointProperty] || 0));
    
    scoreboardBody.innerHTML = '';
    guardians.forEach((ninja, index) => {
        const pts = Number(ninja[pointProperty] || 0);
        if (isEvent && pts === 0) return; // No evento, só mostra quem tem ponto
        
        scoreboardBody.innerHTML += `
            <tr class="hover:bg-gray-700/50">
                <td class="px-6 py-3 font-bold text-center">${getRankIcon(index + 1)}</td>
                <td class="px-6 py-3 font-medium text-white">${ninja.id}</td>
                <td class="px-6 py-3 font-bold text-green-400">${Math.round(pts)} Pts</td>
                <td class="px-6 py-3 text-gray-300">${ninja[missionProperty] || 0}</td>
            </tr>`;
    });
}

window.renderReportsLogFiltered = function() {
    const reportsLog = document.getElementById('reports-log');
    if (!reportsLog) return;
    reportsLog.innerHTML = '';
    
    if (reportsData.length === 0) { reportsLog.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-500">Nenhum registro.</td></tr>`; return; }

    const sorted = [...reportsData].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50); 
    sorted.forEach(data => {
        let membersText = '';
        if (data.killerIds?.length) membersText += `<span class="text-red-400 text-xs font-bold block">Killer: ${data.killerIds.join(', ')}</span>`;
        if (data.assistIds?.length) membersText += `<span class="text-orange-400 text-xs font-bold block">Assist: ${data.assistIds.join(', ')}</span>`;
        if (data.healerIds?.length) membersText += `<span class="text-green-400 text-xs font-bold block">Heal: ${data.healerIds.join(', ')}</span>`;
        
        let targetText = data.targets ? data.targets.map(t => t.name).join(', ') : 'N/A';
        reportsLog.innerHTML += `<tr class="hover:bg-gray-700/50"><td class="p-3 text-xs text-gray-400 font-mono align-top">${data.reportId}</td><td class="p-3 text-sm w-3/12 align-top">${membersText}</td><td class="p-3 text-sm text-orange-300 font-bold align-top capitalize">${targetText}</td><td class="p-3 text-sm text-white font-bold align-top">${data.totalPointsRaw || 0} Pts</td></tr>`;
    });
}

window.renderPage = function(pageName) {
    currentPage = pageName;
    const contentDiv = document.getElementById('content');
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    if (document.getElementById(`nav-${pageName}`)) document.getElementById(`nav-${pageName}`).classList.add('active');

    contentDiv.innerHTML = '';

    switch (pageName) {
        case 'home': 
            contentDiv.innerHTML = `<section class="text-center py-20 bg-gray-800 rounded-xl shadow-2xl"><h2 class="text-3xl font-bold text-red-400">QG Forças Especiais da Leaf</h2></section>`; 
            break;
        case 'scoreboard': 
            contentDiv.innerHTML = `<section class="space-y-4 pt-8"><h2 class="text-3xl font-bold text-red-400 text-center">Rank Geral (Dia-a-Dia)</h2><div class="bg-gray-800 p-4 rounded-xl shadow-xl overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-700"><tr><th class="px-6 py-3 text-left text-xs text-gray-300">Rank</th><th class="px-6 py-3 text-left text-xs text-gray-300">Membro</th><th class="px-6 py-3 text-left text-xs text-gray-300">Pontos</th><th class="px-6 py-3 text-left text-xs text-gray-300">Missões</th></tr></thead><tbody id="ninjas-scoreboard" class="divide-y divide-gray-700"></tbody></table></div></section>`; 
            window.renderScoreboard(false); 
            break;
        case 'event_panel': 
            contentDiv.innerHTML = `<section class="space-y-4 pt-8"><h2 class="text-3xl font-black text-yellow-400 text-center uppercase tracking-widest">🌟 RANK DO EVENTO 🌟</h2><p class="text-center text-gray-400">Pontuação isolada para eventos especiais.</p><div class="bg-gray-800 border-2 border-yellow-600/50 p-4 rounded-xl shadow-[0_0_15px_rgba(202,138,4,0.3)] overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-900 border-b border-yellow-600/50"><tr><th class="px-6 py-3 text-left text-xs text-yellow-400">Rank</th><th class="px-6 py-3 text-left text-xs text-yellow-400">Membro</th><th class="px-6 py-3 text-left text-xs text-yellow-400">Pontos do Evento</th><th class="px-6 py-3 text-left text-xs text-yellow-400">Missões do Evento</th></tr></thead><tbody id="event-scoreboard" class="divide-y divide-gray-700"></tbody></table></div></section>`; 
            window.renderScoreboard(true); 
            break;
        case 'reports_log': 
            contentDiv.innerHTML = `<section class="space-y-4 pt-8"><h2 class="text-3xl font-bold text-red-400 text-center">Histórico Geral</h2><div class="bg-gray-800 p-4 rounded-xl shadow-xl overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-700"><tr><th class="p-3 text-left text-xs text-gray-300">ID</th><th class="p-3 text-left text-xs text-gray-300">Membros</th><th class="p-3 text-left text-xs text-gray-300">Alvos</th><th class="p-3 text-left text-xs text-gray-300">Pontos</th></tr></thead><tbody id="reports-log" class="divide-y divide-gray-700"></tbody></table></div></section>`; 
            window.renderReportsLogFiltered(); 
            break;
        case 'report_form':
            contentDiv.innerHTML = `
            <section class="bg-gray-800 p-6 rounded-xl shadow-2xl space-y-6">
                <h2 class="text-3xl font-semibold border-b pb-3 border-gray-700 text-red-400 text-center">Registro de Missão</h2>
                
                <div class="bg-gray-900 p-4 rounded-lg border border-gray-700">
                    <label class="block text-sm font-medium text-gray-300 mb-2">Destino da Pontuação:</label>
                    <div class="flex gap-6">
                        <label class="flex items-center space-x-2 cursor-pointer"><input type="radio" name="report_type" value="daily" checked class="h-5 w-5"><span class="text-white font-bold">Dia-a-Dia (Geral)</span></label>
                        <label class="flex items-center space-x-2 cursor-pointer"><input type="radio" name="report_type" value="event" class="h-5 w-5"><span class="text-yellow-400 font-bold">Evento Especial 🌟</span></label>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="block text-sm text-gray-300">Killer</label><div class="flex gap-2"><select id="new-killer-id-select" class="flex-grow p-2 rounded bg-gray-700 text-white"></select><button onclick="window.addExecutor('killer')" class="px-4 bg-red-600 text-white rounded">Add</button></div><div id="killers-tag-container" class="executor-list-container mt-2"></div></div>
                    <div><label class="block text-sm text-gray-300">Assistência</label><div class="flex gap-2"><select id="new-assist-id-select" class="flex-grow p-2 rounded bg-gray-700 text-white"></select><button onclick="window.addExecutor('assist')" class="px-4 bg-orange-600 text-white rounded">Add</button></div><div id="assists-tag-container" class="executor-list-container mt-2"></div></div>
                </div>
                <div class="space-y-4 border-t border-gray-700 pt-4"><div class="flex justify-between items-center"><h3 class="text-xl font-bold text-red-400">Alvos Mortos</h3><button onclick="window.addTargetEntry()" class="py-1 px-3 bg-blue-600 text-white rounded font-bold">➕ Add Alvo</button></div><div id="targets-container" class="space-y-4"></div></div>
                <div class="space-y-2 border-t border-gray-700 pt-4"><label class="block text-sm text-gray-300">ID da Missão</label><input id="report-id-display" type="text" readonly class="w-full p-2 bg-gray-600 text-red-300 font-mono cursor-not-allowed"></div>
                <div class="space-y-2 pt-4"><input id="total-points" type="text" readonly class="w-full p-2 bg-gray-600 text-green-400 font-bold cursor-not-allowed" value="..."></div>
                <button id="submit-report" class="w-full py-3 mt-4 bg-red-600/50 text-white font-bold rounded cursor-not-allowed" disabled onclick="window.submitReport()">Salvar Caçada</button>
            </section>`;
            if (!window.isEditingMode) { window.updateExecutorSelect(); window.generateReportId(); window.addTargetEntry(); }
            break;
        case 'admin_panel': 
            contentDiv.innerHTML = `<section class="bg-gray-900 p-6 rounded-xl border border-red-500/50 max-w-lg mx-auto mt-8"><h2 class="text-2xl font-bold text-red-400 text-center mb-4">Acesso Restrito</h2><input id="access-id-input" type="text" placeholder="Seu ID" class="w-full p-2 mb-2 bg-gray-700 text-white rounded"><input id="access-key-input" type="password" placeholder="Sua Senha" class="w-full p-2 mb-4 bg-gray-700 text-white rounded"><button class="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded" onclick="window.checkAccessKey()">Entrar</button></section>
            
            <section class="mt-8 admin-only hidden space-y-4">
                <h2 class="text-3xl font-bold text-yellow-400 text-center">Cadastro de Membros</h2>
                <div id="add-ninja-form" class="bg-gray-700 p-4 rounded-lg flex flex-col sm:flex-row gap-4 flex-wrap">
                    <input id="new-ninja-id" type="text" placeholder="Nick do Membro" class="flex-grow p-2 rounded bg-gray-800 text-white border border-gray-600 min-w-[200px]">
                    <select id="new-ninja-mastery-1" class="w-full sm:w-40 p-2 rounded bg-gray-800 text-white"><option value="Fogo">Fogo</option><option value="Água">Água</option><option value="Vento">Vento</option><option value="Terra">Terra</option><option value="Raio">Raio</option><option value="Med (Chakra)">Med (Chakra)</option><option value="Med (Int)">Med (Int)</option><option value="WM">WM</option><option value="TAI">TAI</option></select>
                    <select id="new-ninja-mastery-2" class="w-full sm:w-40 p-2 rounded bg-gray-800 text-white"><option value="">Nenhuma</option><option value="Fogo">Fogo</option><option value="Água">Água</option><option value="Vento">Vento</option><option value="Terra">Terra</option><option value="Raio">Raio</option><option value="Med (Chakra)">Med (Chakra)</option><option value="Med (Int)">Med (Int)</option><option value="WM">WM</option><option value="TAI">TAI</option></select>
                    <button class="py-2 px-4 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded" onclick="window.addNinja()">Cadastrar</button>
                </div>
                
                <div class="bg-gray-800 p-4 rounded-xl shadow-xl overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-700"><tr><th class="px-4 py-3 text-left text-xs text-gray-300">Membro</th><th class="px-4 py-3 text-left text-xs text-gray-300">Maestria</th><th class="px-4 py-3 text-right text-xs text-gray-300">Ações</th></tr></thead><tbody id="ninjas-cadastro" class="divide-y divide-gray-700"></tbody></table></div>
            </section>`; 
            
            if (isMasterAdminMode) {
                const tbody = document.getElementById('ninjas-cadastro');
                Object.values(ninjasData).sort((a,b)=>a.id.localeCompare(b.id)).forEach(data => {
                    tbody.innerHTML += `<tr class="hover:bg-gray-700/50"><td class="px-4 py-3 font-bold text-white">${data.id}</td><td class="px-4 py-3 text-gray-300">${data.element||''}</td><td class="px-4 py-3 text-right"><button onclick="window.editNinjaAvatar('${data.id}')" class="text-purple-400 bg-gray-900 px-2 py-1 rounded mr-2">📷 Foto</button><button onclick="window.deleteNinja('${data.id}')" class="text-red-500 bg-gray-900 px-2 py-1 rounded">Excluir</button></td></tr>`;
                });
            }
            break;
    }
    
    document.querySelectorAll('.writer-only').forEach(el => isWriterMode ? el.classList.remove('hidden') : el.classList.add('hidden'));
    document.querySelectorAll('.admin-only').forEach(el => isMasterAdminMode ? el.classList.remove('hidden') : el.classList.add('hidden'));
}

// ==========================================
// INICIALIZAÇÃO FIREBASE (CORRIGIDA)
// ==========================================
async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig); db = getFirestore(app); auth = getAuth(app);
        await signInAnonymously(auth);
        document.getElementById('auth-info').textContent = `Conexão Segura Estabelecida`;
        
        onSnapshot(collection(db, COLLECTIONS.ACCESS_KEYS), (snap) => { accessKeysData = {}; snap.forEach(doc => accessKeysData[doc.id] = doc.data()); });
        
        onSnapshot(collection(db, COLLECTIONS.NINJAS), (snap) => { 
            ninjasData = {}; snap.forEach(doc => ninjasData[doc.id] = doc.data()); 
            if (['scoreboard', 'event_panel', 'admin_panel'].includes(currentPage)) window.renderPage(currentPage); 
        });
        
        onSnapshot(collection(db, COLLECTIONS.REPORTS), (snap) => { 
            reportsData = []; snap.forEach(doc => reportsData.push(doc.data())); 
            if (currentPage === 'reports_log') window.renderPage(currentPage); 
        });
        
        onSnapshot(collection(db, COLLECTIONS.EVENT_REPORTS), (snap) => { 
            eventReportsData = []; snap.forEach(doc => eventReportsData.push(doc.data())); 
        });

        window.renderPage(currentPage);

    } catch (error) { document.getElementById('status').textContent = `❌ Erro: ${error.message}`; document.getElementById('status').classList.remove('hidden'); }
}

window.checkAccessKey = function() {
    const id = document.getElementById('access-id-input').value.trim(), key = document.getElementById('access-key-input').value.trim();
    if (accessKeysData[id] && accessKeysData[id].key === key) {
        currentAccessId = id; 
        isMasterAdminMode = accessKeysData[id].level === 'master_admin'; 
        isWriterMode = true; 
        window.renderPage('home');
    } else { alert("Senha incorreta"); }
}

// Inicia o motor assim que o arquivo é lido
initializeFirebase();
