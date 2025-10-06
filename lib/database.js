const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const saltRounds = 10;

const dbPath = path.join(__dirname, '..', 'sleep.sqlite3');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err.message);
  } else {
    console.log('データベースに正常に接続しました。');
    db.serialize(() => {
      createUsersTable();
      createSleepDataTable();
      createAlarmsTable();
    });
  }
});

function createUsersTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      fitbit_user_id TEXT UNIQUE,
      access_token TEXT,
      refresh_token TEXT,
      resting_heart_rate INTEGER
    );
  `;
  db.run(sql, (err) => {
    if (err) console.error('usersテーブル作成エラー:', err.message);
    else console.log('users テーブルが正常に作成されたか、すでに存在します。');
  });
}

function createSleepDataTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS sleep_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      total_minutes INTEGER,
      deep_minutes INTEGER,
      light_minutes INTEGER,
      rem_minutes INTEGER,
      wake_minutes INTEGER,
      efficiency INTEGER,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE (user_id, date)
    );
  `;
  db.run(sql, (err) => {
    if (err) console.error('sleep_dataテーブル作成エラー:', err.message);
    else console.log('sleep_data テーブルが正常に作成されたか、すでに存在します。');
  });
}

function createAlarmsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS alarms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      is_on INTEGER NOT NULL DEFAULT 1,
      sound_nonrem TEXT,
      sound_rem TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `;
  db.run(sql, (err) => {
    if (err) console.error('alarmsテーブル作成エラー:', err.message);
    else console.log('alarms テーブルが正常に作成されたか、すでに存在します。');
  });
}

// --- ユーザー操作関数 ---
function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function findUserById(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

async function createUser(email, password) {
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  return new Promise((resolve, reject) => {
    db.run("INSERT INTO users (email, password) VALUES (?, ?)", [email, hashedPassword], function(err) {
      if (err) reject(err); else resolve({ id: this.lastID });
    });
  });
}

function saveFitbitTokens(userId, { access_token, refresh_token, user_id: fitbit_user_id }) {
  return new Promise((resolve, reject) => {
    const sql = `UPDATE users SET access_token = ?, refresh_token = ?, fitbit_user_id = ? WHERE id = ?`;
    db.run(sql, [access_token, refresh_token, fitbit_user_id, userId], function(err) {
      if (err) reject(err); else resolve({ changes: this.changes });
    });
  });
}

function upsertRestingHeartRate(fitbitUserId, rate) {
  const sql = `UPDATE users SET resting_heart_rate = ? WHERE fitbit_user_id = ?`;
  db.run(sql, [rate, fitbitUserId], (err) => {
    if (err) console.error('安静時心拍数の保存エラー:', err.message);
  });
}

function getRestingHeartRate(fitbitUserId) {
    return new Promise((resolve, reject) => {
      db.get("SELECT resting_heart_rate FROM users WHERE fitbit_user_id = ?", [fitbitUserId], (err, row) => {
        if (err) reject(err); else resolve(row ? row.resting_heart_rate : null);
      });
    });
}


// --- 睡眠データ操作関数 ---
function saveSleepData(userId, sleepLog) {
  const sql = `INSERT OR IGNORE INTO sleep_data (user_id, date, total_minutes, deep_minutes, light_minutes, rem_minutes, wake_minutes, efficiency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    userId, sleepLog.dateOfSleep, sleepLog.minutesAsleep,
    sleepLog.levels.summary.deep?.minutes || 0,
    sleepLog.levels.summary.light?.minutes || 0,
    sleepLog.levels.summary.rem?.minutes || 0,
    sleepLog.levels.summary.wake?.minutes || 0,
    sleepLog.efficiency
  ];
  db.run(sql, params, (err) => {
    if (err) console.error('睡眠データ保存エラー:', err.message);
  });
}

function getRecentSleepData(userId, days = 7) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM sleep_data WHERE user_id = ? ORDER BY date DESC LIMIT ?", [userId, days], (err, rows) => {
      if (err) reject(err); else resolve(rows.reverse());
    });
  });
}

// --- アラームデータ操作関数 ---
function getAlarms(userId) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM alarms WHERE user_id = ? ORDER BY hour, minute", [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function addAlarm(userId, { hour, minute, soundNonrem, soundRem }) {
  const sql = `INSERT INTO alarms (user_id, hour, minute, sound_nonrem, sound_rem) VALUES (?, ?, ?, ?, ?)`;
  return new Promise((resolve, reject) => {
    db.run(sql, [userId, hour, minute, soundNonrem, soundRem], function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, hour, minute, sound_nonrem: soundNonrem, sound_rem: soundRem, is_on: 1 });
    });
  });
}

function deleteAlarm(userId, alarmId) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM alarms WHERE id = ? AND user_id = ?", [alarmId, userId], function(err) {
      if (err) reject(err); else resolve({ changes: this.changes });
    });
  });
}

function toggleAlarm(userId, alarmId, isOn) {
  const sql = "UPDATE alarms SET is_on = ? WHERE id = ? AND user_id = ?";
  return new Promise((resolve, reject) => {
    db.run(sql, [isOn ? 1 : 0, alarmId, userId], function(err) {
      if (err) reject(err); else resolve({ changes: this.changes });
    });
  });
}


// --- module.exports ---
module.exports = {
  // User functions
  findUserByEmail,
  findUserById,
  createUser,
  saveFitbitTokens,
  upsertRestingHeartRate,
  getRestingHeartRate,
  // Sleep Data functions
  saveSleepData,
  getRecentSleepData,
  // Alarm functions
  getAlarms,
  addAlarm,
  deleteAlarm,
  toggleAlarm
};