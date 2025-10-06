const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const fitbit = require('../lib/fitbit-api');
const db = require('../lib/database');

/**
 * ログイン必須にするミドルウェア
 * 未ログインの場合はログインページにリダイレクトする
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
  const userFitbitId = req.user.fitbit_user_id;

  // --- Fitbitトークンの有無をチェック ---
  if (!req.user.access_token) {
    return res.render('authorize', { title: 'Fitbit 連携', user: req.user });
  }

  try {
    // --- 睡眠データの取得と保存 ---
    const today = new Date().toISOString().split('T')[0];
    const sleepData = await fitbit.getSleepData(userId);
    if (sleepData) {
      db.saveSleepData(userId, sleepData);
    }

    // --- 安静時心拍数の更新 (なければ) ---
    if (!req.user.resting_heart_rate) {
      const profile = await fitbit.getUserProfile(userId);
      if (profile && profile.restingHeartRate) {
        db.upsertRestingHeartRate(userFitbitId, profile.restingHeartRate);
      }
    }
    
    // --- DBから表示用データを取得・整形 ---
    const recentData = await db.getRecentSleepData(userId, 7);
    const labels = recentData.map(d => new Date(d.date).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }));
    const weeklyData = recentData.map(d => parseFloat((d.total_minutes / 60).toFixed(2)));
    const latestData = recentData.length > 0 ? recentData[recentData.length - 1] : null;
    const todaySleep = latestData ? `${Math.floor(latestData.total_minutes / 60)}:${(latestData.total_minutes % 60).toString().padStart(2, '0')}` : "データなし";
    
    // --- おすすめ起床時間の初期メッセージ ---
    let recommendation = "就寝時刻を入力して、おすすめの起床時間を計算しましょう。";
    if (recentData.length > 0) {
      const totalMinutesSum = recentData.reduce((sum, d) => sum + d.total_minutes, 0);
      const averageMinutes = totalMinutesSum / recentData.length;
      recommendation = `あなたの平均睡眠時間は約${Math.floor(averageMinutes / 60)}時間${Math.round(averageMinutes % 60)}分です。`;
    }

    // --- アラーム音と設定済みアラームの取得 ---
    const soundsDirectory = path.join(__dirname, '../public/sounds/');
    const [files, alarms] = await Promise.all([ fs.readdir(soundsDirectory), db.getAlarms(userId) ]);
    const audioFiles = files.filter(file => ['.mp3', '.wav', '.ogg'].includes(path.extname(file).toLowerCase()));

    const pageData = {
      todaySleep: todaySleep,
      weeklyLabels: labels,
      weeklyData: weeklyData,
      recommendation: recommendation,
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
    const calculateAverageCycle = require('../lib/cycle-calculator'); // 仮。サイクル計算ロジックは別ファイル化推奨
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
  } catch (error) { next(error); }
});

module.exports = router;