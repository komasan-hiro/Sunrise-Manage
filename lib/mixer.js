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
            // ★★★ これが、最後の、真の解決策です ★★★
            // どんな古いffmpegでも理解できるように、PI（円周率）を、記号ではなく「数値」で直接書き込む
            const PI = 3.141592653589793;

            const forceStereoFilter = `[a_mixed]aformat=channel_layouts=stereo[a_stereo]`;
            const panFilter = `[a_stereo]pan=stereo|c0=cos(t/30*${PI}/2)*c0|c1=sin(t/30*${PI}/2)*c1[a_panned]`;
            
            filterGraph.push(forceStereoFilter, panFilter);
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