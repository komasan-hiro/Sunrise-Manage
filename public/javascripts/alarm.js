// --- グローバル変数と要素の取得 ---
const todaySleep        = document.querySelector('.sleep-time');
const moreInfoButton    = document.getElementById('more-info');
const alarmList         = document.getElementById('alarm-list');
const setAlarmButton    = document.getElementById('set-alarm');
const alarmModal        = document.getElementById('alarm-modal');
const sleepHistoryModal = document.getElementById('sleep-history-modal');
const closeModalButtons = document.querySelectorAll('.close');
const saveAlarmButton   = document.getElementById('save-alarm');
const hourInput         = document.getElementById('hour');
const minuteInput       = document.getElementById('minute');
const ringingModal      = document.getElementById('ringing-modal'); // ★追加
const stopAlarmButton   = document.getElementById('stop-alarm-button'); // ★追加

let nonremCheckboxes, remCheckboxes;
let alarms = (typeof serverData !== 'undefined' && serverData.alarms) ? serverData.alarms : [];

/** モーダルを開く関数 */
function openModal(modal) { if (modal) modal.style.display = 'block'; }
/** モーダルを閉じる関数 */
function closeModal(modal) { if (modal) modal.style.display = 'none'; }
/** アラーム設定モーダルを開く関数 */
function openAlarmModal() {
    if (nonremCheckboxes) nonremCheckboxes.forEach(cb => cb.checked = false);
    if (remCheckboxes) remCheckboxes.forEach(cb => cb.checked = false);
    const now = new Date();
    hourInput.value   = String(now.getHours()).padStart(2, '0');
    minuteInput.value = String(now.getMinutes()).padStart(2, '0');
    openModal(alarmModal);
}

/** アラームをサーバーに保存する非同期関数 */
async function saveAlarm() {
    if (alarms.length >= 6) { alert("アラームは最大6件まで設定できます。"); return; }
    const hour   = parseInt(hourInput.value, 10);
    const minute = parseInt(minuteInput.value, 10);
    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) { alert("有効な時間を入力してください。"); return; }
    const selectedNonrem = Array.from(nonremCheckboxes).find(cb => cb.checked)?.value || null;
    const selectedRem    = Array.from(remCheckboxes).find(cb => cb.checked)?.value || null;
    if (!selectedNonrem || !selectedRem) { alert("ノンレムとレム、それぞれ1つずつサウンドを選択してください。"); return; }
    const newAlarmData = { hour, minute, soundNonrem: selectedNonrem, soundRem: selectedRem };
    try {
        const response = await fetch('/alarms/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAlarmData)
        });
        const result = await response.json();
        if (result.success) {
            alarms.push(result.alarm);
            renderAlarms();
            closeModal(alarmModal);
        } else {
            alert('アラームの保存に失敗しました: ' + (result.message || '不明なエラー'));
        }
    } catch (error) {
        console.error('Error saving alarm:', error);
        alert('サーバーとの通信中にエラーが発生しました。');
    }
}

/** アラーム一覧を描画する関数 */
function renderAlarms() {
    alarmList.innerHTML = '';
    if (alarms.length === 0) {
        alarmList.innerHTML = '<p>設定されているアラームはありません。</p>';
        return;
    }
    alarms.forEach(alarm => {
        const div = document.createElement('div');
        div.classList.add('alarm-item');
        const nonremLabel = alarm.sound_nonrem || '未設定';
        const remLabel    = alarm.sound_rem    || '未設定';
        div.innerHTML = `
            <div>
              <span class="alarm-time">${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}</span>
              <small>${nonremLabel}(ノンレム) + ${remLabel}(レム)</small>
            </div>
            <div>
              <button class="alarm-toggle" data-id="${alarm.id}">${alarm.isOn ? 'オン' : 'オフ'}</button>
              <button class="delete-alarm" data-id="${alarm.id}">削除</button>
            </div>
        `;
        alarmList.appendChild(div);
    });
}

/** イベントリスナーをまとめて設定する関数 */
function setupEventListeners() {
    alarmList.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (id === undefined) return;
        const alarm = alarms.find(a => a.id == id);
        if (!alarm) return;

        if (e.target.classList.contains('alarm-toggle')) {
            const newIsOn = !alarm.isOn;
            try {
                const response = await fetch(`/alarms/toggle/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isOn: newIsOn }) });
                if (response.ok) { alarm.isOn = newIsOn; renderAlarms(); }
            } catch (error) { console.error('Error toggling alarm:', error); }
        }
        if (e.target.classList.contains('delete-alarm')) {
            if (!confirm('このアラームを削除しますか？')) return;
            try {
                const response = await fetch(`/alarms/delete/${id}`, { method: 'POST' });
                if (response.ok) { alarms = alarms.filter(a => a.id != id); renderAlarms(); }
            } catch (error) { console.error('Error deleting alarm:', error); }
        }
    });
    
    nonremCheckboxes = document.querySelectorAll('input[name="sound-nonrem"]');
    remCheckboxes    = document.querySelectorAll('input[name="sound-rem"]');
    nonremCheckboxes.forEach(cb => { cb.addEventListener('change', () => { if (cb.checked) nonremCheckboxes.forEach(o => { if (o !== cb) o.checked = false; }); }); });
    remCheckboxes.forEach(cb => { cb.addEventListener('change', () => { if (cb.checked) remCheckboxes.forEach(o => { if (o !== cb) o.checked = false; }); }); });
    if (moreInfoButton) moreInfoButton.addEventListener('click', () => openModal(sleepHistoryModal));
    if (setAlarmButton) setAlarmButton.addEventListener('click', openAlarmModal);
    if (saveAlarmButton) saveAlarmButton.addEventListener('click', saveAlarm);
    closeModalButtons.forEach(btn => { btn.addEventListener('click', () => closeModal(btn.closest('.modal'))); });
    if (stopAlarmButton) {
      stopAlarmButton.addEventListener('click', stopAlarm);
    }
}


function stopAlarm() {
  if (window.currentAlarm) {
    window.currentAlarm.pause();
    window.currentAlarm.currentTime = 0; // 再生位置を最初に戻す
    console.log('アラームを停止しました。');
  }
  closeModal(ringingModal);
}

/**
 * ★★★ 新規追加 ★★★
 * アラームチェックを定期的に実行する
 */
function startAlarmChecker() {
  console.log('アラームチェッカーを開始します。');
  
  // 最初に一度だけ、現在の時刻の秒が0になるまで待つ
  const now = new Date();
  const delay = (60 - now.getSeconds()) * 1000;
  
  setTimeout(() => {
    // 0秒になった瞬間に最初のチェックを実行
    checkAndFireAlarm(); 
    // その後は正確に60秒ごとにチェックを繰り返す
    setInterval(checkAndFireAlarm, 60 * 1000);
  }, delay);
}

/**
 * ★★★ 新規追加 ★★★
 * サーバーに問い合わせて、必要ならアラームを鳴らす
 */
async function checkAndFireAlarm() {
  try {
    const response = await fetch('/alarms/check', { cache: 'no-cache' });
    const data = await response.json();
    if (data.shouldFire && data.sound) {
      console.log(`アラームを発火！ サウンド: ${data.sound}`);
      playAlarmSound(data.sound);
    } else {
      console.log('現在発火するアラームはありません。', new Date());
    }
  } catch (error) {
    console.error('アラームチェック中にエラー:', error);
  }
}

/**
 * ★★★ 新規追加 ★★★
 * 指定された音声ファイルを再生する
 * @param {string} soundFile - 再生するファイル名
 */
function playAlarmSound(soundFile) {
    if (window.currentAlarm && !window.currentAlarm.paused) {
        window.currentAlarm.pause();
    }
    const audio = new Audio(`/sounds/${soundFile}`);
    audio.loop = true;
    audio.play().catch(error => console.error('音声の再生に失敗しました:', error));
    window.currentAlarm = audio;
    openModal(ringingModal);
}

/** 初期化関数 */
function init() {
    if (typeof serverData !== 'undefined' && serverData.todaySleep) {
      todaySleep.textContent = serverData.todaySleep;
    } else {
      todaySleep.textContent = "データなし";
    }
    renderAlarms();
    setupEventListeners();
    startAlarmChecker(); // ★アラームチェッカーを起動
}

// DOMの読み込みが完了したら初期化処理を実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}