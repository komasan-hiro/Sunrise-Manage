const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

// Renderが提供するデータベースURLを環境変数から読み込む。
// なければローカル開発用のDB設定を使う（別途ローカルにPostgreSQLのインストールが必要になります）
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  // 本番環境(Render)ではSSL接続が必須
  ssl: connectionString ? { rejectUnauthorized: false } : false
});

/**
 * データベースのテーブルが存在しない場合に作成するセットアップ関数
 */
async function setupDatabase() {
  const client = await pool.connect();
  try {
    // 3つのテーブルを作成するクエリ
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        fitbit_user_id TEXT UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        resting_heart_rate INTEGER
      );
      CREATE TABLE IF NOT EXISTS sleep_data (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        total_minutes INTEGER,
        deep_minutes INTEGER,
        light_minutes INTEGER,
        rem_minutes INTEGER,
        wake_minutes INTEGER,
        efficiency INTEGER,
        UNIQUE (user_id, date)
      );
      CREATE TABLE IF NOT EXISTS alarms (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        is_on BOOLEAN NOT NULL DEFAULT true,
        sound_nonrem TEXT,
        sound_rem TEXT
      );
    `);
    console.log('データベースのテーブルセットアップが完了しました。');
  } catch (err) {
    console.error('テーブル作成エラー:', err);
  } finally {
    client.release(); // プールに接続を返す
  }
}

// サーバー起動時に一度だけ実行
setupDatabase();

// --- ユーザー操作関数 ---
async function findUserByEmail(email) {
  const res = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return res.rows[0];
}
async function findUserById(id) {
  const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return res.rows[0];
}
async function createUser(email, password) {
  const bcrypt = require('bcrypt');
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  const res = await pool.query("INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id", [email, hashedPassword]);
  return res.rows[0];
}
async function saveFitbitTokens(userId, { access_token, refresh_token, user_id: fitbit_user_id }) {
  const sql = `UPDATE users SET access_token = $1, refresh_token = $2, fitbit_user_id = $3 WHERE id = $4`;
  await pool.query(sql, [access_token, refresh_token, fitbit_user_id, userId]);
}
async function upsertRestingHeartRate(fitbitUserId, rate) {
  const sql = `UPDATE users SET resting_heart_rate = $1 WHERE fitbit_user_id = $2`;
  await pool.query(sql, [rate, fitbitUserId]);
}
async function getRestingHeartRate(fitbitUserId) {
  const res = await pool.query("SELECT resting_heart_rate FROM users WHERE fitbit_user_id = $1", [fitbitUserId]);
  return res.rows[0] ? res.rows[0].resting_heart_rate : null;
}

// --- 睡眠データ操作関数 ---
async function saveSleepData(userId, sleepLog) {
  const sql = `
    INSERT INTO sleep_data (user_id, date, total_minutes, deep_minutes, light_minutes, rem_minutes, wake_minutes, efficiency)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id, date) DO NOTHING;
  `;
  const params = [
    userId, sleepLog.dateOfSleep, sleepLog.minutesAsleep,
    sleepLog.levels.summary.deep?.minutes || 0,
    sleepLog.levels.summary.light?.minutes || 0,
    sleepLog.levels.summary.rem?.minutes || 0,
    sleepLog.levels.summary.wake?.minutes || 0,
    sleepLog.efficiency
  ];
  await pool.query(sql, params);
}
async function getRecentSleepData(userId, days = 7) {
  const res = await pool.query("SELECT * FROM sleep_data WHERE user_id = $1 ORDER BY date DESC LIMIT $2", [userId, days]);
  return res.rows.reverse();
}

// --- アラームデータ操作関数 ---
async function getAlarms(userId) {
  const res = await pool.query("SELECT * FROM alarms WHERE user_id = $1 ORDER BY hour, minute", [userId]);
  return res.rows.map(row => ({...row, isOn: row.is_on}));
}
async function addAlarm(userId, { hour, minute, soundNonrem, soundRem }) {
  const sql = `INSERT INTO alarms (user_id, hour, minute, sound_nonrem, sound_rem) VALUES ($1, $2, $3, $4, $5) RETURNING *`;
  const res = await pool.query(sql, [userId, hour, minute, soundNonrem, soundRem]);
  const newAlarm = res.rows[0];
  return {...newAlarm, isOn: newAlarm.is_on};
}
async function deleteAlarm(userId, alarmId) {
  const res = await pool.query("DELETE FROM alarms WHERE id = $1 AND user_id = $2", [alarmId, userId]);
  return { changes: res.rowCount };
}
async function toggleAlarm(userId, alarmId, isOn) {
  const sql = "UPDATE alarms SET is_on = $1 WHERE id = $2 AND user_id = $3";
  const res = await pool.query(sql, [isOn, alarmId, userId]);
  return { changes: res.rowCount };
}

// --- module.exports ---
module.exports = {
  findUserByEmail, findUserById, createUser, saveFitbitTokens, upsertRestingHeartRate, getRestingHeartRate,
  saveSleepData, getRecentSleepData,
  getAlarms, addAlarm, deleteAlarm, toggleAlarm
};