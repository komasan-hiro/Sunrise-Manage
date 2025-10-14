const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

function mixAlarmSounds(soundPaths, sleepDepthIndex, outputPath) {
    return new Promise((resolve, reject) => {
        const vol = {
            nonrem: sleepDepthIndex.toFixed(2),
            rem: (1.0 - sleepDepthIndex).toFixed(2)
        };
        console.log(`ミキシング開始 - 眠りの深さ: ${sleepDepthIndex}, 音量: Non-REM=${vol.nonrem}, REM=${vol.rem}`);
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        ffmpeg()
            .input(soundPaths.nonrem)
            .input(soundPaths.rem)
            .complexFilter([
                `[0:a]volume=${vol.nonrem}[a_nonrem]`,
                `[1:a]volume=${vol.rem}[a_rem]`,
                `[a_nonrem][a_rem]amix=inputs=2:duration=longest[a_out]`
            ], 'a_out')
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

module.exports = { mixAlarmSounds };