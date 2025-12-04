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