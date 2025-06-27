// Global variables
let map;
let originMarker, destMarker;
let originCoords = null;
let destCoords = null;
let windChart, waveChart, swellChart, currentChart;
let routeLine = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupEventListeners();
});

// Initialize Leaflet map
function initializeMap() {
    map = L.map('map').setView([20, 0], 2);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
        }).addTo(map);

    // Handle map clicks
    map.on('click', handleMapClick);
}

// Handle map clicks for setting origin/destination
function handleMapClick(e) {
    if (!originCoords) {
        setOrigin(e.latlng.lat, e.latlng.lng);
    } else if (!destCoords) {
        setDestination(e.latlng.lat, e.latlng.lng);
    } else {
        // Reset if both are set
        clearMarkers();
        setOrigin(e.latlng.lat, e.latlng.lng);
    }
}

// Set origin point
function setOrigin(lat, lng) {
    originCoords = { lat, lng };
    if (originMarker) {
        originMarker.remove();
    }
    originMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'custom-marker origin-marker',
            html: '<i class="fas fa-anchor"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(map);
    originMarker.bindPopup('Origin').openPopup();
    
    // Update coordinate inputs
    document.getElementById('originLat').value = lat.toFixed(4);
    document.getElementById('originLng').value = lng.toFixed(4);
}

// Set destination point
function setDestination(lat, lng) {
    destCoords = { lat, lng };
    if (destMarker) {
        destMarker.remove();
    }
    destMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'custom-marker dest-marker',
            html: '<i class="fas fa-flag-checkered"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(map);
    destMarker.bindPopup('Destination').openPopup();
    
    // Update coordinate inputs
    document.getElementById('destLat').value = lat.toFixed(4);
    document.getElementById('destLng').value = lng.toFixed(4);

    // Draw route line
    if (originCoords && routeLine) {
        routeLine.remove();
    }
    if (originCoords) {
        routeLine = L.polyline([[originCoords.lat, originCoords.lng], [lat, lng]], {
            color: '#0077be',
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(map);
        
        // Fit map to show both markers
        const bounds = L.latLngBounds([
            [originCoords.lat, originCoords.lng],
            [lat, lng]
        ]);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Clear all markers
function clearMarkers() {
    if (originMarker) originMarker.remove();
    if (destMarker) destMarker.remove();
    if (routeLine) routeLine.remove();
    originCoords = null;
    destCoords = null;
    originMarker = null;
    destMarker = null;
    routeLine = null;
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    // Get weather button
    document.getElementById('getWeatherBtn').addEventListener('click', fetchWeatherData);

    // Coordinate inputs
    document.getElementById('originLat').addEventListener('change', updateFromCoordinates);
    document.getElementById('originLng').addEventListener('change', updateFromCoordinates);
    document.getElementById('destLat').addEventListener('change', updateFromCoordinates);
    document.getElementById('destLng').addEventListener('change', updateFromCoordinates);

    // Location search
    document.getElementById('originSearch').addEventListener('input', debounce(searchLocation, 500));
    document.getElementById('destSearch').addEventListener('input', debounce(searchLocation, 500));
}

// Switch tabs
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Update markers from coordinate inputs
function updateFromCoordinates() {
    const originLat = parseFloat(document.getElementById('originLat').value);
    const originLng = parseFloat(document.getElementById('originLng').value);
    const destLat = parseFloat(document.getElementById('destLat').value);
    const destLng = parseFloat(document.getElementById('destLng').value);
    
    if (!isNaN(originLat) && !isNaN(originLng)) {
        setOrigin(originLat, originLng);
    }
    
    if (!isNaN(destLat) && !isNaN(destLng)) {
        setDestination(destLat, destLng);
    }
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Search location (mock implementation - replace with actual geocoding API)
async function searchLocation(event) {
    const query = event.target.value;
    const suggestionsId = event.target.id === 'originSearch' ? 'originSuggestions' : 'destSuggestions';
    
    if (query.length < 3) {
        document.getElementById(suggestionsId).style.display = 'none';
        return;
    }

    // Mock suggestions - replace with actual geocoding API
    const suggestions = [
        { name: `${query} Port`, lat: Math.random() * 180 - 90, lng: Math.random() * 360 - 180 },
        { name: `${query} Harbor`, lat: Math.random() * 180 - 90, lng: Math.random() * 360 - 180 },
        { name: `${query} Marina`, lat: Math.random() * 180 - 90, lng: Math.random() * 360 - 180 }
    ];

    displaySuggestions(suggestions, suggestionsId, event.target.id);
}

// Display location suggestions
function displaySuggestions(suggestions, containerId, inputId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    container.style.display = 'block';

    suggestions.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = suggestion.name;
        item.addEventListener('click', () => {
            document.getElementById(inputId).value = suggestion.name;
            container.style.display = 'none';
            
            if (inputId === 'originSearch') {
                setOrigin(suggestion.lat, suggestion.lng);
            } else {
                setDestination(suggestion.lat, suggestion.lng);
            }
        });
        container.appendChild(item);
    });
}

// Get coordinates based on selected tab
function getCoordinates() {
    const activeTab = document.querySelector('.tab-pane.active').id;
    
    if (activeTab === 'mapTab' || activeTab === 'searchTab') {
        return { origin: originCoords, destination: destCoords };
    } else if (activeTab === 'coordinatesTab') {
        return {
            origin: {
                lat: parseFloat(document.getElementById('originLat').value),
                lng: parseFloat(document.getElementById('originLng').value)
            },
            destination: {
                lat: parseFloat(document.getElementById('destLat').value),
                lng: parseFloat(document.getElementById('destLng').value)
            }
        };
    }
}

// Fetch weather data
async function fetchWeatherData() {
    const coords = getCoordinates();
    
    if (!coords.origin || !coords.destination || 
        isNaN(coords.origin.lat) || isNaN(coords.origin.lng) ||
        isNaN(coords.destination.lat) || isNaN(coords.destination.lng)) {
        showError('Please select both origin and destination points');
        return;
    }

    const vesselType = document.getElementById('vesselType').value;
    const maxWindSpeed = document.getElementById('maxWindSpeed').value;
    const maxWaveHeight = document.getElementById('maxWaveHeight').value;

    showLoading(true);

    try {
        const response = await fetch('/api/weather/route', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                origin: coords.origin,
                destination: coords.destination,
                vesselType,
                maxWindSpeed: parseFloat(maxWindSpeed),
                maxWaveHeight: parseFloat(maxWaveHeight)
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch weather data');
        }

        const data = await response.json();
        displayWeatherData(data);
    } catch (error) {
        console.error('Error fetching weather data:', error);
        showError('Failed to fetch weather data. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Display weather data
function displayWeatherData(data) {
    // Show results section
    document.getElementById('resultsSection').classList.remove('hidden');

    // Update route summary
    document.getElementById('routeDistance').textContent = `${data.routeInfo.distance} nm`;
    document.getElementById('routeDuration').textContent = `${data.routeInfo.duration} hours`;
    document.getElementById('avgTemp').textContent = `${data.routeInfo.avgTemp}°C`;

    // Update marine conditions
    updateMarineConditions(data);

    // Display storm alerts
    displayStormAlerts(data);

    // Display forecast cards
    const forecastGrid = document.getElementById('forecastGrid');
    forecastGrid.innerHTML = '';

    data.forecast.forEach((day, index) => {
        const card = createWeatherCard(day, index, data.vesselLimits);
        forecastGrid.appendChild(card);
    });

    // Update all charts
    updateAllCharts(data.forecast);

    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

// Update marine conditions overview
function updateMarineConditions(data) {
    const forecast = data.forecast;
    
    // Calculate averages
    const avgWindSpeed = Math.round(
        forecast.reduce((sum, day) => sum + day.windSpeed, 0) / forecast.length
    );
    const avgSwellHeight = (
        forecast.reduce((sum, day) => sum + day.swellHeight, 0) / forecast.length
    ).toFixed(1);
    const avgCurrentSpeed = (
        forecast.reduce((sum, day) => sum + day.currentSpeed, 0) / forecast.length
    ).toFixed(1);
    
    // Update values
    document.getElementById('avgWindSpeed').textContent = avgWindSpeed;
    document.getElementById('avgSwellHeight').textContent = avgSwellHeight;
    document.getElementById('currentSpeed').textContent = avgCurrentSpeed;
    
    // Storm status
    const stormDays = forecast.filter(day => 
        day.weather === 'Storm' || 
        day.weather === 'Thunderstorm' ||
        day.windSpeed > 50 || 
        day.waveHeight > 6
    );
    
    const stormStatusEl = document.querySelector('.storm-status');
    const stormStatusValue = document.getElementById('stormStatus');
    const stormDaysLabel = document.getElementById('stormDays');
    
    if (stormDays.length === 0) {
        stormStatusEl.classList.remove('warning', 'danger');
        stormStatusValue.textContent = 'Clear';
        stormDaysLabel.textContent = 'No storms detected';
    } else if (stormDays.length <= 2) {
        stormStatusEl.classList.remove('danger');
        stormStatusEl.classList.add('warning');
        stormStatusValue.textContent = 'Caution';
        stormDaysLabel.textContent = `${stormDays.length} storm day(s) detected`;
    } else {
        stormStatusEl.classList.remove('warning');
        stormStatusEl.classList.add('danger');
        stormStatusValue.textContent = 'Danger';
        stormDaysLabel.textContent = `${stormDays.length} storm days detected`;
    }
}

// Display storm alerts
function displayStormAlerts(data) {
    const stormDays = data.forecast.filter((day, index) => 
        day.weather === 'Storm' || 
        day.weather === 'Thunderstorm' ||
        day.windSpeed > 50 || 
        day.waveHeight > 6
    ).map((day, idx) => ({...day, dayIndex: data.forecast.indexOf(day)}));
    
    const alertEl = document.getElementById('stormAlert');
    const alertText = document.getElementById('stormAlertText');
    const stormAlertsSection = document.getElementById('stormAlertsSection');
    const stormAlertsList = document.getElementById('stormAlertsList');

    if (stormDays.length > 0) {
        const maxWind = Math.max(...stormDays.map(d => d.windSpeed));
        const maxWave = Math.max(...stormDays.map(d => d.waveHeight));
        
        let alertMessage = `⚠️ STORM WARNING: Severe weather conditions detected on ${stormDays.length} day(s) of your route. `;
        alertMessage += `Maximum wind speed: ${maxWind} knots. `;
        alertMessage += `Maximum wave height: ${maxWave.toFixed(1)} meters.`;
        
        alertText.textContent = alertMessage;
        alertEl.classList.remove('hidden');
        
        // Show detailed storm alerts
        stormAlertsSection.classList.remove('hidden');
        stormAlertsList.innerHTML = '';
        
        stormDays.forEach(storm => {
            const date = new Date();
            date.setDate(date.getDate() + storm.dayIndex);
            
            const alertItem = document.createElement('div');
            alertItem.className = 'storm-alert-item';
            alertItem.innerHTML = `
                <div class="storm-alert-date">
                    ${formatDate(date)}
                </div>
                <div class="storm-alert-details">
                    <div class="storm-detail">
                        <i class="fas fa-wind"></i>
                        <span class="storm-detail-value">${storm.windSpeed} kts</span>
                    </div>
                    <div class="storm-detail">
                        <i class="fas fa-water"></i>
                        <span class="storm-detail-value">${storm.waveHeight} m waves</span>
                    </div>
                    <div class="storm-detail">
                        <i class="fas fa-cloud-showers-heavy"></i>
                        <span class="storm-detail-value">${storm.weather}</span>
                    </div>
                    <div class="storm-detail">
                        <i class="fas fa-eye"></i>
                                                <span class="storm-detail-value">${storm.visibility} km visibility</span>
                    </div>
                </div>
            `;
            stormAlertsList.appendChild(alertItem);
        });
        
        // Add additional visual warning
        document.body.classList.add('storm-warning');
    } else {
        alertEl.classList.add('hidden');
        stormAlertsSection.classList.add('hidden');
        document.body.classList.remove('storm-warning');
    }
}

// Create weather card
function createWeatherCard(dayData, dayIndex, vesselLimits) {
    const card = document.createElement('div');
    card.className = 'weather-card';

    // Check if conditions exceed vessel limits
    if (dayData.windSpeed > vesselLimits.maxWindSpeed || dayData.waveHeight > vesselLimits.maxWaveHeight) {
        card.classList.add('danger');
    } else if (dayData.windSpeed > vesselLimits.maxWindSpeed * 0.8 || dayData.waveHeight > vesselLimits.maxWaveHeight * 0.8) {
        card.classList.add('warning');
    }

    const weatherIcon = getWeatherIcon(dayData.weather);
    const date = new Date();
    date.setDate(date.getDate() + dayIndex);

    card.innerHTML = `
        <div class="date">${formatDate(date)}</div>
        <div class="weather-icon">${weatherIcon}</div>
        <div class="temp">${Math.round(dayData.temp)}°C</div>
        <div class="weather-desc">${dayData.weather}</div>
        <div class="weather-details">
            <div class="detail-item">
                <span><i class="fas fa-wind"></i> Wind:</span>
                <span>${dayData.windSpeed} kts</span>
            </div>
            <div class="detail-item">
                <span><i class="fas fa-water"></i> Waves:</span>
                <span>${dayData.waveHeight} m</span>
            </div>
            <div class="detail-item swell">
                <span><i class="fas fa-water"></i> Swell:</span>
                <span>${dayData.swellHeight} m</span>
            </div>
            <div class="detail-item current">
                <span><i class="fas fa-stream"></i> Current:</span>
                <span>${dayData.currentSpeed} kts</span>
            </div>
            <div class="detail-item">
                <span><i class="fas fa-tint"></i> Rain:</span>
                <span>${dayData.precipitation}%</span>
            </div>
            <div class="detail-item">
                <span><i class="fas fa-eye"></i> Visibility:</span>
                <span>${dayData.visibility} km</span>
            </div>
        </div>
    `;

    return card;
}

// Get weather icon based on condition
function getWeatherIcon(weather) {
    const weatherMap = {
        'Clear': '<i class="fas fa-sun" style="color: #ffc107;"></i>',
        'Clouds': '<i class="fas fa-cloud" style="color: #6c757d;"></i>',
        'Rain': '<i class="fas fa-cloud-rain" style="color: #0077be;"></i>',
        'Storm': '<i class="fas fa-bolt" style="color: #dc3545;"></i>',
        'Snow': '<i class="fas fa-snowflake" style="color: #17a2b8;"></i>',
        'Fog': '<i class="fas fa-smog" style="color: #6c757d;"></i>',
        'Drizzle': '<i class="fas fa-cloud-rain" style="color: #17a2b8;"></i>',
        'Thunderstorm': '<i class="fas fa-poo-storm" style="color: #dc3545;"></i>',
        'Mist': '<i class="fas fa-smog" style="color: #868e96;"></i>'
    };
    return weatherMap[weather] || '<i class="fas fa-cloud-sun" style="color: #ffc107;"></i>';
}

// Format date
function formatDate(date) {
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Update all charts with weather data
function updateAllCharts(forecast) {
    const labels = forecast.map((_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index);
        return formatDate(date);
    });

    const windData = forecast.map(day => day.windSpeed);
    const waveData = forecast.map(day => day.waveHeight);
    const swellData = forecast.map(day => day.swellHeight);
    const currentData = forecast.map(day => day.currentSpeed);
    
    const maxWindSpeed = parseFloat(document.getElementById('maxWindSpeed').value);
    const maxWaveHeight = parseFloat(document.getElementById('maxWaveHeight').value);

    // Destroy existing charts if they exist
    if (windChart) windChart.destroy();
    if (waveChart) waveChart.destroy();
    if (swellChart) swellChart.destroy();
    if (currentChart) currentChart.destroy();

    // Wind Speed Chart
    const windCtx = document.getElementById('windChart').getContext('2d');
    windChart = new Chart(windCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Wind Speed (knots)',
                data: windData,
                borderColor: '#0077be',
                backgroundColor: 'rgba(0, 119, 190, 0.1)',
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: windData.map(speed => 
                    speed > maxWindSpeed ? '#dc3545' : 
                    speed > maxWindSpeed * 0.8 ? '#ffc107' : '#0077be'
                )
            }, {
                label: 'Max Safe Wind Speed',
                data: new Array(labels.length).fill(maxWindSpeed),
                borderColor: '#dc3545',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }]
        },
        options: getChartOptions('Wind Speed (knots)', maxWindSpeed)
    });

    // Wave Height Chart
    const waveCtx = document.getElementById('waveChart').getContext('2d');
    waveChart = new Chart(waveCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Wave Height (meters)',
                data: waveData,
                borderColor: '#00a8e8',
                backgroundColor: 'rgba(0, 168, 232, 0.1)',
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: waveData.map(height => 
                    height > maxWaveHeight ? '#dc3545' : 
                    height > maxWaveHeight * 0.8 ? '#ffc107' : '#00a8e8'
                )
            }, {
                label: 'Max Safe Wave Height',
                data: new Array(labels.length).fill(maxWaveHeight),
                borderColor: '#dc3545',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }]
        },
        options: getChartOptions('Wave Height (meters)', maxWaveHeight)
    });

    // Swell Height Chart
    const swellCtx = document.getElementById('swellChart').getContext('2d');
    swellChart = new Chart(swellCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Swell Height (meters)',
                data: swellData,
                borderColor: '#17a2b8',
                backgroundColor: 'rgba(23, 162, 184, 0.1)',
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: getChartOptions('Swell Height (meters)')
    });

    // Current Speed Chart
    const currentCtx = document.getElementById('currentChart').getContext('2d');
    currentChart = new Chart(currentCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Current Speed (knots)',
                data: currentData,
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.1)',
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: getChartOptions('Current Speed (knots)')
    });
}

// Get chart options
function getChartOptions(yAxisTitle, maxValue = null) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top'
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        label += context.parsed.y.toFixed(1);
                        
                        if (maxValue && context.datasetIndex === 0 && context.parsed.y > maxValue) {
                            label += ' ⚠️ EXCEEDS LIMIT';
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: yAxisTitle
                }
            }
        }
    };
}

// Show/hide loading spinner
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (show) {
        spinner.classList.remove('hidden');
    } else {
        spinner.classList.add('hidden');
    }
}

// Handle errors
function showError(message) {
    const alertEl = document.getElementById('stormAlert');
    const alertText = document.getElementById('stormAlertText');
    
    alertText.textContent = `❌ Error: ${message}`;
    alertEl.classList.remove('hidden');
    alertEl.style.backgroundColor = '#dc3545';
    
    setTimeout(() => {
        alertEl.classList.add('hidden');
        alertEl.style.backgroundColor = '';
    }, 5000);
}

// Initialize tooltips and other UI enhancements
function initializeUI() {
    // Add tooltips to input fields
    document.getElementById('maxWindSpeed').title = 'Maximum wind speed your vessel can safely handle';
    document.getElementById('maxWaveHeight').title = 'Maximum wave height your vessel can safely handle';
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            fetchWeatherData();
        }
    });
}

// Initialize UI on load
initializeUI();