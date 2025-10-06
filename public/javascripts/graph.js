/**
 * 睡眠グラフを描画する関数
 */
function renderSleepCharts() {
  // HTML(EJS)側で 'serverData' というグローバル変数が定義されていることを前提とする
  if (typeof serverData === 'undefined' || !serverData.weeklyData) {
    console.log('グラフを描画するためのデータがありません。');
    return;
  }

  // 古いグラフが残っている場合に備えて破棄する
  if (window.weeklyChart instanceof Chart) {
    window.weeklyChart.destroy();
  }
  if (window.monthlyChart instanceof Chart) {
    window.monthlyChart.destroy();
  }
  
  const weeklyCtx  = document.getElementById('weekly-sleep-chart').getContext('2d');
  // const monthlyCtx = document.getElementById('monthly-sleep-chart').getContext('2d'); // 月間グラフは一旦コメントアウト

  // サーバーから渡された週のデータを使う
  const weeklyDataConfig = {
    labels: serverData.weeklyLabels, // サーバーから渡された日付ラベル
    datasets: [{
      label: '睡眠時間 (時間)',
      data: serverData.weeklyData,   // サーバーから渡された睡眠時間のデータ
      borderColor: '#007bff',
      backgroundColor: 'rgba(0, 123, 255, 0.1)',
      fill: true,
      tension: 0.1
    }]
  };

  // 月間データはまだ実装していないので、一旦ダミーデータを表示
  const monthlyDataConfig = {
    labels:['1週目','2週目','3週目','4週目'],
    datasets:[{ 
      label:'睡眠時間 (時間)',
      data: [7, 7.2, 6.8, 8], // ダミーデータ
      borderColor: '#28a745',
      backgroundColor: 'rgba(40, 167, 69, 0.1)',
      fill: true,
      tension: 0.1
    }]
  };
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false, // 高さを固定するために必要
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value, index, values) {
            return value + ' h'; // Y軸の目盛りに ' h' を付ける
          }
        }
      }
    }
  };

  // グラフを描画し、グローバル変数に保存
  window.weeklyChart = new Chart(weeklyCtx,  { type: 'line', data: weeklyDataConfig, options: chartOptions });
  // window.monthlyChart = new Chart(monthlyCtx, { type: 'line', data: monthlyDataConfig, options: chartOptions });
}


// DOMの読み込みが完了したらグラフを描画する
// 'DOMContentLoaded' イベントリスナーを追加して、HTML要素が確実に読み込まれた後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderSleepCharts);
} else {
  // すでに読み込みが終わっている場合
  renderSleepCharts();
}