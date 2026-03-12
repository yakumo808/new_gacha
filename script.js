// --- 初期データ ---
let settings = JSON.parse(localStorage.getItem('gachaSettings')) || [
    { name: "SSR：超レア", prob: 1, color: "#ffdf00", img: "" },
    { name: "SR：激レア", prob: 9, color: "#e879f9", img: "" },
    { name: "R：通常", prob: 90, color: "#94a3b8", img: "" }
];
// 天井設定（初期値：無効, 100回）
let pitySettings = JSON.parse(localStorage.getItem('gachaPitySettings')) || { enabled: false, threshold: 100 };
// ユーザーごとのデータを格納するオブジェクト
let userData = JSON.parse(localStorage.getItem('gachaUserData')) || {}; 
let currentViewUser = ""; // 現在表示中のタブ

function init() {
    updateUserSelectionUI(); // datalistだけでなくボタンリストも更新
    renderTabs();
    // 最初のユーザーがいれば表示
    const users = Object.keys(userData);
    if (users.length > 0) switchTab(users[0]);
}

// --- ガチャ実行 ---
function draw(times) {
    // 音を再生
    const audio = document.getElementById('gachaSound');
    if (audio) {
        audio.currentTime = 0; // 連打対応：再生位置を先頭に戻す
        audio.play().catch(e => console.log("音声ファイル(fanfare.mp3)が見つかりません"));
    }

    const inputName = document.getElementById('userName').value.trim() || "名無しさん";
    
    // ユーザー用データの初期化
    if (!userData[inputName]) {
        userData[inputName] = { history: [], counts: {} };
    }
    // 天井カウントの初期化（既存ユーザー対応）
    if (typeof userData[inputName].pityCount === 'undefined') {
        userData[inputName].pityCount = 0;
    }

    const results = [];
    for(let i=0; i<times; i++) {
        let res;
        let isPity = false;

        // --- 天井判定ロジック ---
        // 有効かつ、現在のカウントが設定値以上ならSSR（配列の0番目）を強制排出
        if (pitySettings.enabled && userData[inputName].pityCount >= pitySettings.threshold) {
            res = settings[0];
            isPity = true;
            userData[inputName].pityCount = 0; // カウントリセット
        } else {
            res = performRoll();
            // SSR（配列0番目）が当たったらカウントリセット、それ以外は加算
            if (res === settings[0]) {
                userData[inputName].pityCount = 0;
            } else {
                userData[inputName].pityCount++;
            }
        }
        
        // 結果を保存（isPityフラグを付与してUI表示に使用）
        results.push({ ...res, isPity: isPity });
        
        // ユーザーデータに保存
        userData[inputName].history.unshift({
            time: new Date().toLocaleString(),
            name: res.name
        });
        userData[inputName].counts[res.name] = (userData[inputName].counts[res.name] || 0) + 1;
    }

    saveToStorage();
    updateUserSelectionUI();
    renderTabs();
    switchTab(inputName);
    updateDisplay(results);
}

function performRoll() {
    let rand = Math.random() * 100;
    let current = 0;
    for(let item of settings) {
        current += item.prob;
        if(rand <= current) return item;
    }
    return settings[settings.length - 1];
}

// --- UI制御 ---
function switchTab(userName) {
    currentViewUser = userName;
    renderTabs();
    updateSummaryUI();
    updateHistoryUI();
}

function renderTabs() {
    const tabs = document.getElementById('tabs');
    tabs.innerHTML = "";
    const users = Object.keys(userData);
    
    if (users.length === 0) {
        tabs.innerHTML = "<div style='padding:10px; font-size:0.8rem; color:#aaa'>履歴なし</div>";
        return;
    }

    users.forEach(user => {
        const div = document.createElement('div');
        div.className = `tab ${user === currentViewUser ? 'active' : ''}`;
        div.innerText = user;
        // スマホでのタップ反応を良くするため onclick を明示的に設定
        div.addEventListener('click', () => switchTab(user));
        tabs.appendChild(div);
    });
    updateUserSelectionUI(); // タブ切り替え時に選択状態を反映
}

function updateSummaryUI() {
    const body = document.getElementById('summaryBody');
    const foot = document.getElementById('summaryFoot');
    const data = userData[currentViewUser];
    if (!data) { body.innerHTML = ""; if(foot) foot.innerHTML = ""; return; }

    const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
    document.getElementById('summaryTitle').innerText = `${currentViewUser} さんの集計表`;

    body.innerHTML = settings.map(item => {
        const count = data.counts[item.name] || 0;
        const per = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        return `<tr><td>${item.name}</td><td>${count}</td><td>${per}%</td></tr>`;
    }).join('');

    // 合計行を表示
    foot.innerHTML = `<tr style="font-weight:bold; background:#2d3748"><td>合計</td><td>${total}</td><td>100%</td></tr>`;
}

function updateHistoryUI() {
    const list = document.getElementById('historyList');
    const data = userData[currentViewUser];
    list.innerHTML = data ? data.history.map(h => `<div>[${h.time}] ${h.name}</div>`).join('') : "";
}

function updateDisplay(results) {
    const area = document.getElementById('displayArea');
    area.innerHTML = results.map(res => `
        <div class="result-card" style="border-color: ${res.color}; box-shadow: 0 0 10px ${res.color}">
            ${res.isPity ? `<span class="pity-badge">天井確定！</span>` : ''}
            ${res.img ? `<img src="${res.img}">` : `<div style="height:60px; background:#111"></div>`}
            <div style="font-size: 0.7rem; color: ${res.color}">${res.name}</div>
        </div>
    `).join('');
}

// --- Excel一括出力 (SheetJS) ---
function exportExcel() {
    const wb = XLSX.utils.book_new(); // 新しいブック作成
    
    // 全ユーザーをループしてシートを作成
    Object.keys(userData).forEach(user => {
        const data = userData[user];
        const history = data.history;
        const counts = data.counts;
        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        // 集計データの作成
        const summaryData = settings.map(item => {
            const count = counts[item.name] || 0;
            const per = total > 0 ? ((count / total) * 100).toFixed(1) + "%" : "0%";
            return [item.name, count, per];
        });
        summaryData.push(["合計", total, "100%"]);

        // 履歴と集計を横並びにするためのデータ構築
        // A,B列:履歴 | C列:空白 | D,E,F列:集計
        const wsData = [["【履歴】日時", "【履歴】景品名", "", "【集計】景品名", "個数", "実測率"]];
        const maxRows = Math.max(history.length, summaryData.length);

        for (let i = 0; i < maxRows; i++) {
            const h = history[i] || { time: "", name: "" };
            const s = summaryData[i] || ["", "", ""];
            wsData.push([h.time, h.name, "", s[0], s[1], s[2]]);
        }

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // 列幅の調整（見やすくするため）
        ws['!cols'] = [{wch:22}, {wch:15}, {wch:5}, {wch:15}, {wch:8}, {wch:8}];

        XLSX.utils.book_append_sheet(wb, ws, user); // ユーザー名でシート追加
    });

    if (Object.keys(userData).length === 0) {
        alert("データがありません"); return;
    }
    XLSX.writeFile(wb, "ガチャ履歴_集計付.xlsx");
}

// --- 設定・保存系 ---
function saveToStorage() {
    try {
        localStorage.setItem('gachaSettings', JSON.stringify(settings));
        localStorage.setItem('gachaUserData', JSON.stringify(userData));
        localStorage.setItem('gachaPitySettings', JSON.stringify(pitySettings)); // 天井設定も保存
    } catch (e) {
        // 容量オーバー時の自動クリーンアップ機能
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn("容量不足のため、古い履歴を削除して再保存を試みます。");
            cleanupOldData();
            try {
                localStorage.setItem('gachaUserData', JSON.stringify(userData));
                alert("保存容量がいっぱいになったため、古い履歴の一部を自動削除しました。");
            } catch (retryE) {
                alert("データの保存に失敗しました。画像サイズが大きすぎる可能性があります。");
            }
        } else {
            console.error("保存失敗:", e);
        }
    }
}

// 古い履歴を削除して容量を確保する関数
function cleanupOldData() {
    Object.keys(userData).forEach(user => {
        // 各ユーザーの履歴を最新50件に制限
        if (userData[user].history.length > 50) {
            userData[user].history = userData[user].history.slice(0, 50);
        }
    });
}

// スマホ向けのユーザー選択UI更新 (datalist + ボタンリスト)
function updateUserSelectionUI() {
    // 1. 従来のdatalist更新
    const dl = document.getElementById('userList');
    dl.innerHTML = Object.keys(userData).map(u => `<option value="${u}">`).join('');

    // 2. スマホ向けクイック選択ボタンの更新
    const quickArea = document.getElementById('quickUserSelect');
    if (!quickArea) return;
    
    quickArea.innerHTML = Object.keys(userData).map(u => `
        <div class="user-chip ${u === currentViewUser ? 'active' : ''}" 
             onclick="selectUserFromChip('${u}')">
            ${u}
        </div>
    `).join('');
}

// チップをクリックした時の動作
window.selectUserFromChip = function(name) {
    document.getElementById('userName').value = name;
    switchTab(name);
}

// 設定モーダル関連の関数
function openModal() { document.getElementById('modal').style.display = 'flex'; renderInputs(); }
function closeModal() { document.getElementById('modal').style.display = 'none'; }

// ヘルプモーダル関連の関数
function openHelp() { document.getElementById('helpModal').style.display = 'flex'; }
function closeHelp() { document.getElementById('helpModal').style.display = 'none'; }

// モーダルの外側をクリックしたら閉じる処理（共通）
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

function renderInputs() {
    const container = document.getElementById('itemInputs');
    
    // --- 天井設定セクションの注入 ---
    let html = `
    <div class="pity-settings-box">
        <h3 class="pity-title">天井設定</h3>
        <div class="pity-row">
            <label class="toggle-switch">
                <input type="checkbox" onchange="updatePity('enabled', this.checked)" ${pitySettings.enabled ? 'checked' : ''}>
                <span class="slider round"></span>
            </label>
            <span class="pity-label-text">天井機能を有効にする</span>
        </div>
        <div class="pity-row" style="margin-top:8px;">
            <span>SSR排出なし</span>
            <input type="number" class="pity-input" value="${pitySettings.threshold}" onchange="updatePity('threshold', this.value)">
            <span>回で次回SSR確定</span>
        </div>
    </div>
    <hr style="border-color:#2d3748; margin: 15px 0;">
    `;

    // --- 景品設定リスト ---
    html += settings.map((item, i) => `
        <div class="item-row">
            <!-- プレビュー画像またはダミー表示 -->
            ${item.img 
                ? `<img src="${item.img}" class="setting-preview" alt="preview">` 
                : `<div class="setting-preview">No Img</div>`
            }

            <input type="text" value="${item.name}" onchange="updateItem(${i}, 'name', this.value)">
            <input type="number" value="${item.prob}" ${i === settings.length-1 ? 'readonly style="background:#111"' : ''} oninput="updateItem(${i}, 'prob', this.value)">
            
            <!-- 画像選択ボタン：画像ありなら色を変えて視覚的に強調 -->
            <label class="file-label" style="${item.img ? 'background:#3182ce; border-color:#3182ce; font-weight:bold; color:white;' : ''}">
                ${item.img ? '画像あり' : '画像選択'}
                <input type="file" accept="image/*" onchange="handleFile(${i}, this)">
            </label>

            <input type="color" value="${item.color}" onchange="updateItem(${i}, 'color', this.value)" style="height:32px; padding:0; width:100%;">
            ${i !== settings.length-1 ? `<button onclick="removeItem(${i})">×</button>` : '<span>固定</span>'}
        </div>
    `).join('');
    
    container.innerHTML = html;
    calculateProb();
}

// 天井設定の更新用関数
window.updatePity = function(key, val) {
    if (key === 'enabled') pitySettings.enabled = val;
    if (key === 'threshold') pitySettings.threshold = parseInt(val) || 100;
};

function handleFile(i, input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxWidth = 400;
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // JPEG形式で圧縮率0.7として保存
                settings[i].img = canvas.toDataURL('image/jpeg', 0.7);
                
                // 処理完了後にUIを再描画してプレビューを即時更新
                renderInputs();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function calculateProb() {
    let sum = 0;
    for(let i=0; i<settings.length-1; i++) sum += settings[i].prob;
    const lastProb = Math.max(0, 100 - sum).toFixed(1);
    settings[settings.length-1].prob = parseFloat(lastProb);
    document.getElementById('totalProb').innerText = (sum + parseFloat(lastProb)).toFixed(1);
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = sum > 100;
}

function updateItem(i, k, v) { 
    if (k === 'prob') {
        const num = parseFloat(v);
        settings[i][k] = isNaN(num) ? 0 : num;
    } else {
        settings[i][k] = v;
    }
    calculateProb(); 
}
function addItem() { settings.splice(settings.length-1, 0, {name:"新景品", prob:0, color:"#38bdf8", img:""}); renderInputs(); }
function removeItem(i) { settings.splice(i, 1); renderInputs(); }
function saveSettings() { saveToStorage(); closeModal(); alert("設定を保存しました！"); }
// 1. 履歴と集計（ユーザーデータ）のみをリセットする
function resetHistory() {
    if(confirm("すべてのユーザーの【履歴と集計】をリセットしますか？（景品の設定は維持されます）")) {
        localStorage.removeItem('gachaUserData'); // 履歴データのみ削除
        userData = {};
        currentViewUser = "";
        
        // 画面を更新
        updateUserSelectionUI();
        renderTabs();
        document.getElementById('displayArea').innerHTML = "リセットされました";
        document.getElementById('summaryBody').innerHTML = "";
        document.getElementById('historyList').innerHTML = "";
        alert("履歴をリセットしました。");
        location.reload(); // 確実に反映させるためリロード
    }
}

// 2. 景品設定（名前・確率・画像）のみを初期化する
function resetSettings() {
    if(confirm("【景品の設定（確率や画像）】を初期状態に戻しますか？（これまでの履歴は維持されます）")) {
        localStorage.removeItem('gachaSettings'); // 設定データのみ削除
        alert("設定を初期化しました。ページを再読み込みします。");
        location.reload();
    }
}
// 画面の読み込みが完了してから初期化を実行する
document.addEventListener('DOMContentLoaded', init);