const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

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
        
        const filterGraph = [
            `[0:a]volume=${vol.nonrem}[a_nonrem]`,
            `[1:a]volume=${vol.rem}[a_rem]`,
            `[a_nonrem][a_rem]amix=inputs=2:duration=longest[a_mixed]`
        ];

        let finalOutput = 'a_mixed';

        if (enablePan) {
            // ★★★ これが、最後の、真の、そして最も確実な解決策です ★★★
            // 1. まず、モノラル音源でも安全なように、ステレオに変換する
            const forceStereoFilter = `[a_mixed]aformat=channel_layouts=stereo[a_stereo]`;
            
            // 2. 1秒ごとに音が「左→右→左→右...」とジャンプする、シンプルなPANアニメーションを定義
            // 'lt(mod(t,2),1)' は、「時間を2で割った余りが1より小さい（＝偶数秒のとき）」という意味
            // 偶数秒のときは右チャンネル(c1)をミュートし、奇数秒のときは左チャンネル(c0)をミュートする
            const panAnimationFilter = `[a_stereo]pan=stereo|c0='lt(mod(t,2),1)'*c0|c1='gt(mod(t,2),1)'*c1[a_panned]`;

            filterGraph.push(forceStereoFilter, panAnimationFilter);
            finalOutput = 'a_panned';
        }
        
        ffmpeg()
            .input(soundPaths.nonrem)
            .input(soundPaths.rem)
            .complexFilter(filterGraph, finalOutput)
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