// --- 初期データ ---
let settings = JSON.parse(localStorage.getItem('gachaSettings')) || [
    { name: "SSR：超レア", prob: 1, color: "#ffdf00", img: "./SSR.png" },
    { name: "SR：激レア", prob: 9, color: "#e879f9", img: "./SR.png" },
    { name: "R：通常", prob: 90, color: "#94a3b8", img: "./R.png" }
];
// 天井設定（初期値：無効, 100回）
let pitySettings = JSON.parse(localStorage.getItem('gachaPitySettings')) || { enabled: false, threshold: 100 };
// ユーザーごとのデータを格納するオブジェクト
let userData = JSON.parse(localStorage.getItem('gachaUserData')) || {}; 
let currentViewUser = ""; // 現在表示中のタブ

// 音声設定（初期値：デフォルトファイル）
let soundSettings = JSON.parse(localStorage.getItem('gachaSoundSettings')) || { 
    normal: 'fanfare.mp3', 
    ssr: 'ssr_fanfare.mp3',
    ssrEnabled: true // 大当たり音・演出の有効フラグ
};

// ミュート設定（初期値：オフ）
let isMuted = JSON.parse(localStorage.getItem('gachaMuted')) || false;

function init() {
    updateUserSelectionUI(); // datalistだけでなくボタンリストも更新
    renderTabs();
    // 最初のユーザーがいれば表示
    const users = Object.keys(userData);
    if (users.length > 0) switchTab(users[0]);
    
    applySoundSettings(); // 保存された音声設定を適用
    updateMuteIcon(); // ミュートアイコンの表示更新

    // 端末判定によるガイドテキスト設定
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const action = isMobile ? "タッチ" : "クリック";
    const guideText = `Gacha Lab Yへようこそ！右上の❓を${action}して使い方を確認！`;
    const guideEl = document.getElementById('helpGuide');
    if(guideEl) guideEl.innerText = guideText;
}

// --- ガチャ実行 ---
function draw(times) {
    // 仮の結果生成（この後SSR判定を行うため先に回すわけにはいかないが、ロジック上結果確定後に演出が必要）
    // なので処理順序としては「ロジック実行」→「SSR判定」→「音と演出」→「表示更新」となります。

    // 1. まず入力を取得
    const inputName = document.getElementById('userName').value.trim() || "名無しさん";
    
    // ユーザー初期化系は既存のまま
    if (!userData[inputName]) {
        userData[inputName] = { history: [], counts: {} };
    }
    if (typeof userData[inputName].pityCount === 'undefined') {
        userData[inputName].pityCount = 0;
    }

    const results = [];
    
    // --- 動的な大当たり(SSR)判定の準備 ---
    // 設定の中で最も確率が低い値を特定する
    const minProb = Math.min(...settings.map(s => s.prob));
    // 天井で排出するアイテム（最低確率のものの中から最初の1つを選択）
    const pityTarget = settings.find(s => s.prob === minProb);

    for(let i=0; i<times; i++) {
        let res;
        let isPity = false;

        // --- 天井判定ロジック ---
        // 有効かつ、現在のカウントが設定値以上なら大当たり対象（最低確率）を強制排出
        if (pitySettings.enabled && userData[inputName].pityCount >= pitySettings.threshold) {
            res = pityTarget;
            isPity = true;
            userData[inputName].pityCount = 0; // カウントリセット
        } else {
            res = performRoll();
            // 最低確率のアイテムが当たったらカウントリセット、それ以外は加算
            if (res.prob === minProb) {
                userData[inputName].pityCount = 0;
            } else {
                userData[inputName].pityCount++;
            }
        }
        
        // 結果を保存（isPityフラグを付与してUI表示に使用）
        // オブジェクトのコピーを作るため、ここでSSR判定(参照一致)を行ってフラグとして持たせる
        const isSSR = (res.prob === minProb); // 確率が最低値なら大当たり扱い
        results.push({ ...res, isPity: isPity, isSSR: isSSR });
        
        // ユーザーデータに保存
        userData[inputName].history.unshift({
            time: new Date().toLocaleString(),
            name: res.name
        });
        userData[inputName].counts[res.name] = (userData[inputName].counts[res.name] || 0) + 1;
    }

    // 2. SSRが含まれているか判定
    const hasSSR = results.some(r => r.isSSR);

    // 3. 音と演出のトリガー（設定でSSR音が有効な場合のみSSR音を鳴らす）
    const soundType = (hasSSR && soundSettings.ssrEnabled) ? 'ssrSound' : 'gachaSound';
    playGachaSound(soundType);

    if (hasSSR) {
        triggerSSREffects();
    }

    saveToStorage();
    updateUserSelectionUI();
    renderTabs();
    switchTab(inputName);
    updateDisplay(results);
}

// ミュート切り替え関数
window.toggleMute = function() {
    isMuted = !isMuted;
    localStorage.setItem('gachaMuted', JSON.stringify(isMuted));
    updateMuteIcon();
    
    // 音が鳴っていたら止める
    if(isMuted) playGachaSound(null);
};

// アイコン更新
function updateMuteIcon() {
    const btn = document.getElementById('muteBtn');
    if(btn) btn.innerText = isMuted ? "🔇" : "🔊";
}

// 音声再生管理関数（連打対応）
function playGachaSound(elementId) {
    // 既存の音をすべてリセット
    ['gachaSound', 'ssrSound'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.pause();
            el.currentTime = 0;
        }
    });
    
    // ミュート中、または停止指示(null)の場合はここで終了
    if (isMuted || !elementId) return;

    // 指定された音を再生
    const target = document.getElementById(elementId);
    if (target) {
        target.play().catch(e => console.log(`音声ファイル再生エラー: ${elementId}`, e));
    }
}

// SSR演出関数（フラッシュ、振動、紙吹雪）
function triggerSSREffects() {
    // A. スクリーンフラッシュ
    const flash = document.createElement('div');
    flash.className = 'flash-overlay';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);

    // B. 振動演出 (結果表示エリアを揺らす)
    const area = document.getElementById('displayArea');
    area.classList.remove('shake-effect');
    void area.offsetWidth; // リフローさせてアニメーションをリセット
    area.classList.add('shake-effect');

    // C. 紙吹雪
    createConfetti();
}

// 紙吹雪生成ロジック
function createConfetti() {
    const colors = ['#ffdf00', '#ffd700', '#ffffff', '#fcd34d'];
    for(let i=0; i<50; i++) {
        const div = document.createElement('div');
        div.className = 'confetti';
        div.style.left = Math.random() * 100 + "vw";
        div.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        // 落下速度と回転をランダムに
        div.style.animation = `fall ${2 + Math.random() * 3}s linear forwards`;
        document.body.appendChild(div);
        
        // アニメーション終了後に要素削除
        setTimeout(() => div.remove(), 5000);
    }
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
    const dashboard = document.getElementById('summaryDashboard');
    const body = document.getElementById('summaryBody');
    const foot = document.getElementById('summaryFoot');
    const data = userData[currentViewUser];
    
    document.getElementById('summaryTitle').innerText = `${currentViewUser} さんの集計表`;

    if (!data) { 
        if(dashboard) dashboard.innerHTML = "";
        if(body) body.innerHTML = ""; 
        if(foot) foot.innerHTML = ""; 
        return; 
    }

    // --- 1. サマリーダッシュボードの更新 ---
    const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
    const pityCount = data.pityCount || 0;
    const pityThreshold = pitySettings.threshold || 100;
    const remainingForPity = pitySettings.enabled ? Math.max(0, pityThreshold - pityCount) : '無効';

    if (dashboard) {
        let dashboardHTML = `
            <div class="summary-card">
                <div class="value">${total}</div>
                <div class="label">総ガチャ回数</div>
            </div>
            <div class="summary-card">
                <div class="value">${remainingForPity}</div>
                <div class="label">天井まであと</div>
            </div>
        `;
        // 各レアリティの排出率カードを追加
        settings.forEach(item => {
            const count = data.counts[item.name] || 0;
            const rate = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            dashboardHTML += `
                <div class="summary-card">
                    <div class="value" style="color: ${item.color};">${rate}%</div>
                    <div class="label">${item.name} 排出率</div>
                </div>
            `;
        });
        dashboard.innerHTML = dashboardHTML;
    }

    // --- 2. テーブル本体の更新（色分け適用） ---
    body.innerHTML = settings.map(item => `
        <tr><td style="color: ${item.color}; font-weight: bold;">${item.name}</td><td>${data.counts[item.name] || 0}</td><td>${total > 0 ? (((data.counts[item.name] || 0) / total) * 100).toFixed(1) : 0}%</td></tr>
    `).join('');

    // --- 3. テーブルフッターの更新 ---
    foot.innerHTML = `<tr style="font-weight:bold; background:#2d3748"><td>合計</td><td>${total}</td><td>100%</td></tr>`;
}

function updateHistoryUI() {
    const list = document.getElementById('historyList');
    const data = userData[currentViewUser];
    list.innerHTML = data ? data.history.map(h => `<div>[${h.time}] ${h.name}</div>`).join('') : "";
}

function updateDisplay(results) {
    const area = document.getElementById('displayArea');
    area.innerHTML = results.map(res => {
        // SSRかどうか判定してクラスを追加
        const isSSR = res.isSSR;
        return `
        <div class="result-card ${isSSR ? 'ssr-card' : ''}" style="border-color: ${res.color}; box-shadow: 0 0 10px ${res.color}">
            ${res.isPity ? `<span class="pity-badge">天井確定！</span>` : ''}
            ${res.img ? `<img src="${res.img}">` : `<div style="height:60px; background:#111"></div>`}
            <div style="font-size: 0.7rem; color: ${res.color}">${res.name}</div>
        </div>
    `}).join('');
}

// --- Excel一括出力 (SheetJS) ---
function exportExcel() {
    const wb = XLSX.utils.book_new(); // 新しいブック作成
    const users = Object.keys(userData);

    if (users.length === 0) {
        alert("データがありません"); return;
    }

    // 日時フォーマット用ヘルパー (YYYY/MM/DD HH:MM:SS)
    const formatTime = (str) => {
        const d = new Date(str);
        if (isNaN(d.getTime())) return str;
        const y = d.getFullYear();
        const m = ('0' + (d.getMonth() + 1)).slice(-2);
        const D = ('0' + d.getDate()).slice(-2);
        const H = ('0' + d.getHours()).slice(-2);
        const M = ('0' + d.getMinutes()).slice(-2);
        const S = ('0' + d.getSeconds()).slice(-2);
        return `${y}/${m}/${D} ${H}:${M}:${S}`;
    };
    
    // --- 1. 総合サマリーシート作成 ---
    const summaryHeader = ["ユーザー名", "総回数"];
    settings.forEach(s => summaryHeader.push(s.name));
    summaryHeader.push("SSR率"); // settings[0]の率

    const summaryData = [summaryHeader];

    users.forEach(u => {
        const d = userData[u];
        const c = d.counts;
        const t = Object.values(c).reduce((a, b) => a + b, 0);
        
        const row = [u, t];
        settings.forEach(s => row.push(c[s.name] || 0));
        
        // SSR (settings[0]) 率
        const ssrC = c[settings[0].name] || 0;
        const rate = t > 0 ? ((ssrC / t) * 100).toFixed(2) + "%" : "0.00%";
        row.push(rate);
        
        summaryData.push(row);
    });

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    
    // 列幅設定
    const summaryCols = [{wch:20}, {wch:10}];
    settings.forEach(() => summaryCols.push({wch:15}));
    summaryCols.push({wch:10});
    wsSummary['!cols'] = summaryCols;

    XLSX.utils.book_append_sheet(wb, wsSummary, "総合サマリー");

    // 全ユーザーをループしてシートを作成
    users.forEach(user => {
        const data = userData[user];
        const history = data.history;
        const counts = data.counts;
        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        // 1. 集計サマリー（表の冒頭に配置）
        const wsData = [
            ["【集計レポート】", "", ""],
            ["レアリティ/景品名", "当選数", "実効排出率"]
        ];

        // 設定順（SSR優先）で集計行を追加
        settings.forEach(item => {
            const count = counts[item.name] || 0;
            const rate = total > 0 ? ((count / total) * 100).toFixed(2) + "%" : "0.00%";
            wsData.push([item.name, count, rate]);
        });
        wsData.push(["総計", total, "100%"]);
        wsData.push([]); // 空行による区切り

        // 2. 履歴データ（オートフィルタ対象）
        const headerRowIdx = wsData.length; // ヘッダーの行番号(0始まり)
        wsData.push(["実行日時", "当選景品"]);
        
        history.forEach(h => {
            wsData.push([formatTime(h.time), h.name]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // 列幅の調整（見やすくするため）
        ws['!cols'] = [{wch:22}, {wch:35}, {wch:12}];

        // オートフィルタの設定（履歴データの範囲）
        if (history.length > 0) {
            const range = XLSX.utils.decode_range(ws['!ref']);
            // ヘッダー行から最終行までフィルタをかける
            const filterRange = XLSX.utils.encode_range({
                s: { r: headerRowIdx, c: 0 },
                e: { r: range.e.r, c: 1 }
            });
            ws['!autofilter'] = { ref: filterRange };
        }

        XLSX.utils.book_append_sheet(wb, ws, user); // ユーザー名でシート追加
    });

    XLSX.writeFile(wb, "Gacha_Lab_Y_Report.xlsx");
}

// --- 設定・保存系 ---
function saveToStorage() {
    try {
        localStorage.setItem('gachaSettings', JSON.stringify(settings));
        localStorage.setItem('gachaUserData', JSON.stringify(userData));
        localStorage.setItem('gachaPitySettings', JSON.stringify(pitySettings)); // 天井設定も保存
        localStorage.setItem('gachaSoundSettings', JSON.stringify(soundSettings)); // 音声設定保存
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
    let html = "";

    // --- 景品設定リスト ---
    html += settings.map((item, i) => `
        <div class="item-row">
            <!-- プレビュー画像またはダミー表示 -->
            ${item.img 
                ? `<img src="${item.img}" class="setting-preview" alt="preview">` 
                : `<div class="setting-preview">No Img</div>`
            }

            <input type="text" value="${item.name}" onchange="updateItem(${i}, 'name', this.value)">
            
            <!-- 確率入力欄: 最下段は自動計算のためreadonly -->
            <input type="number" id="prob-input-${i}" value="${item.prob}" 
                ${i === settings.length-1 ? 'readonly class="calc-target"' : ''} 
                oninput="updateItem(${i}, 'prob', this.value)"
                step="0.1"
            >
            
            <!-- 画像選択ボタン：画像ありなら色を変えて視覚的に強調 -->
            <label class="file-label" style="${item.img ? 'background:#3182ce; border-color:#3182ce; font-weight:bold; color:white;' : ''}">
                ${item.img ? '画像あり' : '画像選択'}
                <input type="file" accept="image/*" onchange="handleFile(${i}, this)">
            </label>

            <input type="color" value="${item.color}" onchange="updateItem(${i}, 'color', this.value)" style="height:32px; padding:0; width:100%;">
            ${i !== settings.length-1 ? `<button onclick="removeItem(${i})">×</button>` : '<span>固定</span>'}
        </div>
    `).join('');

    // --- 追加ボタンと合計確率 ---
    html += `
    <div style="display:flex; justify-content: space-between; align-items: center; margin: 10px 0;">
        <button class="btn-sub" onclick="addItem()">+ 追加</button>
        <div style="font-weight:bold;">合計確率: <span id="totalProb">0</span>%</div>
    </div>
    <hr style="border-color:#2d3748; margin: 20px 0;">
    `;

    // --- 天井設定セクション ---
    html += `
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
    <hr style="border-color:#2d3748; margin: 20px 0;">
    `;

    // --- 音声設定セクション ---
    html += `
    <div class="sound-settings-box">
        <h3 class="pity-title">演出サウンド</h3>
        
        <!-- 通常当たり -->
        <div class="sound-row">
            <div class="sound-left">
                <span class="sound-label">通常</span>
            </div>
            <div class="sound-right">
                <span class="sound-filename">${getSoundDisplayName(soundSettings.normal)}</span>
                <label class="btn-sub file-btn">変更<input type="file" accept="audio/*" onchange="handleAudio('normal', this)"></label>
                <button class="btn-sub file-btn" onclick="previewSound('normal')">▶</button>
            </div>
        </div>

        <!-- 大当たり -->
        <div class="sound-row">
            <div class="sound-left">
                <span class="sound-label">大当たり</span>
                <label class="toggle-switch"><input type="checkbox" onchange="updateSound('ssrEnabled', this.checked)" ${soundSettings.ssrEnabled ? 'checked' : ''}><span class="slider round"></span></label>
            </div>
            <div class="sound-right">
                <span class="sound-filename">${getSoundDisplayName(soundSettings.ssr)}</span>
                <label class="btn-sub file-btn">変更<input type="file" accept="audio/*" onchange="handleAudio('ssr', this)"></label>
                <button class="btn-sub file-btn" onclick="previewSound('ssr')">▶</button>
            </div>
        </div>
        <div style="font-size:0.7rem; color:#aaa; margin-top:5px;">※2MB以内のMP3/WAV推奨</div>
    </div>
    `;
    
    container.innerHTML = html;
    calculateProb();
}

// ファイル名の表示用ヘルパー
function getSoundDisplayName(val) {
    if (!val) return "未選択";
    if (val.startsWith('data:')) return "カスタム";
    return val.length > 10 ? val.substring(0, 8) + "..." : val;
}

// 天井設定の更新用関数
window.updatePity = function(key, val) {
    if (key === 'enabled') pitySettings.enabled = val;
    if (key === 'threshold') pitySettings.threshold = parseInt(val) || 100;
};

// 音声設定の更新用関数
window.updateSound = function(key, val) {
    soundSettings[key] = val;
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

// 音声ファイルの処理
window.handleAudio = function(type, input) {
    const file = input.files[0];
    if (file) {
        // サイズチェック (例: 3MB制限)
        if (file.size > 3 * 1024 * 1024) {
            alert("ファイルサイズが大きすぎます。3MB以下のファイルを使用してください。");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            soundSettings[type] = e.target.result;
            applySoundSettings(); // 即座に反映
            renderInputs(); // ファイル名表示（カスタム）を更新するために再描画
        };
        reader.readAsDataURL(file);
    }
};

// 音声の適用
window.applySoundSettings = function() {
    const n = document.getElementById('gachaSound');
    const s = document.getElementById('ssrSound');
    if(n) n.src = soundSettings.normal;
    if(s) s.src = soundSettings.ssr;
};

// プレビュー再生
window.previewSound = function(type) {
    if (isMuted) {
        alert("ミュート中です。音声を再生するには右上のボタンでミュートを解除してください。");
        return;
    }
    const src = soundSettings[type];
    const audio = new Audio(src);
    audio.play().catch(e => alert("再生できませんでした"));
};

function calculateProb() {
    let sum = 0;
    const inputs = document.querySelectorAll('.item-row input[type="number"]:not(.calc-target)');

    // 最下段以外（ユーザー入力部分）の合計を計算
    for(let i=0; i<settings.length-1; i++) sum += settings[i].prob;
    
    const lastIdx = settings.length - 1;
    let lastProb = 100 - sum;

    // --- バリデーションとUI更新 ---
    const saveBtn = document.getElementById('saveBtn');
    const totalEl = document.getElementById('totalProb');

    if (lastProb < 0) {
        // 合計が100%を超えた場合
        lastProb = 0; // 最下段は0にする
        totalEl.style.color = '#e53e3e'; // 赤文字
        saveBtn.disabled = true;
        saveBtn.innerText = "確率合計が100%を超えています";
        saveBtn.style.background = "#4a5568";
        // エラーのある入力欄の枠線を赤くする
        inputs.forEach(input => input.classList.add('prob-error'));
    } else {
        // 正常な場合
        totalEl.style.color = 'inherit';
        saveBtn.disabled = false;
        saveBtn.innerText = "保存";
        saveBtn.style.background = ""; // デフォルトに戻す（CSS依存）
        // エラークラスを削除
        inputs.forEach(input => input.classList.remove('prob-error'));
    }

    // データの更新（丸め処理）
    settings[lastIdx].prob = parseFloat(lastProb.toFixed(1));
    
    // DOMの更新（最下段の入力欄をリアルタイム書き換え）
    const lastInput = document.getElementById(`prob-input-${lastIdx}`);
    if(lastInput) lastInput.value = settings[lastIdx].prob;

    document.getElementById('totalProb').innerText = (sum + settings[lastIdx].prob).toFixed(1);
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