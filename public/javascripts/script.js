/**************************************
 * 1) Generic API Fetcher 
 **************************************/
async function fetchData(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Network error");
        return await res.json();
    } catch (err) {
        console.error("Fetch error:", err);
        return [];
    }
}

/**************************************
 * 2) Chuẩn hóa dữ liệu cho Chart.js
 * fields = { x: 'timestamp', y: 'temperature' }
 **************************************/
function prepareChartData(data, fields) {
    return data
        .filter(item => item[fields.x] && item[fields.y] !== null)
        .map(item => ({
            x: item[fields.x] * 1000,     // convert UNIX seconds
            y: item[fields.y]
        }));
}

/**************************************
 * 3) Hàm vẽ line chart
 **************************************/
function renderLineChart(canvasId, chartData, options = {}) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Destroy chart cũ (Chart.js yêu cầu)
    if (window._charts === undefined) window._charts = {};
    if (window._charts[canvasId]) window._charts[canvasId].destroy();

    const chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: chartData.map((each => each.x)),
            datasets: [{
                label: options.label || "Dataset",
                data: chartData.map((each => each.y)),
                borderWidth: 2,
                tension: 0.25,     // đường cong nhẹ
                pointRadius: 2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: options.timeUnit || "hour" },
                    display: true
                },
                y: {
                    display: true,
                    beginAtZero: false
                }
            }
        }
    });

    window._charts[canvasId] = chart;
}

function getNotice(value, type) {
    const config = {
        temperature: {
            min: 23,
            max: 28,
            threshold: 2,
            messages: {
                comfortable: "Comfortable",
                slightlyLow: "Slightly below normal",
                slightlyHigh: "Slightly above normal",
                tooLow: "Too cold",
                tooHigh: "Too hot",
            },
        },
        light: {
            min: 0,
            max: 3,
            threshold: 2,
            messages: {
                comfortable: "Low risk",
                slightlyHigh: "Moderate - Consider protection",
                tooHigh: "High - Use protection",
            },
        },
        co2: {
            min: 0,
            max: 50,
            threshold: 50,
            messages: {
                comfortable: "Good air quality",
                slightlyHigh: "Moderate",
                tooHigh: "Unhealthy for sensitive groups",
            },
        },
        humidity: {
            min: 40,
            max: 60,
            threshold: 10,
            messages: {
                comfortable: "Comfortable humidity",
                slightlyLow: "Slightly dry",
                tooLow: "Too dry - Use humidifier",
                slightlyHigh: "Slightly humid",
                tooHigh: "Too humid - Risk of mold",
            },
        },
        pm25: {
            min: 0,
            max: 35,
            threshold: 15,
            messages: {
                comfortable: "Good air quality",
                slightlyHigh: "Moderate pollution",
                tooHigh: "Unhealthy air - Wear mask",
            },
        },
        heartRate: {
            min: 60,
            max: 100,
            threshold: 20,
            messages: {
                comfortable: "Normal heart rate",
                slightlyLow: "Slightly low HR",
                tooLow: "Bradycardia - Too low",
                slightlyHigh: "Slightly high HR",
                tooHigh: "Tachycardia - Too high",
            },
        },
        spo2: {
            min: 92,
            max: 100,
            threshold: 2,
            messages: {
                comfortable: "Oxygen level normal",
                slightlyLow: "Slightly low oxygen",
                tooLow: "Low oxygen - Check health",
            },
        },
        bodyTemperature: {
            min: 36,
            max: 37.5,
            threshold: 0.5,
            messages: {
                comfortable: "Normal body temp",
                slightlyLow: "Slightly below normal",
                tooLow: "Hypothermia risk",
                slightlyHigh: "Slightly elevated",
                tooHigh: "Fever detected",
            },
        },
    };

    const setting = config[type];
    if (!setting) return "Unknown";

    const { min, max, threshold, messages } = setting;

    if (value >= min && value <= max) {
        return messages.comfortable || "Normal";
    } else if (value < min) {
        const diff = min - value;
        if (diff <= threshold) return messages.slightlyLow || "Slightly low";
        else return messages.tooLow || "Too low";
    } else {
        const diff = value - max;
        if (diff <= threshold)
            return messages.slightlyHigh || "Slightly high";
        else return messages.tooHigh || "Too high";
    }
}


async function loadChart() {
    // gọi API: GET /sleep-data?deviceID=1
    const rawData = await fetchData("/api/sleep-data", { deviceID: 1 });
    if (rawData.success == false) {
        console.log(rawData.error);
        return;
    }

    const chartIDs = ["tempChart", "humidChart", "co2Chart", "pm25Chart", "heartRateChart", "oxygenChart", "healthTempChart", "lightChart", "noiseChart"]
    const chartdataType = ["temperature", "humidity", "co2", "pm25", "heartRate", "spo2", "bodyTemperature", "light", "noise"]
    const chartLabel = ["Temperature (°C)", "Humidity(%)", "CO2", "PM25 (ug/m3)", "Heart Rate (BPM)", "SpO2 (%)", "Body Temperature (°C)", "Light", "Noise"]


    for (let i = 0; i < chartIDs.length; i++) {
        const data = prepareChartData(rawData.data, { x: "timestamp", y: chartdataType[i] })

        renderLineChart(chartIDs[i], data, { label: chartLabel[i], timeUnit: "hour" })
    }
}

// chạy sau khi trang load
loadChart();

/**************************************
 * 4) Sleep Analysis Modal Functions
 **************************************/

// Fetch last report data
async function fetchLastReport() {
    try {
        const res = await fetch('/statistic/last-report');
        if (!res.ok) throw new Error("Network error");
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("Fetch last report error:", err);
        return { success: false, error: err.message };
    }
}

// Format date from YYYY-MM-DD or timestamp
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Format quality level to Vietnamese
function formatQualityLevel(level) {
    const levels = {
        'excellent': 'Xuất sắc',
        'good': 'Tốt',
        'fair': 'Trung bình',
        'poor': 'Kém'
    };
    return levels[level] || level;
}

// Populate modal with report data
function populateModal(report) {
    // Report date
    document.getElementById('reportDate').textContent = formatDate(report.reportDate);

    // Scores
    document.getElementById('overallScore').textContent = report.overallScore || '-';
    document.getElementById('physiologyScore').textContent = report.physiologyScore || '-';
    document.getElementById('environmentScore').textContent = report.environmentScore || '-';
    document.getElementById('qualityLevel').textContent = formatQualityLevel(report.qualityLevel);

    // Sleep metrics
    document.getElementById('totalSleepHours').textContent = report.totalSleepHours || '-';
    document.getElementById('sleepEfficiency').textContent = report.sleepEfficiency || '-';
    document.getElementById('deepSleepPercent').textContent =
        report.deepSleepPercent ? report.deepSleepPercent.toFixed(1) : '-';
    document.getElementById('positionChanges').textContent = report.positionChanges || '-';

    // Health metrics
    document.getElementById('avgHeartRate').textContent =
        report.avgHeartRate ? report.avgHeartRate.toFixed(1) : '-';
    document.getElementById('avgSpO2').textContent =
        report.avgSpO2 ? report.avgSpO2.toFixed(1) : '-';
    document.getElementById('avgBodyTemp').textContent =
        report.avgBodyTemp ? report.avgBodyTemp.toFixed(1) : '-';

    // AI Analysis
    document.getElementById('aiAnalysis').textContent = report.aiAnalysis || 'Không có phân tích';

    // Recommendations
    const recommendationsList = document.getElementById('recommendations');
    recommendationsList.innerHTML = '';

    if (report.recommendations && Array.isArray(report.recommendations)) {
        report.recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.className = 'flex items-start gap-2 bg-white rounded-lg p-3';
            li.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
                <span class="text-sm text-gray-700">${rec}</span>
            `;
            recommendationsList.appendChild(li);
        });
    } else {
        recommendationsList.innerHTML = '<li class="text-sm text-gray-500 bg-white rounded-lg p-3">Không có khuyến nghị</li>';
    }
}

// Show modal states
function showLoadingState() {
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('contentState').classList.add('hidden');
}

function showErrorState(message) {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('contentState').classList.add('hidden');
    document.getElementById('errorMessage').textContent = message || 'Không thể tải dữ liệu';
}

function showContentState() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('contentState').classList.remove('hidden');
}

// Open modal and load data
async function openAnalysisModal() {
    const modal = document.getElementById('analysisModal');
    modal.classList.remove('hidden');
    showLoadingState();

    const result = await fetchLastReport();

    if (result.success && result.data && result.data.length > 0) {
        populateModal(result.data[0]);
        showContentState();
    } else {
        showErrorState(result.error || 'Không tìm thấy báo cáo');
    }
}

// Close modal
function closeAnalysisModal() {
    const modal = document.getElementById('analysisModal');
    modal.classList.add('hidden');
}

async function openThresholdMoal() {
    const modal = document.getElementById('thresholdModal');
    modal.classList.remove('hidden');

    // Load current thresholds
    await loadCurrentThresholds();
}

// Event listeners for modal
document.addEventListener('DOMContentLoaded', function () {
    const analysisBtn = document.getElementById('analysisBtn');
    const closeModalBtn = document.getElementById('closeModal');
    const modal = document.getElementById('analysisModal');
    const settingThresholdBtn = document.getElementById("settingThresholdBtn");

    // Open modal on button click
    if (analysisBtn) {
        analysisBtn.addEventListener('click', openAnalysisModal);
    }

    // Close modal on close button click
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeAnalysisModal);
    }

    // Close modal on overlay click
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                closeAnalysisModal();
            }
        });
    }

    if (settingThresholdBtn) {
        settingThresholdBtn.addEventListener('click', async function (e) {
            await openThresholdMoal();
        })
    }

    // Threshold modal event listeners
    const closeThresholdModalBtn = document.getElementById('closeThresholdModal');
    const cancelThresholdBtn = document.getElementById('cancelThresholdBtn');
    const saveThresholdBtn = document.getElementById('saveThresholdBtn');
    const thresholdModal = document.getElementById('thresholdModal');

    if (closeThresholdModalBtn) {
        closeThresholdModalBtn.addEventListener('click', closeThresholdModal);
    }

    if (cancelThresholdBtn) {
        cancelThresholdBtn.addEventListener('click', closeThresholdModal);
    }

    if (saveThresholdBtn) {
        saveThresholdBtn.addEventListener('click', saveThresholds);
    }

    if (thresholdModal) {
        thresholdModal.addEventListener('click', function (e) {
            if (e.target === thresholdModal) {
                closeThresholdModal();
            }
        });
    }


    // Close modal on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeAnalysisModal();
            closeThresholdModal();
        }
    });
});


/**************************************
 * 5) Threshold Modal Functions
 **************************************/

// Load current threshold values from API
async function loadCurrentThresholds() {
    try {
        const result = await fetchData('/api/thresholds', { deviceID: 1 });
        if (result.success && result.data && result.data.length > 0) {
            const thresholds = result.data[0];
            document.getElementById('tempThreshold').value = thresholds.temp || '';
            document.getElementById('humidThreshold').value = thresholds.humid || '';
            document.getElementById('pm25Threshold').value = thresholds.pm25 || '';
            document.getElementById('co2Threshold').value = thresholds.co2 || '';
            document.getElementById('noiseThreshold').value = thresholds.noise || '';
            document.getElementById('lightThreshold').value = thresholds.light || '';
        }
    } catch (error) {
        console.error('Error loading thresholds:', error);
    }
}

// Save threshold values
async function saveThresholds() {
    const formData = new FormData(document.getElementById('thresholdForm'));
    const thresholds = {
        deviceID: 1,
        temp: parseFloat(formData.get('temp')) || 30.0,
        humid: parseFloat(formData.get('humid')) || 70.0,
        pm25: parseFloat(formData.get('pm25')) || 50.0,
        co2: parseFloat(formData.get('co2')) || 1000.0,
        noise: parseFloat(formData.get('noise')) || 50.0,
        light: parseFloat(formData.get('light')) || 300.0
    };

    try {
        const response = await fetch('/api/thresholds/upsert', {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(thresholds)
        })

        const res = await response.json();
        if (res.success) {
            alert('Ngưỡng đã được lưu!');
            closeThresholdModal();
        } else {
            alert('Có lỗi xảy ra khi lưu ngưỡng: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving thresholds:', error);
        alert('Có lỗi xảy ra khi lưu ngưỡng');
    }
}

// Close threshold modal
function closeThresholdModal() {
    const modal = document.getElementById('thresholdModal');
    modal.classList.add('hidden');
}
