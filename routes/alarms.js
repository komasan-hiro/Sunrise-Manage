const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../lib/database');
const mixer = require('../lib/mixer'); // mixer.jsは残す
const { utcToZonedTime } = require('date-fns-tz');

// このルーターのすべてのAPIにログインチェックを適用するミドルウェア
router.use((req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ success: false, message: 'Authentication required' });
});

// --- 既存のアラーム操作API ---
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


router.get('/check', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const alarms = await db.getAlarms(userId);
    if (!req.user.fitbit_user_id) return res.json({ shouldFire: false });

    const timeZone = 'Asia/Tokyo';
    const now = utcToZonedTime(new Date(), timeZone);

    const alarmToFire = alarms.find(a => a.is_on && a.hour === now.getHours() && a.minute === now.getMinutes());
    
    if (!alarmToFire) return res.json({ shouldFire: false });

    console.log(`★★★ アラーム時刻を検知しました: ${alarmToFire.hour}:${String(alarmToFire.minute).padStart(2,'0')} ★★★`);

    let sleepDepthIndex = 0.5;
    const currentMinute = now.getMinutes();
    if (currentMinute % 2 === 0) {
      sleepDepthIndex = 1.0;
      console.log(`[DEBUG MODE] 現在の分(${currentMinute})が偶数なので、眠りを「深い」(1.0)と判定しました。`);
    } else {
      sleepDepthIndex = 0.0;
      console.log(`[DEBUG MODE] 現在の分(${currentMinute})が奇数なので、眠りを「浅い」(0.0)と判定しました。`);
    }

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