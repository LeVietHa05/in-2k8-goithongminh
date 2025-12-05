// triggerHandler.js
const SleepAnalysisService = require('./sleepAnalysisService');

class SleepAnalysisTrigger {
    constructor(config) {
        this.service = new SleepAnalysisService(config);
        this.pollingInterval = config.pollingInterval || 30000; // 30 giây
        this.isPolling = false;
    }

    /**
     * Bắt đầu polling để phát hiện sleepStatistic mới
     */
    startPolling() {
        if (this.isPolling) return;

        this.isPolling = true;
        console.log(`[${new Date().toISOString()}] Bắt đầu polling sleepStatistic mới...`);

        this.pollInterval = setInterval(() => {
            this.checkForNewSleepStatistics();
        }, this.pollingInterval);
    }

    /**
     * Dừng polling
     */
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.isPolling = false;
            console.log(`[${new Date().toISOString()}] Đã dừng polling`);
        }
    }

    /**
     * Kiểm tra sleepStatistic mới
     */
    async checkForNewSleepStatistics() {
        try {
            // Lấy sleepStatistic chưa được xử lý
            const newStats = await this.getUnprocessedSleepStatistics();

            for (const stat of newStats) {
                console.log(`[${new Date().toISOString()}] Phát hiện sleepStatistic mới: ID=${stat.id}, Device=${stat.deviceID}`);

                // Xử lý bất đồng bộ
                this.service.processNewSleepStatistic(stat.id)
                    .then(result => {
                        if (result.success) {
                            console.log(`[${new Date().toISOString()}] Đã xử lý sleepStatistic ${stat.id}`);
                        } else {
                            console.error(`[${new Date().toISOString()}] Lỗi xử lý sleepStatistic ${stat.id}:`, result.error);
                        }
                    })
                    .catch(error => {
                        console.error(`[${new Date().toISOString()}] Lỗi xử lý sleepStatistic ${stat.id}:`, error);
                    });
            }

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Lỗi khi kiểm tra sleepStatistic mới:`, error);
        }
    }

    /**
     * Lấy sleepStatistic chưa được xử lý
     */
    async getUnprocessedSleepStatistics() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT s.* 
                FROM sleepStatistic s
                LEFT JOIN sleepAnalysisReports r ON s.id = r.sleepStatID
                WHERE r.id IS NULL
                    AND s.endTime < ?  -- Chỉ xử lý khi đã kết thúc giấc ngủ
                    AND s.startTime > ? -- Trong vòng 24h qua
                ORDER BY s.timestamp DESC
                LIMIT 10
            `;

            const now = Date.now();
            const params = [
                now - (5 * 60 * 1000), // Kết thúc ít nhất 5 phút trước
                now - (24 * 60 * 60 * 1000) // Trong 24h qua
            ];

            this.service.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Xử lý thủ công một sleepStatistic
     */
    async triggerManualAnalysis(sleepStatID) {
        return await this.service.processNewSleepStatistic(sleepStatID);
    }

    /**
     * Cleanup
     */
    shutdown() {
        this.stopPolling();
        this.service.close();
    }
}

module.exports = SleepAnalysisTrigger;