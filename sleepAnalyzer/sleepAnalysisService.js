/**
Khi có sleepStatistic mới → Tự động trigger phân tích
Lấy sleepData trong khoảng thời gian từ startTime đến endTime của sleepStatistic
Tính toán các metrics nâng cao từ sleepData
Kết hợp với sleepStatistic để tạo báo cáo hoàn chỉnh
Gọi OpenAI để phân tích và đưa ra insights 
*/// sleepAnalysisService.js
const sqlite3 = require('sqlite3').verbose();
const { OpenAI } = require('openai');
const path = require('path');
const db = require('../db')

class SleepAnalysisService {
    constructor(config) {
        this.db = db
        this.openai = new OpenAI({
            apiKey: config.openaiApiKey
        });
        this.setupDatabase();
    }

    setupDatabase() {
        // Bảng lưu báo cáo phân tích
        const createReportsTable = `
            CREATE TABLE IF NOT EXISTS sleepAnalysisReports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deviceID INTEGER NOT NULL,
                sleepStatID INTEGER NOT NULL,
                reportDate DATE NOT NULL,
                
                -- Metrics từ sleepStatistic (từ IoT)
                totalSleepHours REAL,
                isCompleteSleep BOOLEAN,
                timeLeft INTEGER,
                timeRight INTEGER,
                timeCenter INTEGER,
                positionChanges INTEGER,
                
                -- Metrics tính từ sleepData
                avgHeartRate REAL,
                minHeartRate REAL,
                maxHeartRate REAL,
                avgSpO2 REAL,
                minSpO2 REAL,
                avgBodyTemp REAL,
                
                -- Metrics môi trường
                avgEnvTemp REAL,
                avgHumidity REAL,
                avgCO2 REAL,
                avgPM25 REAL,
                avgLight REAL,
                avgNoise REAL,
                
                -- Phân bố giai đoạn ngủ
                lightSleepPercent REAL,
                deepSleepPercent REAL,
                wakingSleepPercent REAL,
                
                -- Điểm đánh giá
                sleepEfficiency REAL,
                environmentScore REAL,
                physiologyScore REAL,
                overallScore REAL,
                qualityLevel TEXT,
                
                -- Phân tích AI
                aiAnalysis TEXT,
                recommendations TEXT,
                
                -- Metadata
                createdAt INTEGER DEFAULT (strftime('%s', 'now')),
                updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
                
                UNIQUE(deviceID, sleepStatID),
                FOREIGN KEY (sleepStatID) REFERENCES sleepStatistic(id)
            )
        `;

        // Bảng trigger history
        const createTriggersTable = `
            CREATE TABLE IF NOT EXISTS analysisTriggers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sleepStatID INTEGER NOT NULL,
                triggerType TEXT NOT NULL, -- 'auto', 'manual', 'scheduled'
                status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
                errorMessage TEXT,
                startedAt INTEGER,
                completedAt INTEGER,
                createdAt INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `;

        this.db.serialize(() => {
            this.db.run(createReportsTable);
            this.db.run(createTriggersTable);
        });
    }

    /**
     *  hàm xử lý Chính khi có sleepStatistic mới
     */
    async processNewSleepStatistic(sleepStatID) {
        try {
            console.log(`[${new Date().toISOString()}] Bắt đầu xử lý sleepStatistic ID: ${sleepStatID}`);

            // 1. Lấy thông tin sleepStatistic từ IoT
            const sleepStat = await this.getSleepStatistic(sleepStatID);
            if (!sleepStat) {
                throw new Error(`Không tìm thấy sleepStatistic với ID: ${sleepStatID}`);
            }

            // 2. Tạo trigger record
            await this.createTriggerRecord(sleepStatID, 'auto', 'processing');

            // 3. Lấy sleepData trong khoảng thời gian ngủ
            const sleepData = await this.getSleepDataForPeriod(
                sleepStat.deviceID,
                sleepStat.startTime ,
                sleepStat.endTime 
            );

            // 4. Tính toán các metrics từ sleepData
            const calculatedMetrics = await this.calculateSleepMetrics(sleepData);

            // 5. Tính toán các chỉ số chất lượng
            const qualityMetrics = this.calculateQualityMetrics(
                sleepStat,
                calculatedMetrics
            );

            // 6. Tạo prompt và gọi OpenAI
            const aiAnalysis = await this.generateAIAnalysis(
                sleepStat,
                calculatedMetrics,
                qualityMetrics
            );

            // 7. Lưu báo cáo vào database
            const reportID = await this.saveAnalysisReport({
                deviceID: sleepStat.deviceID,
                sleepStatID: sleepStat.id,
                sleepStat,
                calculatedMetrics,
                qualityMetrics,
                aiAnalysis
            });

            // 8. Cập nhật trigger status
            await this.updateTriggerStatus(sleepStatID, 'completed');

            console.log(`[${new Date().toISOString()}] Xử lý hoàn thành. Report ID: ${reportID}`);

            return {
                success: true,
                reportID,
                sleepStatID,
                deviceID: sleepStat.deviceID
            };

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Lỗi xử lý sleepStatistic ${sleepStatID}:`, error);

            await this.updateTriggerStatus(sleepStatID, 'failed', error.message);

            return {
                success: false,
                sleepStatID,
                error: error.message
            };
        }
    }

    /**
     * Lấy thông tin sleepStatistic từ database
     */
    async getSleepStatistic(sleepStatID) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    id, deviceID, type, startTime, endTime, 
                    totalTime, totalSleepHours, isCompleteSleep,
                    timeLeft, timeRight, timeCenter, positionChanges,
                    timestamp
                FROM sleepStatistic 
                WHERE id = ?
            `;

            this.db.get(query, [sleepStatID], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Lấy sleepData trong khoảng thời gian
     */
    async getSleepDataForPeriod(deviceID, startTime, endTime) {
        console.log(deviceID, startTime, endTime)
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    stage, temperature, humidity, co2, pm25, 
                    light, noise, position, heartRate, 
                    bodyTemperature, spo2, timestamp
                FROM sleepData 
                WHERE deviceID = ? 
                    AND timestamp BETWEEN ? AND ?
                ORDER BY timestamp ASC
            `;

            this.db.all(query, [deviceID, startTime, endTime], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Tính toán các metrics từ sleepData
     */
    async calculateSleepMetrics(sleepData) {
        if (!sleepData || sleepData.length === 0) {
            throw new Error('Không có sleepData để phân tích');
        }

        // Tính toán các chỉ số trung bình
        const totals = sleepData.reduce((acc, data) => {
            // Chỉ số sinh lý
            if (data.heartRate) {
                acc.heartRates.push(data.heartRate);
                acc.minHeartRate = Math.min(acc.minHeartRate, data.heartRate);
                acc.maxHeartRate = Math.max(acc.maxHeartRate, data.heartRate);
            }
            if (data.spo2) {
                acc.spo2Values.push(data.spo2);
                acc.minSpO2 = Math.min(acc.minSpO2, data.spo2);
            }
            if (data.bodyTemperature) {
                acc.bodyTemps.push(data.bodyTemperature);
            }

            // Môi trường
            if (data.temperature) acc.envTemps.push(data.temperature);
            if (data.humidity) acc.humidities.push(data.humidity);
            if (data.co2) acc.co2Values.push(data.co2);
            if (data.pm25) acc.pm25Values.push(data.pm25);
            if (data.light) acc.lightValues.push(data.light);
            if (data.noise) acc.noiseValues.push(data.noise);

            // Phân bố giai đoạn ngủ
            if (data.stage) {
                acc.stageCounts[data.stage] = (acc.stageCounts[data.stage] || 0) + 1;
            }

            return acc;
        }, {
            heartRates: [],
            spo2Values: [],
            bodyTemps: [],
            envTemps: [],
            humidities: [],
            co2Values: [],
            pm25Values: [],
            lightValues: [],
            noiseValues: [],
            stageCounts: {},
            minHeartRate: Infinity,
            maxHeartRate: -Infinity,
            minSpO2: Infinity
        });

        // Tính trung bình
        const calculateAverage = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

        // Tính phân bố giai đoạn ngủ (%)
        const totalSamples = sleepData.length;
        const stagePercentages = {};
        Object.keys(totals.stageCounts).forEach(stage => {
            stagePercentages[`stage${stage}Percent`] = (totals.stageCounts[stage] / totalSamples) * 100;
        });

        return {
            // Chỉ số sinh lý
            avgHeartRate: calculateAverage(totals.heartRates),
            minHeartRate: totals.minHeartRate === Infinity ? null : totals.minHeartRate,
            maxHeartRate: totals.maxHeartRate === -Infinity ? null : totals.maxHeartRate,
            avgSpO2: calculateAverage(totals.spo2Values),
            minSpO2: totals.minSpO2 === Infinity ? null : totals.minSpO2,
            avgBodyTemp: calculateAverage(totals.bodyTemps),

            // Môi trường
            avgEnvTemp: calculateAverage(totals.envTemps),
            avgHumidity: calculateAverage(totals.humidities),
            avgCO2: calculateAverage(totals.co2Values),
            avgPM25: calculateAverage(totals.pm25Values),
            avgLight: calculateAverage(totals.lightValues),
            avgNoise: calculateAverage(totals.noiseValues),

            // Phân bố giai đoạn
            ...stagePercentages,
            totalSamples,
            dataPoints: sleepData.length
        };
    }

    /**
     * Tính toán chỉ số chất lượng
     */
    calculateQualityMetrics(sleepStat, calculatedMetrics) {
        // 1. Tính sleep efficiency (dựa trên tổng thời gian ngủ thực tế)
        const totalSleepSeconds = sleepStat.totalTime / 1000;
        const timeInBedSeconds = totalSleepSeconds * 1.1; // Giả định
        const sleepEfficiency = (totalSleepSeconds / timeInBedSeconds) * 100;

        // 2. Tính điểm môi trường
        const envScore = this.calculateEnvironmentScore(calculatedMetrics);

        // 3. Tính điểm sinh lý
        const physScore = this.calculatePhysiologyScore(calculatedMetrics);

        // 4. Tính điểm tổng (cân nhắc cả dữ liệu từ IoT)
        const overallScore = this.calculateOverallScore(
            sleepStat,
            calculatedMetrics,
            sleepEfficiency,
            envScore,
            physScore
        );

        return {
            sleepEfficiency: parseFloat(sleepEfficiency.toFixed(1)),
            environmentScore: parseFloat(envScore.toFixed(1)),
            physiologyScore: parseFloat(physScore.toFixed(1)),
            overallScore: parseFloat(overallScore.toFixed(1)),
            qualityLevel: this.getQualityLevel(overallScore)
        };
    }

    /**
     * Tính điểm môi trường
     */
    calculateEnvironmentScore(metrics) {
        let score = 100;

        // Nhiệt độ phòng (18-22°C lý tưởng)
        if (metrics.avgEnvTemp !== null) {
            if (metrics.avgEnvTemp < 16 || metrics.avgEnvTemp > 24) score -= 30;
            else if (metrics.avgEnvTemp < 18 || metrics.avgEnvTemp > 22) score -= 15;
        }

        // Độ ẩm (40-60% lý tưởng)
        if (metrics.avgHumidity !== null) {
            if (metrics.avgHumidity < 30 || metrics.avgHumidity > 70) score -= 20;
            else if (metrics.avgHumidity < 40 || metrics.avgHumidity > 60) score -= 10;
        }

        // CO2 (<1000ppm tốt)
        if (metrics.avgCO2 !== null) {
            if (metrics.avgCO2 > 1500) score -= 25;
            else if (metrics.avgCO2 > 1000) score -= 15;
        }

        // Tiếng ồn (<30dB tốt)
        if (metrics.avgNoise !== null) {
            if (metrics.avgNoise > 50) score -= 25;
            else if (metrics.avgNoise > 30) score -= 10;
        }

        return Math.max(0, score);
    }

    /**
     * Tính điểm sinh lý
     */
    calculatePhysiologyScore(metrics) {
        let score = 100;

        // Nhịp tim
        if (metrics.avgHeartRate !== null) {
            if (metrics.avgHeartRate < 40 || metrics.avgHeartRate > 100) score -= 30;
            else if (metrics.avgHeartRate < 50 || metrics.avgHeartRate > 90) score -= 15;
        }

        // SpO2
        if (metrics.avgSpO2 !== null) {
            if (metrics.avgSpO2 < 90) score -= 40;
            else if (metrics.avgSpO2 < 95) score -= 20;
        }

        return Math.max(0, score);
    }

    /**
     * Tính điểm tổng
     */
    calculateOverallScore(sleepStat, metrics, sleepEfficiency, envScore, physScore) {
        let score = 0;
        let weightCount = 0;

        // Cân nhắc sleep efficiency (30%)
        score += sleepEfficiency * 0.3;
        weightCount += 0.3;

        // Cân nhắc điểm sinh lý (30%)
        score += physScore * 0.3;
        weightCount += 0.3;

        // Cân nhắc điểm môi trường (20%)
        score += envScore * 0.2;
        weightCount += 0.2;

        // Cân nhắc tỷ lệ ngủ sâu từ IoT (nếu có) (10%)
        if (metrics.deepSleepPercent) {
            score += Math.min(metrics.deepSleepPercent, 30) * (0.1 / 30) * 100;
            weightCount += 0.1;
        }

        // Cân nhắc số lần thay đổi tư thế từ IoT (10%)
        if (sleepStat.positionChanges !== null) {
            const positionChangeScore = Math.max(0, 100 - (sleepStat.positionChanges * 2));
            score += positionChangeScore * 0.1;
            weightCount += 0.1;
        }

        // Normalize score
        return weightCount > 0 ? score / weightCount : 0;
    }

    /**
     * Xác định mức chất lượng
     */
    getQualityLevel(score) {
        if (score >= 80) return 'excellent';
        if (score >= 65) return 'good';
        if (score >= 50) return 'fair';
        return 'poor';
    }

    /**
     * Tạo phân tích bằng AI
     */
    async generateAIAnalysis(sleepStat, calculatedMetrics, qualityMetrics) {
        try {
            const prompt = this.createAIPrompt(sleepStat, calculatedMetrics, qualityMetrics);

            const response = await this.openai.chat.completions.create({
                model: "gpt-5-nano",
                messages: [
                    {
                        role: "system",
                        content: "Bạn là chuyên gia phân tích giấc ngủ tại bệnh viện. Hãy phân tích dữ liệu giấc ngủ và đưa ra nhận xét chuyên môn, khuyến nghị thực tế. Luôn trả lời bằng tiếng Việt."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_completion_tokens: 2000
            });

            return response.choices[0].message.content;

        } catch (error) {
            console.error('Lỗi khi gọi OpenAI:', error);
            return 'Không thể tạo phân tích AI lúc này. Vui lòng thử lại sau.';
        }
    }

    /**
     * Tạo prompt cho AI
     */
    createAIPrompt(sleepStat, calculatedMetrics, qualityMetrics) {
        const sleepDurationHours = sleepStat.totalSleepHours ||
            ((sleepStat.endTime - sleepStat.startTime) / (1000 * 60 * 60)).toFixed(1);

        const reportDate = new Date(sleepStat.startTime).toLocaleDateString('vi-VN');

        return `
# PHÂN TÍCH GIẤC NGỦ - ${reportDate}

## THÔNG TIN TỔNG QUAN
- Thời gian ngủ: ${sleepDurationHours} giờ
- Ngủ đủ giấc: ${sleepStat.isCompleteSleep ? 'Có' : 'Không'}
- Chất lượng tổng thể: ${qualityMetrics.qualityLevel.toUpperCase()} (${qualityMetrics.overallScore}/100 điểm)

## CHỈ SỐ TỪ THIẾT BỊ IoT
- Tổng thời gian: ${(sleepStat.totalTime / (1000 * 60 * 60)).toFixed(2)} giờ
- Thay đổi tư thế: ${sleepStat.positionChanges || 0} lần
- Phân bố tư thế:
  + Nằm trái: ${sleepStat.timeLeft || 0}s
  + Nằm phải: ${sleepStat.timeRight || 0}s
  + Nằm ngửa: ${sleepStat.timeCenter || 0}s

## CHỈ SỐ SINH LÝ ĐO ĐƯỢC
- Nhịp tim trung bình: ${calculatedMetrics.avgHeartRate ? calculatedMetrics.avgHeartRate.toFixed(1) : 'N/A'} bpm
- Nhịp tim thấp nhất: ${calculatedMetrics.minHeartRate || calculatedMetrics.avgHeartRate?.toFixed(1) || 'N/A'} bpm
- SpO2 trung bình: ${calculatedMetrics.avgSpO2 ? calculatedMetrics.avgSpO2.toFixed(1) : 'N/A'}%
- SpO2 thấp nhất: ${calculatedMetrics.minSpO2 || calculatedMetrics.avgSpO2?.toFixed(1) || 'N/A'}%
- Thân nhiệt: ${calculatedMetrics.avgBodyTemp ? calculatedMetrics.avgBodyTemp.toFixed(1) : 'N/A'}°C

## MÔI TRƯỜNG NGỦ
- Nhiệt độ phòng: ${calculatedMetrics.avgEnvTemp ? calculatedMetrics.avgEnvTemp.toFixed(1) : 'N/A'}°C
- Độ ẩm: ${calculatedMetrics.avgHumidity ? calculatedMetrics.avgHumidity.toFixed(1) : 'N/A'}%
- CO2: ${calculatedMetrics.avgCO2 ? calculatedMetrics.avgCO2.toFixed(0) : 'N/A'} ppm
- PM2.5: ${calculatedMetrics.avgPM25 ? calculatedMetrics.avgPM25.toFixed(1) : 'N/A'} μg/m³
- Ánh sáng: ${calculatedMetrics.avgLight ? calculatedMetrics.avgLight.toFixed(1) : 'N/A'} lux
- Độ ồn: ${calculatedMetrics.avgNoise ? calculatedMetrics.avgNoise.toFixed(1) : 'N/A'} dB

## PHÂN BỐ GIAI ĐOẠN NGỦ
- Ngủ nhẹ: ${calculatedMetrics.stage1Percent ? calculatedMetrics.stage1Percent.toFixed(1) : 'N/A'}%
- Ngủ sâu: ${calculatedMetrics.stage2Percent ? calculatedMetrics.stage2Percent.toFixed(1) : 'N/A'}%
- Sắp tỉnh: ${calculatedMetrics.stage3Percent ? calculatedMetrics.stage3Percent.toFixed(1) : 'N/A'}%

## ĐIỂM ĐÁNH GIÁ CHI TIẾT
- Hiệu suất giấc ngủ: ${qualityMetrics.sleepEfficiency}/100
- Chất lượng môi trường: ${qualityMetrics.environmentScore}/100
- Ổn định sinh lý: ${qualityMetrics.physiologyScore}/100
- **ĐIỂM TỔNG: ${qualityMetrics.overallScore}/100**

## YÊU CẦU PHÂN TÍCH:
1. ĐÁNH GIÁ TỔNG QUAN về chất lượng giấc ngủ này
2. PHÂN TÍCH CHI TIẾT từng khía cạnh (thời lượng, cấu trúc, môi trường, sinh lý)
3. ĐỀ XUẤT 3-5 biện pháp cải thiện cụ thể, thực tế
4. CẢNH BÁO các vấn đề sức khỏe tiềm ẩn (nếu có)
5. DỰ BÁO ảnh hưởng đến năng lượng và tinh thần ngày hôm sau

**Lưu ý:**
- Sử dụng ngôn ngữ tự nhiên, dễ hiểu
- So sánh với tiêu chuẩn giấc ngủ khỏe mạnh
- Đề xuất phải thực tế, có thể áp dụng ngay
- Nhấn mạnh vào các điểm tích cực và cần cải thiện
`;
    }

    /**
     * Lưu báo cáo vào database
     */
    async saveAnalysisReport(data) {
        const {
            deviceID,
            sleepStatID,
            sleepStat,
            calculatedMetrics,
            qualityMetrics,
            aiAnalysis
        } = data;

        const query = `
            INSERT INTO sleepAnalysisReports (
                deviceID, sleepStatID, reportDate,
                totalSleepHours, isCompleteSleep, timeLeft, timeRight, timeCenter, positionChanges,
                avgHeartRate, minHeartRate, maxHeartRate, avgSpO2, minSpO2, avgBodyTemp,
                avgEnvTemp, avgHumidity, avgCO2, avgPM25, avgLight, avgNoise,
                lightSleepPercent, deepSleepPercent, wakingSleepPercent,
                sleepEfficiency, environmentScore, physiologyScore, overallScore, qualityLevel,
                aiAnalysis, recommendations
            ) VALUES (?, ?, date(?, 'unixepoch'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // Trích xuất khuyến nghị từ AI analysis (đơn giản)
        const recommendations = this.extractRecommendations(aiAnalysis);

        const params = [
            deviceID,
            sleepStatID,
            sleepStat.startTime / 1000, // Chuyển sang seconds cho date()
            sleepStat.totalSleepHours,
            sleepStat.isCompleteSleep ? 1 : 0,
            sleepStat.timeLeft,
            sleepStat.timeRight,
            sleepStat.timeCenter,
            sleepStat.positionChanges,
            calculatedMetrics.avgHeartRate,
            calculatedMetrics.minHeartRate,
            calculatedMetrics.maxHeartRate,
            calculatedMetrics.avgSpO2,
            calculatedMetrics.minSpO2,
            calculatedMetrics.avgBodyTemp,
            calculatedMetrics.avgEnvTemp,
            calculatedMetrics.avgHumidity,
            calculatedMetrics.avgCO2,
            calculatedMetrics.avgPM25,
            calculatedMetrics.avgLight,
            calculatedMetrics.avgNoise,
            calculatedMetrics.stage1Percent,
            calculatedMetrics.stage2Percent,
            calculatedMetrics.stage3Percent,
            qualityMetrics.sleepEfficiency,
            qualityMetrics.environmentScore,
            qualityMetrics.physiologyScore,
            qualityMetrics.overallScore,
            qualityMetrics.qualityLevel,
            aiAnalysis,
            JSON.stringify(recommendations)
        ];

        return new Promise((resolve, reject) => {
            this.db.run(query, params, function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    /**
     * Trích xuất khuyến nghị từ AI analysis
     */
    extractRecommendations(aiAnalysis) {
        const recommendations = [];
        const lines = aiAnalysis.split('\n');
        let inRecommendations = false;

        for (const line of lines) {
            if (line.includes('ĐỀ XUẤT') || line.includes('khuyến nghị') ||
                line.includes('biện pháp') || line.includes('cải thiện')) {
                inRecommendations = true;
                continue;
            }

            if (inRecommendations) {
                // Tìm các gạch đầu dòng hoặc số thứ tự
                if (line.match(/^\d+[\.\)]/) || line.includes('- ') ||
                    line.includes('• ') || line.includes('+ ')) {
                    const cleanLine = line.replace(/^[\d\.\)\-\+\•\s]+/, '').trim();
                    if (cleanLine.length > 10) {
                        recommendations.push(cleanLine);
                    }
                }

                // Dừng khi gặp section khác
                if (line.includes('CẢNH BÁO') || line.includes('DỰ BÁO') ||
                    line.includes('KẾT LUẬN')) {
                    break;
                }
            }
        }

        return recommendations.slice(0, 5); // Lấy tối đa 5 khuyến nghị
    }

    /**
     * Tạo trigger record
     */
    async createTriggerRecord(sleepStatID, triggerType, status) {
        const query = `
            INSERT INTO analysisTriggers 
            (sleepStatID, triggerType, status, startedAt) 
            VALUES (?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            this.db.run(query, [sleepStatID, triggerType, status, Date.now()], function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    /**
     * Cập nhật trigger status
     */
    async updateTriggerStatus(sleepStatID, status, errorMessage = null) {
        const query = `
            UPDATE analysisTriggers 
            SET status = ?, 
                errorMessage = ?,
                completedAt = ?
            WHERE sleepStatID = ? 
                AND status != 'completed'
            ORDER BY id DESC LIMIT 1
        `;

        return new Promise((resolve, reject) => {
            this.db.run(query, [status, errorMessage, Date.now(), sleepStatID], function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    /**
     * Lấy báo cáo theo ID
     */
    async getReport(sleepStatID) {
        const query = `
            SELECT * FROM sleepAnalysisReports 
            WHERE sleepStatID = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.get(query, [sleepStatID], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Lấy tất cả báo cáo của một device
     */
    async getDeviceReports(deviceID, limit = 10) {
        const query = `
            SELECT 
                r.*,
                s.startTime,
                s.endTime
            FROM sleepAnalysisReports r
            JOIN sleepStatistic s ON r.sleepStatID = s.id
            WHERE r.deviceID = ?
            ORDER BY r.createdAt DESC
            LIMIT ?
        `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [deviceID, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * API endpoint handler (dùng trong Express/HTTP server)
     */
    async handleNewSleepStatistic(req, res) {
        try {
            const { sleepStatID } = req.body;

            if (!sleepStatID) {
                return res.status(400).json({
                    success: false,
                    error: 'Thiếu sleepStatID'
                });
            }

            // Xử lý bất đồng bộ, không block response
            this.processNewSleepStatistic(sleepStatID)
                .then(result => {
                    console.log(`Xử lý thành công: ${sleepStatID}`);
                })
                .catch(error => {
                    console.error(`Xử lý thất bại: ${sleepStatID}`, error);
                });

            // Trả về ngay lập tức
            res.json({
                success: true,
                message: 'Đã nhận yêu cầu phân tích. Báo cáo sẽ được tạo trong vài phút.',
                sleepStatID
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Re AI 
     */
    async reGenerateAIAnalysis(sleepStatID) {
        try {

            //lay sleep data
            const sleepStat = await this.getSleepStatistic(sleepStatID);
            if (!sleepStat) {
                throw new Error("Không tìm thấy sleepStatistic với ID: " + sleepStatID);
            }

            // Lấy báo cáo hiện tại 
            const report = await new Promise((resolve, reject) => {
                this.db.get(`
                SELECT * FROM sleepAnalysisReports
                WHERE sleepStatID = ?
            `, [sleepStatID], (err, row) => {
                    if (err) {
                        reject(new Error("Database error: " + err.message));
                        return;
                    }
                    if (!row) {
                        reject(new Error("Không tìm thấy báo cáo với sleepStatID: " + sleepStatID));
                        return;
                    }
                    resolve(row);
                });
            });

            // chuan bi truoc du lieu da tinh toan
            const calculatedMetrics = {
                avgHeartRate: report.avgHeartRate,
                minHeartRate: report.minHeartRate,
                maxHeartRate: report.maxHeartRate,
                avgSpO2: report.avgSpO2,
                minSpO2: report.minSpO2,
                avgBodyTemp: report.avgBodyTemp,
                avgEnvTemp: report.avgEnvTemp,
                avgHumidity: report.avgHumidity,
                avgCO2: report.avgCO2,
                avgPM25: report.avgPM25,
                avgLight: report.avgLight,
                avgNoise: report.avgNoise,
                lightSleepPercent: report.lightSleepPercent,
                deepSleepPercent: report.deepSleepPercent,
                wakingSleepPercent: report.wakingSleepPercent,
            }
            // chuan bi truoc du lieu da tinh toan
            const qualityMetrics = {
                sleepEfficiency: report.sleepEfficiency,
                environmentScore: report.environmentScore,
                physiologyScore: report.physiologyScore,
                overallScore: report.overallScore,
                qualityLevel: report.qualityLevel,
            }
            //tao promt
            const prompt = this.createAIPrompt(sleepStat, calculatedMetrics, qualityMetrics);

            const response = await this.openai.chat.completions.create({
                model: "gpt-5-nano",
                messages: [
                    {
                        role: "system",
                        content: "Bạn là chuyên gia phân tích giấc ngủ tại bệnh viện. Hãy phân tích dữ liệu giấc ngủ và đưa ra nhận xét chuyên môn, khuyến nghị thực tế. Luôn trả lời bằng tiếng Việt."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            });

            console.log(response)
            console.log(response.choices[0].message.content)

            const newAnalysis = response.choices[0].message.content;

            // Cập nhật lại database với phân tích mới
            await this.updateAIAnalysis(sleepStatID, newAnalysis);

            return response.choices[0].message.content;

        } catch (error) {
            console.error('Lỗi khi gọi OpenAI:', error);
            throw error
            return 'Không thể tạo phân tích AI lúc này. Vui lòng thử lại sau.';
        }
    }

    /**
     * Cập nhật phân tích AI mới vào database
     */
    async updateAIAnalysis(sleepStatID, newAnalysis) {
        return new Promise((resolve, reject) => {
            const query = `
            UPDATE sleepAnalysisReports 
            SET 
                aiAnalysis = ?,
                recommendations = ?,
                updatedAt = strftime('%s', 'now')
            WHERE sleepStatID = ?
        `;

            const recommendations = this.extractRecommendations(newAnalysis);

            this.db.run(query, [
                newAnalysis,
                JSON.stringify(recommendations),
                sleepStatID
            ], function (err) {
                if (err) {
                    reject(new Error("Lỗi cập nhật database: " + err.message));
                } else {
                    console.log(`Đã cập nhật phân tích AI cho sleepStatID: ${sleepStatID}`);
                    resolve(this.changes);
                }
            });
        });
    }

    /**
     * Cleanup
     */
    close() {
        this.db.close();
    }


    // TEST
    /**
 * Test database connection
 */
    async testDatabaseConnection() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT 1 as test_value", (err, result) => {
                if (err) {
                    console.error("Database connection test FAILED:", err.message);
                    reject(err);
                } else {
                    console.log("Database connection test PASSED:", result);
                    resolve(result);
                }
            });
        });
    }
    // Thêm method test
    async testAll() {
        try {
            console.log("=== Bắt đầu test ===");

            // Test 1: Kết nối database
            await this.testDatabaseConnection();

            // Test 2: Kiểm tra table exists
            const tables = await this.getTableList();
            console.log("Tables in database:", tables);

            // Test 3: Kiểm tra có sleepAnalysisReports không
            const hasReportsTable = tables.some(t => t.name === 'sleepAnalysisReports');
            console.log("Has sleepAnalysisReports table:", hasReportsTable);

            if (hasReportsTable) {
                // Test 4: Đếm số báo cáo
                const count = await this.getReportCount();
                console.log("Total reports in database:", count);

                // Test 5: Lấy báo cáo đầu tiên
                const firstReport = await this.getFirstReport();
                console.log("First report sleepStatID:", firstReport?.sleepStatID);

                if (firstReport) {
                    // Test 6: Tạo lại phân tích cho báo cáo đầu tiên
                    console.log("Testing reGenerateAIAnalysis...");
                    const result = await this.reGenerateAIAnalysis(firstReport.sleepStatID);
                    console.log("Test SUCCESS! Result length:", result?.length);
                }
            }

        } catch (error) {
            console.error("Test FAILED:", error);
        }
    }

    // Thêm các helper methods
    async getTableList() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getReportCount() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT COUNT(*) as count FROM sleepAnalysisReports", (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });
    }

    async getFirstReport() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT sleepStatID FROM sleepAnalysisReports ORDER BY id LIMIT 1", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = SleepAnalysisService;