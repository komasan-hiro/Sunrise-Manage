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
            // ★★★ これが、最後の、真の、最もシンプルなテストです ★★★
            // すべての動的な計算を捨て、「音を完全に左に寄せる」という、最も原始的な指示だけを書く
            const forceStereoFilter = `[a_mixed]aformat=channel_layouts=stereo[a_stereo]`;
            const staticPanFilter = `[a_stereo]pan=stereo|c0=1.0*c0|c1=0.0*c1[a_panned]`;
            
            filterGraph.push(forceStereoFilter, staticPanFilter);
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