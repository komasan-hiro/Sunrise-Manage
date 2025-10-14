const express = require('express');
const router = express.Router();
const db = require('../lib/database');
const fitbit = require('../lib/fitbit-api');
const mixer = require('../lib/mixer'); // ★ mixer.jsをインポート

// このルーターのすべてのAPIにログインチェックを適用するミドルウェア
router.use((req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ success: false, message: 'Authentication required' });
});

// POST /alarms/add
router.post('/add', async (req, res, next) => {
  try {
    const newAlarm = await db.addAlarm(req.user.id, req.body);
    res.json({ success: true, alarm: newAlarm });
  } catch (error) {
    console.error('Error adding alarm:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /alarms/delete/:id
router.post('/delete/:id', async (req, res, next) => {
  try {
    await db.deleteAlarm(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alarm:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /alarms/toggle/:id
router.post('/toggle/:id', async (req, res, next) => {
  try {
    await db.toggleAlarm(req.user.id, req.params.id, req.body.isOn);
    res.json({ success: true });
  } catch (error) {
    console.error('Error toggling alarm:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /alarms/check
router.get('/check', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const alarms = await db.getAlarms(userId);
    if (!req.user.fitbit_user_id) {
        return res.json({ shouldFire: false });
    }

    const now = new Date();
    const alarmToFire = alarms.find(a => a.is_on && a.hour === now.getHours() && a.minute === now.getMinutes());

    if (alarmToFire) {
      const restingRate = await db.getRestingHeartRate(req.user.fitbit_user_id);
      const recentHeartRates = await fitbit.getRecentHeartRate(userId);
      let soundToPlay = alarmToFire.sound_nonrem;
      
      if (restingRate && recentHeartRates && recentHeartRates.length > 0) {
        const latestHeartRate = recentHeartRates.slice(-1)[0].value;
        console.log(`安静時心拍数: ${restingRate}, 最新の心拍数: ${latestHeartRate}`);

        if (latestHeartRate > restingRate + 10) {
          soundToPlay = alarmToFire.sound_rem;
          console.log('眠りが浅いと判断。レム睡眠用のサウンドを選択。');
        } else {
          console.log('眠りが深いと判断。ノンレム睡眠用のサウンドを選択。');
        }
      }
      
      console.log(`アラーム発火準備: サウンド=${soundToPlay}`);
      res.json({ shouldFire: true, sound: soundToPlay });
    } else {
      res.json({ shouldFire: false });
    }
  } catch (error) {
    console.error('アラームチェックエラー:', error);
    res.status(500).json({ shouldFire: false, message: 'Error checking alarms' });
  }
});

module.exports = router;