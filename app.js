import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot, collection, writeBatch, 
    updateDoc, deleteDoc, getDocs, addDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Configurações do Firebase
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

// Variáveis Globais
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

let ninjasData = {}; 
let reportsData = []; 
let pendingData = []; 
let accessKeysData = {}; 

const COLLECTIONS = {
    REPORTS: `artifacts/${appId}/public/data/reports`,
    PENDING_REPORTS: `artifacts/${appId}/public/data/pending_reports`, 
    NINJAS: `artifacts/${appId}/public/data/ninjas`, 
    ACCESS_KEYS: `artifacts/${appId}/public/data/access_keys`, 
    AUDIT_LOG: `artifacts/${appId}/users/audit_user_log/audit_events` 
};

const MAESTRIAS_OPCOES = ["Fogo", "Água", "Vento", "Terra", "Raio", "Med (Chakra)", "Med (Int)", "WM", "TAI"];

// ==========================================
// FUNÇÕES DE UTILIDADE E MODAIS
// ==========================================
window.logAction = async function(action, details) {
    if (!db) return;
    try {
        await addDoc(collection(db, COLLECTIONS.AUDIT_LOG), {
            timestamp: new Date().toISOString(), actorAccessId: currentAccessId, action: action, details: details, level: isMasterAdminMode ? 'MASTER_ADMIN' : (isWriterMode ? 'WRITER' : 'ANON')
        });
    } catch (e) { console.error(e); }
}

function getRankIcon(rank) {
    if (rank === 1) return '🥇'; if (rank === 2) return '🥈'; if (rank === 3) return '🥉'; return `#${rank}`;
}
function normalizeId(id) { return id.trim().toLowerCase(); }

let resolveModalPromise = null; 
window.openCustomModal = function(title, message, type, data = {}) {
    return new Promise(resolve => {
        resolveModalPromise = resolve;
        const modal = document.getElementById('custom-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalMessage = document.getElementById('modal-message');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const inputContainer = document.getElementById('modal-input-container');
        const input1 = document.getElementById('modal-input-1'), select1 = document.getElementById('modal-select-1'), select2 = document.getElementById('modal-select-2');
        const label1 = document.getElementById('input-label-1'), label2 = document.getElementById('input-label-2');

        modalTitle.textContent = title; modalMessage.textContent = message;
        inputContainer.classList.add('hidden'); input1.classList.add('hidden'); select1.classList.add('hidden'); select2.classList.add('hidden'); label1.classList.add('hidden'); label2.classList.add('hidden');
        
        confirmBtn.onclick = null; cancelBtn.onclick = null;
        confirmBtn.className = 'px-4 py-2 text-white font-semibold rounded-lg transition duration-150 bg-blue-600 hover:bg-blue-700';

        if (type === 'confirm') { 
            confirmBtn.textContent = 'Confirmar'; confirmBtn.classList.replace('bg-blue-600', 'bg-red-600'); confirmBtn.classList.replace('hover:bg-blue-700', 'hover:bg-red-700'); 
        } 
        else if (type === 'ninjaEdit') {
            const statusText = data.isActive ? 'Ativo' : 'Inativo'; const newStatusText = data.isActive ? 'INATIVO' : 'ATIVO';
            modalMessage.innerHTML = `Membro **${data.id}** está <span class="font-bold ${data.isActive ? 'text-green-400' : 'text-red-400'}">${statusText}</span>. Mudar para **${newStatusText}**?`;
            confirmBtn.textContent = `Alternar Status`; confirmBtn.classList.replace('bg-blue-600', 'bg-orange-600'); 
        } 
        else if (type === 'masteryEdit') {
            inputContainer.classList.remove('hidden');
            label1.textContent = '1ª Maestria:'; label1.classList.remove('hidden'); select1.classList.remove('hidden');
            select1.innerHTML = MAESTRIAS_OPCOES.map(m => `<option value="${m}">${m}</option>`).join('');
            if (data.m1) select1.value = data.m1;
            label2.textContent = '2ª Maestria (Opcional):'; label2.classList.remove('hidden'); select2.classList.remove('hidden');
            select2.innerHTML = '<option value="">-- Nenhuma --</option>' + MAESTRIAS_OPCOES.map(m => `<option value="${m}">${m}</option>`).join('');
            if (data.m2) select2.value = data.m2;
            confirmBtn.textContent = `Salvar`; confirmBtn.onclick = () => closeCustomModal({ m1: select1.value, m2: select2.value });
        }
        else if (type === 'photoEdit') {
            inputContainer.classList.remove('hidden');
            label1.textContent = 'Cole o link da Imagem (URL):'; label1.classList.remove('hidden');
            input1.classList.remove('hidden'); input1.type = 'text'; input1.placeholder = 'https://exemplo.com/foto.png';
            input1.value = data.url || '';
            confirmBtn.textContent = 'Salvar Foto';
            confirmBtn.onclick = () => closeCustomModal({ url: input1.value.trim() });
        }

        cancelBtn.onclick = () => closeCustomModal(false);
        if (type !== 'masteryEdit' && type !== 'photoEdit') confirmBtn.onclick = () => closeCustomModal(true);
        modal.classList.remove('hidden'); modal.classList.add('flex');
    });
}

function closeCustomModal(result) {
    const modal = document.getElementById('custom-modal'); modal.classList.add('hidden'); modal.classList.remove('flex');
    if (resolveModalPromise) { resolveModalPromise(result); resolveModalPromise = null; }
}

// ==========================================
// REGISTRO DE FORMULÁRIO (CORRIGIDO)
// ==========================================
window.generateReportId = function() {
    const datePart = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const uuidPart = crypto.randomUUID().substring(0, 8);
    currentReportId = `BT-${datePart}-${uuidPart}`;
    const reportIdElement = document.getElementById('report-id-display');
    if (reportIdElement) {
        reportIdElement.value = currentReportId;
    }
}

window.updateTargetSuggestions = function() {
    try {
        const dataList = document.getElementById('known-targets'); if (!dataList) return;
        const targetsMap = {};
        reportsData.forEach(report => {
            if (Array.isArray(report.targets)) {
                report.targets.forEach(t => { if (t && t.name) targetsMap[t.name.trim().toLowerCase()] = t.name.trim(); });
            }
        });
        dataList.innerHTML = Object.values(targetsMap).sort().map(t => `<option value="${t}">`).join('');
    } catch(e) {}
}

window.addTargetEntry = function() {
    const container = document.getElementById('targets-container'); if (!container) return;
    targetEntryCount++; const targetId = `target-${targetEntryCount}`;
    const html = `
        <div id="${targetId}" class="target-entry bg-gray-700 p-4 rounded-lg border border-gray-600 space-y-3 relative mb-4">
            <button type="button" onclick="window.removeTargetEntry('${targetId}')" class="absolute top-2 right-2 text-red-400 font-bold">✖</button>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label class="block text-sm text-gray-300">Alvo Morto (Nick)</label><input type="text" list="known-targets" class="target-name w-full p-2.5 rounded-lg bg-gray-800 text-white border border-gray-600" oninput="window.updateDescriptionPreview()"></div>
                <div><label class="block text-sm text-gray-300">BT Base</label><input type="number" min="0" class="target-bt w-full p-2.5 rounded-lg bg-gray-800 text-white font-bold border border-gray-600" oninput="window.updateDescriptionPreview()"></div>
            </div>
            <div class="flex flex-wrap gap-4 mt-2 pt-2 border-t border-gray-600">
                <label class="flex items-center space-x-2"><input type="checkbox" class="target-chk-special form-checkbox" onchange="window.updateDescriptionPreview()"><span class="text-gray-200 text-sm">Kage (BT x3)</span></label>
                <label class="flex items-center space-x-2"><input type="checkbox" class="target-chk-org form-checkbox" onchange="window.updateDescriptionPreview()"><span class="text-gray-200 text-sm">ORG Especial (+100)</span></label>
                <label class="flex items-center space-x-2"><input type="checkbox" class="target-chk-trashtalk form-checkbox" onchange="window.updateDescriptionPreview()"><span class="text-gray-200 text-sm">Trash Talk (+20)</span></label>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', html); window.updateDescriptionPreview();
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

    if (!currentReportId) { window.generateReportId(); }

    return {
        reportId: currentReportId, targets: targetsData, killerIds: selectedKillers, assistIds: selectedAssists, healerIds: selectedHealers,
        totalPointsRaw: totalPointsRaw, pointsPerKiller: totalPointsRaw, pointsPerAssist: selectedAssists.length > 0 ? Math.floor(totalPointsRaw / 3) : 0, pointsPerHealer: totalPointsRaw,
        timestamp: new Date().toISOString()
    };
}

window.calculateTotalPoints = function() {
    const data = _gatherReportData(), input = document.getElementById('total-points'), btn = document.getElementById('submit-report');
    if (!data || !input || !btn) return;
    input.value = `Soma: ${data.totalPointsRaw} (Killer: ${data.pointsPerKiller} | Assists: ${data.pointsPerAssist} | Healers: ${data.pointsPerHealer})`;
    const isReady = isWriterMode && (data.killerIds.length + data.assistIds.length + data.healerIds.length) > 0 && data.targets.length > 0 && data.totalPointsRaw > 0;
    btn.disabled = !isReady; btn.className = isReady ? 'w-full py-3 mt-4 bg-red-600 hover:bg-red-700 rounded-lg font-bold text-white shadow-lg transition' : 'w-full py-3 mt-4 bg-red-600/50 rounded-lg font-bold text-white shadow-lg cursor-not-allowed';
}

window.updateDescriptionPreview = function() {
    const div = document.getElementById('description-preview'); if (!div) return;
    const data = _gatherReportData(); let text = ``;
    text += data.targets.length > 0 ? `Alvos: ` + data.targets.map(t => `${t.name} (${t.total} pts)`).join(', ') + `. ` : `[Nenhum alvo]. `;
    if (data.killerIds.length > 0) text += `Killer: ${data.killerIds.join(', ')}. `;
    if (data.assistIds.length > 0) text += `Assistência: ${data.assistIds.join(', ')}. `;
    if (data.healerIds.length > 0) text += `Healers: ${data.healerIds.join(', ')}. `;
    text += `=> TOTAL DA CAÇADA: ${data.totalPointsRaw} Pts.`; div.textContent = text.trim(); window.calculateTotalPoints();
}

window.submitReport = async function() {
    if (!isWriterMode) return;
    const data = _gatherReportData(), statusEl = document.getElementById('status');
    
    // Trava de segurança extra
    if (!data.reportId || data.reportId.trim() === '') {
        window.openCustomModal('Erro no Sistema', 'O ID do Relatório sumiu. Recarregue a página e tente novamente.', 'info'); return;
    }

    if (data.totalPointsRaw === 0 || (data.killerIds.length + data.assistIds.length + data.healerIds.length) === 0) {
         window.openCustomModal('Erro', 'Preencha o valor do BT e adicione membros na PT.', 'info'); return;
    }

    statusEl.classList.remove('hidden'); statusEl.className = 'text-yellow-400 p-4 bg-yellow-900/50 rounded-lg block';
    statusEl.textContent = 'Processando e salvando registros...';

    const batch = writeBatch(db);
    try {
        batch.set(doc(db, COLLECTIONS.REPORTS, data.reportId), data); 
        
        if (processingPendingId) {
            batch.delete(doc(db, COLLECTIONS.PENDING_REPORTS, processingPendingId));
        }

        if (!window.isEditingMode) {
            data.killerIds.forEach(id => batch.set(doc(db, COLLECTIONS.NINJAS, id), { rankPoints: (ninjasData[id]?.rankPoints || 0) + data.pointsPerKiller, missionsCompleted: (ninjasData[id]?.missionsCompleted || 0) + 1 }, { merge: true }));
            data.assistIds.forEach(id => batch.set(doc(db, COLLECTIONS.NINJAS, id), { rankPoints: (ninjasData[id]?.rankPoints || 0) + data.pointsPerAssist, missionsCompleted: (ninjasData[id]?.missionsCompleted || 0) + 1 }, { merge: true }));
            data.healerIds.forEach(id => batch.set(doc(db, COLLECTIONS.NINJAS, id), { rankPoints: (ninjasData[id]?.rankPoints || 0) + data.pointsPerHealer, missionsCompleted: (ninjasData[id]?.missionsCompleted || 0) + 1 }, { merge: true }));
        }

        await batch.commit();
        if (window.isEditingMode) { await window.recalculateAllRanks(true); window.isEditingMode = false; }
        
        statusEl.textContent = `✅ Registro efetuado com sucesso nas Forças Especiais!`; statusEl.className = 'text-green-400 p-4 bg-green-900/50 rounded-lg block';
        
        selectedKillers = []; selectedAssists = []; selectedHealers = []; processingPendingId = null;
        window.updateExecutorTags(); window.updateExecutorSelect(); window.generateReportId();
        document.getElementById('targets-container').innerHTML = ''; window.addTargetEntry(); window.updateDescriptionPreview();
        document.getElementById('submit-report').innerHTML = 'Salvar Caçada e Atualizar Rank';

        setTimeout(() => { statusEl.classList.add('hidden'); }, 4000);

    } catch (e) {
        console.error(e);
        statusEl.textContent = `❌ Erro: ${e.message}`; statusEl.className = 'text-red-400 p-4 bg-red-900/50 rounded-lg block';
    }
}

// ==========================================
// SELEÇÃO E TAGS DA PT
// ==========================================
window.updateExecutorSelect = function() {
    const selectKiller = document.getElementById('new-killer-id-select'), selectAssist = document.getElementById('new-assist-id-select'), selectHeal = document.getElementById('new-healer-id-select');
    if (!selectKiller) return;
    
    const activeNinjas = Object.values(ninjasData).filter(n => n.isActive).sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    let optK = '<option value="" disabled selected>Selecionar Killer</option>', optA = '<option value="" disabled selected>Selecionar Assistência</option>', optH = '<option value="" disabled selected>Selecionar Healer</option>';

    activeNinjas.forEach(n => {
        if (!selectedKillers.includes(n.id) && !selectedAssists.includes(n.id) && !selectedHealers.includes(n.id)) {
            optK += `<option value="${n.id}">${n.id}</option>`; optA += `<option value="${n.id}">${n.id}</option>`;
            if (n.element && n.element.includes('Med (Chakra)')) optH += `<option value="${n.id}">${n.id}</option>`;
        }
    });
    selectKiller.innerHTML = optK; selectAssist.innerHTML = optA; selectHeal.innerHTML = optH;
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
    cK.innerHTML = selectedKillers.length ? selectedKillers.map(id => `<span class="executor-tag killer-tag">${id}<span class="executor-remove-btn" onclick="window.removeExecutor('${id}', 'killer')">✖</span></span>`).join('') : '<span class="text-gray-400 text-sm italic">Nenhum selecionado.</span>';
    cA.innerHTML = selectedAssists.length ? selectedAssists.map(id => `<span class="executor-tag assist-tag">${id}<span class="executor-remove-btn" onclick="window.removeExecutor('${id}', 'assist')">✖</span></span>`).join('') : '<span class="text-gray-400 text-sm italic">Nenhuma selecionada.</span>';
    cH.innerHTML = selectedHealers.length ? selectedHealers.map(id => `<span class="executor-tag healer-tag">${id}<span class="executor-remove-btn" onclick="window.removeExecutor('${id}', 'healer')">✖</span></span>`).join('') : '<span class="text-gray-400 text-sm italic">Nenhum selecionado.</span>';
}

// ==========================================
// RENDERIZAÇÃO DAS TELAS PRINCIPAIS (HISTÓRICO E RANK)
// ==========================================
window.renderScoreboard = function() {
    const scoreboardBody = document.getElementById('ninjas-scoreboard');
    if (!scoreboardBody) return; 
    
    const guardians = Object.values(ninjasData).filter(n => n.isActive && n.id); 
    guardians.sort((a, b) => b.rankPoints - a.rankPoints);
    
    scoreboardBody.innerHTML = '';

    guardians.forEach((ninja, index) => {
        const rankIcon = getRankIcon(index + 1);
        const elementIcon = ninja.element ? ` <span class="text-xs text-gray-500">(${ninja.element})</span>` : '';
        scoreboardBody.innerHTML += `
            <tr class="hover:bg-gray-700/50">
                <td class="px-6 py-3 whitespace-nowrap text-sm font-bold text-center">${rankIcon}</td>
                <td class="px-6 py-3 whitespace-nowrap text-sm font-medium text-white">${ninja.id}${elementIcon}</td>
                <td class="px-6 py-3 whitespace-nowrap text-sm font-bold text-green-400">${Math.round(ninja.rankPoints)} Pts</td>
                <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-300">${ninja.missionsCompleted || 0}</td>
            </tr>
        `;
    });
}

window.renderReportsLogFiltered = function(filterId = null, targetId = 'reports-log') {
    const reportsLog = document.getElementById(targetId);
    if (!reportsLog) return;
    reportsLog.innerHTML = '';
    
    let filteredReports = reportsData;
    if (filterId) {
        filteredReports = reportsData.filter(r => 
            (r.killerIds || []).includes(filterId) || (r.assistIds || []).includes(filterId) || (r.healerIds || []).includes(filterId) || (r.executorIds || []).includes(filterId)
        );
    }

    if (filteredReports.length === 0) {
        reportsLog.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Nenhum registro encontrado.</td></tr>`;
        return;
    }

    const sorted = [...filteredReports].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100); 
    
    sorted.forEach(data => {
        let formattedDate = data.timestamp ? new Date(data.timestamp).toLocaleDateString('pt-BR') : 'Data Desconhecida';
        
        let membersText = '';
        if (data.killerIds?.length) membersText += `<span class="text-red-400 text-xs font-bold block">Killer: ${data.killerIds.join(', ')}</span>`;
        if (data.assistIds?.length) membersText += `<span class="text-orange-400 text-xs font-bold block">Assist: ${data.assistIds.join(', ')}</span>`;
        if (data.healerIds?.length) membersText += `<span class="text-green-400 text-xs font-bold block">Heal: ${data.healerIds.join(', ')}</span>`;
        
        let targetText = data.targets ? data.targets.map(t => t.name).join(', ') : (data.targetName || 'N/A');
        let descText = `<span class="text-white font-bold">${data.totalPointsRaw || 0} Pts</span>`;

        // Se estiver na tela principal de relatórios (e for admin), mostra botões de deletar
        let actionBtns = '';
        if ((isWriterMode || isMasterAdminMode) && targetId === 'reports-log') {
            actionBtns = `<br><button onclick="window.deleteReport('${data.reportId}')" class="text-red-500 hover:text-red-700 text-xs bg-gray-900 py-1 px-2 rounded mt-2">🗑️ Excluir</button>`;
        }

        reportsLog.innerHTML += `
            <tr class="hover:bg-gray-700/50">
                <td class="px-4 py-3 text-xs text-gray-400 font-mono align-top break-all">${data.reportId}${actionBtns}</td>
                <td class="px-4 py-3 whitespace-normal text-sm w-3/12 align-top">${membersText}</td>
                <td class="px-4 py-3 whitespace-normal text-sm text-orange-300 w-2/12 font-bold align-top capitalize">${targetText}</td>
                <td class="px-4 py-3 whitespace-normal text-sm text-gray-300 w-4/12 align-top">${descText}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 w-1/12 align-top">${formattedDate}</td>
            </tr>
        `;
    });
}

// ==========================================
// PAINEL DE MEMBROS E FOTO CUSTOMIZADA
// ==========================================
window.renderNinjaPanelContent = function(filterId) {
    const guardianSummaryDiv = document.getElementById('guardian-summary');
    const filteredContainer = document.getElementById('filtered-reports-container');
    
    if (!filterId) {
        if(guardianSummaryDiv) guardianSummaryDiv.classList.add('hidden');
        if(filteredContainer) filteredContainer.classList.add('hidden');
        return;
    }

    if(filteredContainer) filteredContainer.classList.remove('hidden');

    const ninjaData = ninjasData[filterId];
    if (ninjaData && guardianSummaryDiv) {
        const filteredReports = reportsData.filter(r => 
            (r.killerIds || []).includes(filterId) || (r.assistIds || []).includes(filterId) || (r.healerIds || []).includes(filterId) || (r.executorIds || []).includes(filterId)
        );

        let killCount = 0, killPoints = 0, assistCount = 0, assistPoints = 0, healCount = 0, healPoints = 0;
        filteredReports.forEach(r => {
            let targetsInReport = (r.targets && r.targets.length > 0) ? r.targets.length : 1;
            if ((r.killerIds || []).includes(filterId)) { killCount += targetsInReport; killPoints += (r.pointsPerKiller || r.totalPointsRaw || 0); }
            if ((r.assistIds || []).includes(filterId)) { assistCount += targetsInReport; assistPoints += (r.pointsPerAssist || 0); }
            if ((r.executorIds || []).includes(filterId) && !(r.killerIds || []).includes(filterId)) { killCount += targetsInReport; killPoints += (r.pointsPerAttacker || 0); }
            if ((r.healerIds || []).includes(filterId)) { healCount += targetsInReport; healPoints += (r.pointsPerHealer || r.totalPointsRaw || 0); }
        });

        // AQUI É A LÓGICA DA FOTO: Se ele tem a URL customizada salva, usa. Se não, gera a padrão.
        const avatarUrl = ninjaData.avatarUrl ? ninjaData.avatarUrl : `https://ui-avatars.com/api/?name=${filterId}&background=1f2937&color=f87171&size=200&font-size=0.33&bold=true`;

        guardianSummaryDiv.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
                <div class="flex flex-col md:flex-row items-center gap-6 border-b border-gray-700 pb-6 mb-6">
                    <img src="${avatarUrl}" alt="Foto de ${filterId}" class="profile-avatar">
                    <div class="text-center md:text-left flex-grow">
                        <h3 class="text-4xl font-black text-white uppercase tracking-wider">${filterId}</h3>
                        <div class="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-2">
                            <span class="px-3 py-1 rounded-full text-sm font-bold ${ninjaData.isActive ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}">${ninjaData.isActive ? '🟢 Serviço Ativo' : '🔴 Inativo'}</span>
                            <span class="px-3 py-1 bg-gray-700 rounded-full text-sm font-bold text-gray-300">Maestria: ${ninjaData.element || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="bg-gray-900 p-4 rounded-xl border border-gray-700 text-center min-w-[150px]">
                        <p class="text-xs text-gray-400 uppercase font-bold">Total de Recompensa</p>
                        <p class="text-4xl font-black text-green-400 drop-shadow-md mt-1">${Math.round(ninjaData.rankPoints)} <span class="text-sm text-gray-500 font-normal">Pts</span></p>
                    </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-gray-900 p-4 rounded-xl border border-gray-700 text-center">
                        <p class="text-xs text-gray-400 uppercase">Missões Concluídas</p>
                        <p class="text-2xl font-bold text-white mt-2">${ninjaData.missionsCompleted}</p>
                    </div>
                    <div class="bg-gray-900 p-4 rounded-xl border border-red-900/30 text-center">
                        <p class="text-xs text-red-400 uppercase font-bold">Abates (Killer)</p>
                        <p class="text-2xl font-bold text-red-300 mt-2">${killCount} <span class="text-sm text-gray-500">Alvos</span></p>
                    </div>
                    <div class="bg-gray-900 p-4 rounded-xl border border-orange-900/30 text-center">
                        <p class="text-xs text-orange-400 uppercase font-bold">Assistências</p>
                        <p class="text-2xl font-bold text-orange-300 mt-2">${assistCount} <span class="text-sm text-gray-500">Alvos</span></p>
                    </div>
                    <div class="bg-gray-900 p-4 rounded-xl border border-green-900/30 text-center">
                        <p class="text-xs text-green-400 uppercase font-bold">Suporte (Healer)</p>
                        <p class="text-2xl font-bold text-green-300 mt-2">${healCount} <span class="text-sm text-gray-500">Alvos</span></p>
                    </div>
                </div>
            </div>
        `;
        guardianSummaryDiv.classList.remove('hidden');
    }
    window.renderReportsLogFiltered(filterId, 'filtered-reports-log');
}

window.editNinjaAvatar = function(id) {
    if (!isMasterAdminMode) return;
    const ninja = ninjasData[id];
    window.openCustomModal('Alterar Foto de Perfil', `Membro: ${id}. Cole o link direto (URL) da imagem que deseja usar. Deixe em branco para voltar para a foto padrão.`, 'photoEdit', { url: ninja.avatarUrl || '' })
    .then(async (result) => {
        if (result !== false) {
            try {
                await updateDoc(doc(db, COLLECTIONS.NINJAS, id), { avatarUrl: result.url });
            } catch (e) { console.error(e); }
        }
    });
}

// Adicionando o botão de Foto na Tabela de Admin
window.renderNinjasTable = function() {
    const ninjasBody = document.getElementById('ninjas-cadastro');
    if (!ninjasBody) return; 
    
    const sortedNinjas = Object.values(ninjasData).sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    ninjasBody.innerHTML = '';

    sortedNinjas.forEach(data => {
        if (!data.id) return; 
        const statusClass = data.isActive ? 'text-green-400' : 'text-red-400';
        
        const actionCell = isMasterAdminMode ? `
            <td class="px-6 py-2 whitespace-nowrap text-right text-sm font-medium flex gap-2 justify-end">
                <button onclick="window.editNinjaAvatar('${data.id}')" class="text-purple-400 hover:text-purple-300 bg-gray-900 py-1 px-2 rounded">📷 Foto</button>
                <button onclick="window.editNinja('${data.id}')" class="text-blue-500 hover:text-blue-700 bg-gray-900 py-1 px-2 rounded">Status</button>
                <button onclick="window.editNinjaMastery('${data.id}')" class="text-yellow-500 hover:text-yellow-700 bg-gray-900 py-1 px-2 rounded">Maestria</button>
                <button onclick="window.deleteNinja('${data.id}')" class="text-red-500 hover:text-red-700 bg-gray-900 py-1 px-2 rounded">Excluir</button>
            </td>
        ` : '';

        ninjasBody.innerHTML += `
            <tr class="hover:bg-gray-700/50">
                <td class="px-6 py-3 whitespace-nowrap text-sm font-bold text-white">${data.id}</td>
                <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-300">${data.element || 'Não definido'}</td>
                <td class="px-6 py-3 whitespace-nowrap text-sm ${statusClass}">${data.isActive ? 'Ativo' : 'Inativo'}</td>
                ${actionCell}
            </tr>
        `;
    });
}

// ==========================================
// AUDITORIA (BOT) - (A mesma lógica que funcionou antes)
// ==========================================
window.renderAuditPanel = function() {
    let html = `<section class="space-y-4 pt-8"><h2 class="text-3xl font-bold text-yellow-400 text-center">Auditoria de Missões (Bot Discord)</h2><div class="bg-gray-800 p-4 rounded-xl shadow-xl overflow-x-auto"><table class="min-w-full divide-y divide-gray-700"><thead class="bg-gray-700"><tr><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Enviado por</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Alvo (Texto Bruto)</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data/Hora</th><th class="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Ações</th></tr></thead><tbody class="bg-gray-800 divide-y divide-gray-700">`;
    if (pendingData.length === 0) { html += `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400 italic">Nenhum relatório pendente de auditoria.</td></tr>`; } 
    else {
        pendingData.forEach(p => {
            const date = new Date(p.timestamp).toLocaleString('pt-BR');
            html += `<tr class="hover:bg-gray-700/50"><td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400">${p.authorTag}</td><td class="px-4 py-3 text-sm text-gray-300 font-mono bg-gray-900 rounded p-2 m-2 inline-block">${p.rawText}</td><td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">${date}</td><td class="px-4 py-3 whitespace-nowrap text-sm text-center"><button onclick="window.avaliarPending('${p.id}')" class="bg-green-600 text-white px-3 py-1 rounded font-bold mr-2">Revisar</button><button onclick="window.recusarPending('${p.id}')" class="bg-red-600 text-white px-3 py-1 rounded font-bold">Recusar</button></td></tr>`;
        });
    }
    html += `</tbody></table></div></section>`; return html;
}

window.avaliarPending = function(pendingId) {
    const data = pendingData.find(d => d.id === pendingId); if (!data) return;
    window.renderPage('report_form'); processingPendingId = pendingId;
    selectedKillers = []; selectedAssists = []; selectedHealers = [];
    document.getElementById('targets-container').innerHTML = ''; targetEntryCount = 0;

    let possivelKiller = Object.keys(ninjasData).find(nick => data.authorTag.toLowerCase().includes(nick.toLowerCase()));
    if (possivelKiller) selectedKillers.push(possivelKiller);

    window.addTargetEntry(); const entry = document.getElementById(`target-${targetEntryCount}`);
    const match = data.rawText.match(/bt\s+(\d+),\s*(.+)/i);
    if (match) { entry.querySelector('.target-bt').value = match[1]; entry.querySelector('.target-name').value = match[2]; } 
    else { entry.querySelector('.target-name').value = "Alvo: " + data.rawText; }

    window.updateExecutorTags(); window.updateExecutorSelect(); window.updateDescriptionPreview();
    document.getElementById('submit-report').innerHTML = 'Aprovar Auditoria e Oficializar no Rank';
}

window.recusarPending = async function(pendingId) {
    const confirmed = await window.openCustomModal('Recusar Relatório', 'Tem certeza que deseja apagar este relatório enviado pelo bot?', 'confirm');
    if (confirmed) { try { await deleteDoc(doc(db, COLLECTIONS.PENDING_REPORTS, pendingId)); } catch (e) {} }
}


// ==========================================
// RENDERIZAÇÃO GERAL E ROTEAMENTO
// ==========================================
window.renderPage = function(pageName) {
    currentPage = pageName;
    const contentDiv = document.getElementById('content');
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const activeLink = document.getElementById(`nav-${pageName}`);
    if (activeLink) activeLink.classList.add('active');

    contentDiv.innerHTML = '';

    switch (pageName) {
        case 'home': contentDiv.innerHTML = `<section class="text-center py-20 bg-gray-800 rounded-xl shadow-2xl"><h2 class="text-3xl font-bold text-red-400">QG Forças Especiais da Leaf</h2><p class="text-gray-300 mt-4">Painel Central das Forças Especiais para registro de BTs e divisão de pontuação.</p></section>`; break;
        case 'scoreboard': contentDiv.innerHTML = `<section class="space-y-4 pt-8"><h2 class="text-3xl font-bold text-red-400 text-center">Rank Geral</h2><div class="bg-gray-800 p-4 rounded-xl shadow-xl overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-700"><tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Rank</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Membro</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Pontos</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Missões</th></tr></thead><tbody id="ninjas-scoreboard" class="divide-y divide-gray-700"></tbody></table></div></section>`; window.renderScoreboard(); break;
        case 'reports_log': contentDiv.innerHTML = `<section class="space-y-4 pt-8"><h2 class="text-3xl font-bold text-red-400 text-center">Histórico Operacional</h2><div class="bg-gray-800 p-4 rounded-xl shadow-xl overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-700"><tr><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">ID</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Membros</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Alvos</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Descrição</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data</th></tr></thead><tbody id="reports-log" class="divide-y divide-gray-700"></tbody></table></div></section>`; window.renderReportsLogFiltered(null, 'reports-log'); break;
        case 'ninja_panel': 
            const allIdsSorted = Object.values(ninjasData).sort((a, b) => (a.id || '').localeCompare(b.id || ''));
            const ninjaOptions = allIdsSorted.filter(n => n.id).map(n => `<option value="${n.id}">${n.id}</option>`).join('');
            contentDiv.innerHTML = `<section class="space-y-6 pt-4"><h2 class="text-3xl font-bold text-red-400 text-center">Dossiê Militar</h2><div class="max-w-md mx-auto space-y-2"><select id="ninja-filter-select" onchange="window.renderNinjaPanelContent(this.value)" class="w-full p-2.5 rounded-lg bg-gray-700 border border-gray-600 text-white font-bold"><option value="">-- Escolha um Membro --</option>${ninjaOptions}</select></div><div id="guardian-summary" class="w-full max-w-5xl mx-auto hidden"></div><div id="filtered-reports-container" class="bg-gray-800 p-4 rounded-xl shadow-xl overflow-x-auto mt-4 hidden"><h3 class="text-xl text-gray-300 font-bold mb-4 border-b border-gray-700 pb-2">Últimas Missões</h3><table class="min-w-full"><thead class="bg-gray-700"><tr><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Membros da PT</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Alvos Eliminados</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Detalhes / BTs</th></tr></thead><tbody id="filtered-reports-log" class="divide-y divide-gray-700"></tbody></table></div></section>`;
            break;
        case 'audit_panel': contentDiv.innerHTML = window.renderAuditPanel(); break;
        case 'report_form':
            contentDiv.innerHTML = `
            <section class="bg-gray-800 p-6 rounded-xl shadow-2xl space-y-6">
                <h2 class="text-3xl font-semibold border-b pb-3 border-gray-700 text-red-400 text-center">Registro Oficial de Missão</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Killer</label><div class="flex gap-2"><select id="new-killer-id-select" class="flex-grow p-2.5 rounded-lg bg-gray-700 text-white"></select><button onclick="window.addExecutor('killer')" class="px-4 bg-red-600 text-white rounded-lg font-bold">Add</button></div><div id="killers-tag-container" class="executor-list-container"></div></div>
                    <div class="space-y-2"><label class="block text-sm font-medium text-gray-300">Assistência</label><div class="flex gap-2"><select id="new-assist-id-select" class="flex-grow p-2.5 rounded-lg bg-gray-700 text-white"></select><button onclick="window.addExecutor('assist')" class="px-4 bg-orange-600 text-white rounded-lg font-bold">Add</button></div><div id="assists-tag-container" class="executor-list-container"></div></div>
                    <div class="space-y-2 md:col-span-2"><label class="block text-sm font-medium text-gray-300">Healers</label><div class="flex gap-2"><select id="new-healer-id-select" class="flex-grow p-2.5 rounded-lg bg-gray-700 text-white"></select><button onclick="window.addExecutor('healer')" class="px-4 bg-green-600 text-white rounded-lg font-bold">Add</button></div><div id="healers-tag-container" class="executor-list-container"></div></div>
                </div>
                <div class="space-y-4 border-t border-gray-700 pt-4"><div class="flex justify-between items-center"><h3 class="text-xl font-bold text-red-400">Alvos Mortos</h3><button onclick="window.addTargetEntry()" class="py-1.5 px-3 bg-blue-600 text-white rounded-lg font-bold">➕ Add Alvo</button></div><div id="targets-container" class="space-y-4"></div></div>
                
                <div class="space-y-2 border-t border-gray-700 pt-4">
                    <label class="block text-sm font-medium text-gray-300">ID Único do Registro</label>
                    <input id="report-id-display" type="text" readonly class="w-full p-2.5 bg-gray-600/50 text-red-300 font-mono cursor-not-allowed">
                </div>

                <div class="space-y-2 border-t border-gray-700 pt-4"><input id="total-points" type="text" readonly class="w-full p-2.5 bg-gray-600/50 text-green-400 font-bold cursor-not-allowed" value="Preencha os alvos acima"></div>
                <div class="pt-4 border-t border-gray-700/50"><div id="description-preview" class="p-4 bg-gray-700 text-gray-300 italic min-h-[50px]"></div></div>
                <button id="submit-report" class="w-full py-3 mt-4 bg-red-600/50 text-white font-bold rounded-lg cursor-not-allowed" disabled onclick="window.submitReport()">Salvar Caçada</button>
            </section>`;
            if (!isWriterMode) { contentDiv.innerHTML = '<p class="text-center text-red-500 pt-8 font-bold text-2xl">Faça Login na aba Acesso Restrito para registrar BTs.</p>'; break; }
            if (!window.isEditingMode && !processingPendingId) { window.updateExecutorSelect(); window.updateExecutorTags(); window.generateReportId(); window.addTargetEntry(); window.updateDescriptionPreview(); }
            break;
        case 'admin_panel': 
            contentDiv.innerHTML = `<section class="bg-gray-900 p-6 rounded-xl border border-red-500/50 max-w-lg mx-auto mt-8"><h2 class="text-2xl font-bold text-red-400 text-center mb-4">Acesso Restrito</h2><input id="access-id-input" type="text" placeholder="Seu ID" class="w-full p-2 mb-2 bg-gray-700 text-white rounded"><input id="access-key-input" type="password" placeholder="Sua Senha" class="w-full p-2 mb-4 bg-gray-700 text-white rounded"><button class="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded" onclick="window.checkAccessKey()">Entrar</button></section>
            <section class="mt-8 admin-only hidden space-y-4">
                <h2 class="text-3xl font-bold text-yellow-400 text-center">Gerenciamento da Base</h2>
                <div class="bg-gray-800 p-4 rounded-xl shadow-xl overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-700"><tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Membro</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Maestria</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th><th class="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th></tr></thead><tbody id="ninjas-cadastro" class="divide-y divide-gray-700"></tbody></table></div>
            </section>`; 
            window.renderNinjasTable(); 
            break;
        default: contentDiv.innerHTML = `<section class="text-center py-20 bg-gray-800 rounded-xl shadow-2xl"><h2 class="text-3xl font-bold text-red-400">QG Forças Especiais da Leaf</h2></section>`;
    }
    
    // Atualiza a visibilidade das abas baseadas no login
    document.querySelectorAll('.writer-only').forEach(el => isWriterMode ? el.classList.remove('hidden') : el.classList.add('hidden'));
    document.querySelectorAll('.admin-only').forEach(el => isMasterAdminMode ? el.classList.remove('hidden') : el.classList.add('hidden'));
}

// ==========================================
// INICIALIZAÇÃO FIREBASE E LISTENERS
// ==========================================
async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig); db = getFirestore(app); auth = getAuth(app);
        await signInAnonymously(auth);
        document.getElementById('auth-info').textContent = `Conexão Segura Estabelecida`;
        
        onSnapshot(collection(db, COLLECTIONS.ACCESS_KEYS), (snap) => { accessKeysData = {}; snap.forEach(doc => accessKeysData[doc.id] = doc.data()); }, (e) => {});
        
        onSnapshot(collection(db, COLLECTIONS.NINJAS), (snap) => { 
            ninjasData = {}; snap.forEach(doc => ninjasData[doc.id] = doc.data()); 
            if (['scoreboard', 'ninja_panel', 'admin_panel'].includes(currentPage)) window.renderPage(currentPage); 
        }, (e) => {});
        
        onSnapshot(collection(db, COLLECTIONS.REPORTS), (snap) => { 
            reportsData = []; snap.forEach(doc => reportsData.push(doc.data())); 
            window.updateTargetSuggestions(); 
            if (['reports_log'].includes(currentPage)) window.renderPage(currentPage); 
        }, (e) => {});
        
        onSnapshot(collection(db, COLLECTIONS.PENDING_REPORTS), (snap) => { 
            pendingData = []; snap.forEach(doc => pendingData.push({ id: doc.id, ...doc.data() })); 
            const badge = document.getElementById('audit-badge');
            if (badge) {
                badge.textContent = pendingData.length;
                pendingData.length > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
            }
            if (currentPage === 'audit_panel') window.renderPage('audit_panel'); 
        }, (e) => {});

        window.renderPage(currentPage);

    } catch (error) { document.getElementById('status').textContent = `❌ Erro ao conectar: ${error.message}`; }
}

window.checkAccessKey = async function() {
    const id = document.getElementById('access-id-input')?.value.trim(), key = document.getElementById('access-key-input')?.value.trim();
    if (!id || !key) return; const accessData = accessKeysData[id];
    if (accessData && accessData.key === key) {
        currentAccessId = id; 
        if (accessData.level === 'master_admin') { isMasterAdminMode = true; isWriterMode = true; } else { isWriterMode = true; isMasterAdminMode = false; }
        window.renderPage('home');
    } else {
        alert("Senha incorreta");
    }
}

window.deleteReport = function(reportId) {
    if (!isWriterMode && !isMasterAdminMode) return;
    window.openCustomModal('Excluir Registro', `Tem certeza que deseja excluir o registro ${reportId}?`, 'confirm').then(async (confirmed) => {
        if (confirmed) {
            try {
                await deleteDoc(doc(db, COLLECTIONS.REPORTS, reportId));
                alert("Deletado com sucesso. Recalcule os Ranks se necessário.");
            } catch (e) { alert("Erro ao deletar: " + e.message); }
        }
    });
}

// Inicializa a aplicação
window.onload = function() { initializeFirebase(); }