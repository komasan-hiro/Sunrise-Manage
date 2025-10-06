const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const fitbit = require('../lib/fitbit-api');
const db = require('../lib/database');

/**
 * 睡眠ステージのデータから平均睡眠サイクル長（分）を計算する関数
 * @param {Array} sleepLevels - Fitbit APIの levels.data 配列
 * @returns {number|null} 平均サイクル時間（分）、計算できない場合は null
 */
function calculateAverageCycle(sleepLevels) {
    if (!sleepLevels || sleepLevels.length < 2) return null;

    let deepSleepTimestamps = [];
    // 全データの中から、深い睡眠(deep)が始まった時刻だけを抽出する
    for (let i = 1; i < sleepLevels.length; i++) {
        // "light" または "rem" から "deep" に切り替わった瞬間を探す
        if (sleepLevels[i].level === 'deep' && sleepLevels[i-1].level !== 'deep') {
            deepSleepTimestamps.push(new Date(sleepLevels[i].dateTime));
        }
    }

    if (deepSleepTimestamps.length < 2) return null; // サイクルを計算するには最低2回の深い睡眠が必要

    let cycleDurations = [];
    // 深い睡眠が始まった時刻の差分から、各サイクルの長さを計算
    for (let i = 1; i < deepSleepTimestamps.length; i++) {
        const diffMs = deepSleepTimestamps[i] - deepSleepTimestamps[i-1];
        cycleDurations.push(diffMs / (1000 * 60)); // ミリ秒を分に変換
    }

    // 外れ値（短すぎる/長すぎるサイクル）を除外して、より正確な平均を計算
    const filteredDurations = cycleDurations.filter(d => d > 45 && d < 150);
    if (filteredDurations.length === 0) return null;

    const averageCycleMinutes = filteredDurations.reduce((a, b) => a + b, 0) / filteredDurations.length;
    return Math.round(averageCycleMinutes);
}


/**
 * ログイン必須にするミドルウェア
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/users/login');
}

/**
 * GET /
 * メインページを表示する (ログイン必須)
 */
router.get('/', ensureAuthenticated, async (req, res, next) => {
  const userId = req.user.id;

  if (!req.user.access_token) {
    return res.render('authorize', { title: 'Fitbit 連携', user: req.user });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const sleepData = await fitbit.getSleepData(userId);
    if (sleepData) {
      db.saveSleepData(userId, sleepData);
    }

    if (!req.user.resting_heart_rate) {
        const profile = await fitbit.getUserProfile(userId);
        if (profile && profile.restingHeartRate) {
            db.upsertRestingHeartRate(req.user.fitbit_user_id, profile.restingHeartRate);
        }
    }
    
    const recentData = await db.getRecentSleepData(userId, 7);
    const labels = recentData.map(d => new Date(d.date).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }));
    const weeklyData = recentData.map(d => parseFloat((d.total_minutes / 60).toFixed(2)));
    const latestData = recentData.length > 0 ? recentData[recentData.length - 1] : null;
    const todaySleep = latestData ? `${Math.floor(latestData.total_minutes / 60)}:${(latestData.total_minutes % 60).toString().padStart(2, '0')}` : "データなし";
    
    const userCycle = calculateAverageCycle(latestData?.levels?.data) || 90;
    const recommendation = `あなたの睡眠サイクルは約${userCycle}分と推定されます。就寝時刻を入力して、最適な起床時間を計算しましょう。`;
    
    const soundsDirectory = path.join(__dirname, '../public/sounds/');
    const [files, alarms] = await Promise.all([ fs.readdir(soundsDirectory), db.getAlarms(userId) ]);
    const audioFiles = files.filter(file => ['.mp3', '.wav', '.ogg'].includes(path.extname(file).toLowerCase()));

    const pageData = {
      todaySleep,
      weeklyLabels: labels,
      weeklyData,
      recommendation,
      alarms
    };

    res.render('index', { 
      title: 'Sunrise Manage',
      user: req.user,
      data: pageData,
      sounds: audioFiles,
      jsonData: JSON.stringify(pageData)
    });
  } catch (error) {
    if (error.code === 'ENOENT' && error.path.includes('sounds')) {
      console.warn('public/sounds フォルダが存在しません。作成します。');
      await fs.mkdir(path.join(__dirname, '../public/sounds/'), { recursive: true });
      return res.redirect('/');
    }
    console.error('データ処理中にエラー:', error);
    res.render('authorize', { title: 'エラー：再認証してください', user: req.user });
  }
});

/**
 * POST /calculate-wakeup (ログイン必須)
 */
router.post('/calculate-wakeup', ensureAuthenticated, async (req, res, next) => {
  const userId = req.user.id;
  try {
    const bedtimeInput = req.body.bedtime;
    const [hours, minutes] = bedtimeInput.split(':').map(Number);
    
    const bedtime = new Date();
    bedtime.setHours(hours, minutes, 0, 0);
    if (bedtime < new Date()) {
      bedtime.setDate(bedtime.getDate() + 1);
    }
    
    const formatTime = (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    const latestSleepLog = await fitbit.getSleepData(userId);
    const userCycle = calculateAverageCycle(latestSleepLog?.levels?.data) || 90;
    
    const recommendationResult = {
      message: `あなたの睡眠サイクル(約${userCycle}分)に基づくと、${bedtimeInput}に就寝した場合のおすすめ起床時刻は...`,
      times: [
        `${formatTime(new Date(bedtime.getTime() + (userCycle * 3 * 60 * 1000)))} (サイクル 3回)`,
        `${formatTime(new Date(bedtime.getTime() + (userCycle * 4 * 60 * 1000)))} (サイクル 4回)`,
        `${formatTime(new Date(bedtime.getTime() + (userCycle * 5 * 60 * 1000)))} (サイクル 5回)`
      ]
    };
    
    // --- 再描画用データの準備 ---
    const recentData = await db.getRecentSleepData(userId, 7);
    const labels = recentData.map(d => new Date(d.date).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }));
    const weeklyData = recentData.map(d => parseFloat((d.total_minutes / 60).toFixed(2)));
    const latestData = recentData.length > 0 ? recentData[recentData.length - 1] : null;
    const todaySleep = latestData ? `${Math.floor(latestData.total_minutes / 60)}:${(latestData.total_minutes % 60).toString().padStart(2, '0')}` : "データなし";
    
    const soundsDirectory = path.join(__dirname, '../public/sounds/');
    const [files, alarms] = await Promise.all([ fs.readdir(soundsDirectory), db.getAlarms(userId) ]);
    const audioFiles = files.filter(file => ['.mp3', '.wav', '.ogg'].includes(path.extname(file).toLowerCase()));

    const pageData = {
      todaySleep: todaySleep,
      weeklyLabels: labels,
      weeklyData: weeklyData,
      recommendation: recommendationResult,
      alarms: alarms
    };

    res.render('index', { 
      title: 'Sunrise Manage',
      user: req.user,
      data: pageData,
      sounds: audioFiles,
      jsonData: JSON.stringify(pageData)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;