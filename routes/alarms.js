const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../lib/database');
const mixer = require('../lib/mixer'); // mixer.jsは使います

// --- 既存のアラーム操作API (変更なし) ---
router.use((req, res, next) => {
  if (req.isAuthenticated()) { return next(); }
  res.status(401).json({ success: false, message: 'Authentication required' });
});

router.post('/add', async (req, res, next) => {
  try {
    const newAlarm = await db.addAlarm(req.user.id, req.body);
    res.json({ success: true, alarm: newAlarm });
  } catch (error) {
    console.error('Error adding alarm:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/delete/:id', async (req, res, next) => {
  try {
    await db.deleteAlarm(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alarm:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/toggle/:id', async (req, res, next) => {
  try {
    await db.toggleAlarm(req.user.id, req.params.id, req.body.isOn);
    res.json({ success: true });
  } catch (error) {
    console.error('Error toggling alarm:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- インテリジェント・アラームのチェックAPI (新ロジック) ---
router.get('/check', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const alarms = await db.getAlarms(userId);
    if (!req.user.fitbit_user_id) return res.json({ shouldFire: false });

    // ★★★ これが、外部ライブラリを使わない、新しいタイムゾーン解決策です ★★★
    // 1. サーバーの現在時刻(UTC)を取得
    const now = new Date();
    // 2. UTC時刻に9時間（日本の時差）を足して、日本の現在時刻を計算する
    now.setUTCHours(now.getUTCHours() + 9);
    // 3. 日本の「時」と「分」を、UTCメソッドから安全に取得する
    const currentHourInJapan = now.getUTCHours();
    const currentMinuteInJapan = now.getUTCMinutes();

    const alarmToFire = alarms.find(a => a.is_on && a.hour === currentHourInJapan && a.minute === currentMinuteInJapan);
    
    if (!alarmToFire) return res.json({ shouldFire: false });

    console.log(`★★★ アラーム時刻を検知しました: ${alarmToFire.hour}:${String(alarmToFire.minute).padStart(2,'0')} ★★★`);

    // --- デバッグモードのロジック (偶数/奇数分で判定) ---
    let sleepDepthIndex = 0.5;
    if (currentMinuteInJapan % 2 === 0) {
      sleepDepthIndex = 1.0;
      console.log(`[DEBUG MODE] 現在の分(${currentMinuteInJapan})が偶数なので、眠りを「深い」(1.0)と判定しました。`);
    } else {
      sleepDepthIndex = 0.0;
      console.log(`[DEBUG MODE] 現在の分(${currentMinuteInJapan})が奇数なので、眠りを「浅い」(0.0)と判定しました。`);
    }

    // --- ミキシング処理 (変更なし) ---
    const soundPaths = { nonrem: path.join(__dirname, '../public/sounds/', alarmToFire.sound_nonrem), rem: path.join(__dirname, '../public/sounds/', alarmToFire.sound_rem) };
    const outputFileName = `${userId}_${Date.now()}.mp3`;
    const outputPath = path.join(__dirname, '../public/mixed_sounds/', outputFileName);

    await mixer.mixAlarmSounds(soundPaths, sleepDepthIndex, outputPath);
    const soundUrl = `/mixed_sounds/${outputFileName}`;
    console.log(`[SUCCESS] アラーム発火準備完了: サウンドURL=${soundUrl}`);
    res.json({ shouldFire: true, sound: soundUrl });
  } catch (error) {
    console.error('[FATAL] アラームチェック中に致命的なエラー:', error);
    res.status(500).json({ shouldFire: false, message: 'Error checking alarms' });
  }
});

module.exports = router;