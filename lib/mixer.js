const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

/**
 * 眠りの深さ指数に基づいて音声をミキシングし、オプションで動的なPANエフェクトを適用する
 * @param {object} soundPaths - { nonrem, rem }
 * @param {number} sleepDepthIndex - 0.0 ~ 1.0
 * @param {boolean} enablePan - PANエフェクトを有効にするか
 * @param {string} outputPath - 出力先パス
 * @returns {Promise<string>}
 */
function mixAlarmSounds(soundPaths, sleepDepthIndex, enablePan, outputPath) {
    return new Promise((resolve, reject) => {
        const vol = {
            nonrem: sleepDepthIndex.toFixed(2),
            rem: (1.0 - sleepDepthIndex).toFixed(2)
        };
        console.log(`ミキシング開始 - 眠りの深さ: ${sleepDepthIndex}, 音量: Non-REM=${vol.nonrem}, REM=${vol.rem}, PAN: ${enablePan}`);

        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // --- 音声処理の設計図 (Filter Graph) を構築 ---
        const filterGraph = [
            // 1. 各入力音声に、計算した音量フィルタを適用
            `[0:a]volume=${vol.nonrem}[a_nonrem]`,
            `[1:a]volume=${vol.rem}[a_rem]`,
            // 2. 2つの音声をミックスする
            `[a_nonrem][a_rem]amix=inputs=2:duration=longest[a_mixed]`
        ];

        // ★★★ ここからが、新しいPAN処理の追加部分 ★★★
        let finalOutput = 'a_mixed'; // PANを適用しない場合の最終出力名

        if (enablePan) {
            // もしPANが有効なら、ミックス後の音声にPANフィルタを適用する
            // この式は、30秒かけて音が左(-1)から右(+1)へ移動するようにゲインを計算します
            // cosとsinを使うことで、全体の音量が急に変化しない、自然なパンニングになります
            const panFilter = `[a_mixed]pan=stereo|c0=cos(t/30*PI/2)*c0|c1=sin(t/30*PI/2)*c1[a_panned]`;
            filterGraph.push(panFilter);
            finalOutput = 'a_panned'; // PAN適用後の、新しい最終出力名
        }
        
        ffmpeg()
            .input(soundPaths.nonrem)
            .input(soundPaths.rem)
            .complexFilter(filterGraph, finalOutput) // 設計図と、最終出力名を指定
            .on('end', () => {
                console.log('ミキシング成功:', outputPath);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('ミキシングエラー:', err.message);
                reject(err);
            })
            .save(outputPath);
    });
}

module.exports = {
    mixAlarmSounds
};