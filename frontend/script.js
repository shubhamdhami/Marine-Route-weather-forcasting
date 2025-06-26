// Global variables
let selectionMap = null;
let routeMap = null;
let sourceMarker = null;
let destMarker = null;
let selectedSource = null;
let selectedDest = null;
let routePolyline = null;

// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Marine Route Weather System...');
    initializeMaps();
    setupEventListeners();
});

// Initialize Leaflet maps
function initializeMaps() {
    try {
        // Initialize selection map
        selectionMap = L.map('selectionMap').setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(selectionMap);

        // Initialize route display map
        routeMap = L.map('routeMap').setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(routeMap);

        // Add click handler to selection map
        selectionMap.on('click', handleMapClick);
        
        console.log('Maps initialized successfully');
    } catch (error) {
        console.error('Error initializing maps:', error);
        showAlert('Error initializing maps. Please refresh the page.', 'error');
    }
}

// Setup all event listeners
function setupEventListeners() {
    // Input method radio buttons
    const radioButtons = document.querySelectorAll('input[name="inputMethod"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', handleInputMethodChange);
    });

    // Plan route button
    const planRouteBtn = document.getElementById('planRoute');
    if (planRouteBtn) {
        planRouteBtn.addEventListener('click', handlePlanRoute);
    }
    
    // Test connection button
    const testBtn = document.getElementById('testConnection');
    if (testBtn) {
        testBtn.addEventListener('click', testAPIConnection);
    }
}

// Handle input method changes
function handleInputMethodChange(e) {
    const method = e.target.value;
    
    // Hide all input options
    document.querySelectorAll('.input-option').forEach(opt => {
        opt.classList.remove('active');
    });
    
    // Show selected input option
    const selectedOption = document.getElementById(method + 'Input');
    if (selectedOption) {
        selectedOption.classList.add('active');
    }
    
    // Refresh map if map option is selected
    if (method === 'map' && selectionMap) {
        setTimeout(() => {
            selectionMap.invalidateSize();
        }, 100);
    }
}

// Handle map clicks for selecting points
function handleMapClick(e) {
    const { lat, lng } = e.latlng;
    
    if (!selectedSource) {
        // Set source
        selectedSource = { lat, lng };
        if (sourceMarker) {
            selectionMap.removeLayer(sourceMarker);
        }
        
        sourceMarker = L.marker([lat, lng], {
            icon: createCustomIcon('source')
        }).addTo(selectionMap);
        
        document.getElementById('sourcePoint').textContent = 
            `Source: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    } else if (!selectedDest) {
        // Set destination
        selectedDest = { lat, lng };
        if (destMarker) {
            selectionMap.removeLayer(destMarker);
        }
        
        destMarker = L.marker([lat, lng], {
            icon: createCustomIcon('destination')
        }).addTo(selectionMap);
        
        document.getElementById('destPoint').textContent = 
            `Destination: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    } else {
        // Reset and set new source
        selectedSource = { lat, lng };
        selectedDest = null;
        
        if (sourceMarker) {
            selectionMap.removeLayer(sourceMarker);
        }
        if (destMarker) {
            selectionMap.removeLayer(destMarker);
        }
        
        sourceMarker = L.marker([lat, lng], {
            icon: createCustomIcon('source')
        }).addTo(selectionMap);
        
        document.getElementById('sourcePoint').textContent = 
            `Source: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
        document.getElementById('destPoint').textContent = 'Destination: Not selected';
    }
}

// Create custom map icons
function createCustomIcon(type) {
    const color = type === 'source' ? '#10b981' : '#ef4444';
    const label = type === 'source' ? 'S' : 'D';
    
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: ${color}; color: white; width: 30px; height: 30px; 
               border-radius: 50%; display: flex; align-items: center; justify-content: center; 
               font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${label}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

// Test API connection
async function testAPIConnection() {
    try {
        showAlert('Testing API connection...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/test`);
        const data = await response.json();
        
        if (response.ok) {
            showAlert('API connection successful! ' + data.message, 'success');
        } else {
            showAlert('API connection failed!', 'error');
        }
    } catch (error) {
        showAlert('Cannot connect to backend server. Make sure it is running on port 3000.', 'error');
        console.error('Connection error:', error);
    }
}

// Handle route planning
async function handlePlanRoute() {
    const inputMethod = document.querySelector('input[name="inputMethod"]:checked').value;
    let source, destination;

    try {
        // Get coordinates based on input method
        switch(inputMethod) {
            case 'map':
                if (!selectedSource || !selectedDest) {
                    showAlert('Please select both source and destination on the map', 'warning');
                    return;
                }
                source = selectedSource;
                destination = selectedDest;
                break;
                
            case 'location':
                const sourceLoc = document.getElementById('sourceLocation').value.trim();
                const destLoc = document.getElementById('destLocation').value.trim();
                
                if (!sourceLoc || !destLoc) {
                    showAlert('Please enter both source and destination locations', 'warning');
                    return;
                }
                
                showLoadingState(true);
                source = await geocodeLocation(sourceLoc);
                destination = await geocodeLocation(destLoc);
                break;
                
            case 'coordinates':
                source = {
                    lat: parseFloat(document.getElementById('sourceLat').value),
                    lng: parseFloat(document.getElementById('sourceLng').value)
                };
                destination = {
                    lat: parseFloat(document.getElementById('destLat').value),
                    lng: parseFloat(document.getElementById('destLng').value)
                };
                
                if (isNaN(source.lat) || isNaN(source.lng) || 
                    isNaN(destination.lat) || isNaN(destination.lng)) {
                    showAlert('Please enter valid coordinates', 'warning');
                    return;
                }
                break;
        }

        // Get vessel configuration
        const vesselConfig = {
            type: document.getElementById('vesselType').value,
            maxWaveHeight: parseFloat(document.getElementById('maxWaveHeight').value),
            maxWindSpeed: parseFloat(document.getElementById('maxWindSpeed').value)
        };

        console.log('Planning route with:', { source, destination, vesselConfig });

        // Show loading state
        showLoadingState(true);
        hideResultSections();
        hideErrorState();

        // Make API request
        const response = await fetch(`${API_BASE_URL}/marine-route`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source,
                destination,
                vesselConfig
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch route data');
        }
        
        // Hide loading state
        showLoadingState(false);
        
        // Display results
        displayRoute(data.route);
        displayWeatherForecast(data.weather, vesselConfig);
        displaySafetyAnalysis(data.analysis, vesselConfig);
        
        // Show result sections
        showResultSections();
        
        showAlert('Route planned successfully!', 'success');
        
    } catch (error) {
        console.error('Error:', error);
        showLoadingState(false);
        showErrorState(error.message);
        showAlert('Error: ' + error.message, 'error');
    }
}

// Geocode location names
async function geocodeLocation(location) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
        );
        const data = await response.json();
        
        if (data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                name: data[0].display_name
            };
        }
        throw new Error('Location not found');
    } catch (error) {
        showAlert(`Could not find location: ${location}`, 'error');
        throw error;
    }
}

// Display the marine route on map
function displayRoute(routeData) {
    try {
        // Clear existing route
        if (routePolyline) {
            routeMap.removeLayer(routePolyline);
        }
        
        // Clear all existing markers
        routeMap.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
                routeMap.removeLayer(layer);
            }
        });
        
        // Create route polyline
        const latlngs = routeData.waypoints.map(point => [point.lat, point.lng]);
        routePolyline = L.polyline(latlngs, {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8,
            smoothFactor: 1
        }).addTo(routeMap);
        
        // Add waypoint markers
        routeData.waypoints.forEach((point, index) => {
            const isSource = index === 0;
            const isDest = index === routeData.waypoints.length - 1;
            
            if (isSource || isDest) {
                L.marker([point.lat, point.lng], {
                    icon: createCustomIcon(isSource ? 'source' : 'destination')
                })
                .bindPopup(`<strong>${isSource ? 'Source' : 'Destination'}</strong><br>
                           ${point.name || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`}`)
                .addTo(routeMap);
            } else {
                L.circleMarker([point.lat, point.lng], {
                    radius: 4,
                    fillColor: '#3b82f6',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                })
                .bindPopup(`Waypoint ${index}<br>${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`)
                .addTo(routeMap);
            }
        });
        
        // Fit map to route bounds
        routeMap.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
        
        // Display route info
        const routeInfo = document.getElementById('routeInfo');
        if (routeInfo) {
            routeInfo.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Total Distance:</strong> ${routeData.totalDistance} nm
                    </div>
                    <div>
                        <strong>Waypoints:</strong> ${routeData.waypoints.length}
                    </div>
                    <div>
                        <strong>Estimated Duration:</strong> ${routeData.estimatedDuration}
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error displaying route:', error);
    }
}

// Display weather forecast
function displayWeatherForecast(weatherData, vesselConfig) {
    try {
        const weatherCards = document.getElementById('weatherCards');
        const weatherOverview = document.getElementById('weatherOverview');
        
        if (!weatherCards || !weatherOverview) return;
        
        // Clear existing content
        weatherCards.innerHTML = '';
        weatherOverview.innerHTML = '';
        
        // Create overview cards
        const overviewData = calculateWeatherOverview(weatherData);
        Object.entries(overviewData).forEach(([key, data]) => {
            const overviewCard = document.createElement('div');
            overviewCard.className = 'overview-card';
            overviewCard.innerHTML = `
                <div class="value">${data.value}</div>
                <div class="label">${data.label}</div>
            `;
            weatherOverview.appendChild(overviewCard);
        });
        
        // Create weather cards for each forecast point
        weatherData.forEach((forecast, index) => {
            const weatherCard = createWeatherCard(forecast, index, vesselConfig);
            weatherCards.appendChild(weatherCard);
        });
    } catch (error) {
        console.error('Error displaying weather forecast:', error);
    }
}

// Calculate weather overview statistics
function calculateWeatherOverview(weatherData) {
    const validData = weatherData.filter(w => !w.error);
    
    if (validData.length === 0) {
        return {
            avgTemp: { value: 'N/A', label: 'Avg Temperature' },
            maxWind: { value: 'N/A', label: 'Max Wind Speed' },
            maxWave: { value: 'N/A', label: 'Max Wave Height' },
            duration: { value: weatherData.length, label: 'Days Forecast' }
        };
    }
    
    const avgTemp = validData.reduce((sum, w) => sum + (w.temperature || 0), 0) / validData.length;
    const maxWind = Math.max(...validData.map(w => parseFloat(w.windSpeed || 0)));
    const maxWave = Math.max(...validData.map(w => parseFloat(w.waveHeight || 0)));
    
    return {
        avgTemp: {
            value: `${avgTemp.toFixed(1)}°C`,
            label: 'Avg Temperature'
        },
        maxWind: {
            value: `${maxWind} kn`,
            label: 'Max Wind Speed'
        },
        maxWave: {
            value: `${maxWave}m`,
            label: 'Max Wave Height'
        },
        duration: {
            value: `${weatherData.length}`,
            label: 'Days Forecast'
        }
    };
}

// Create individual weather card
function createWeatherCard(forecast, index, vesselConfig) {
    const warnings = checkWeatherWarnings(forecast, vesselConfig);
    const warningClass = warnings.length > 0 ? 
        (warnings.some(w => w.severity === 'danger') ? 'danger' : 'warning') : '';
    
    const card = document.createElement('div');
    card.className = `weather-card ${warningClass}`;
    
    if (forecast.error) {
        card.innerHTML = `
            <div class="weather-header">
                <h4>Day ${index + 1}</h4>
                <span class="weather-date">Data Unavailable</span>
            </div>
            <p style="text-align: center; color: #666; padding: 20px;">
                                Weather data could not be retrieved for this waypoint
            </p>
        `;
        return card;
    }
    
    const date = new Date(forecast.timestamp);
    const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    
    card.innerHTML = `
        <div class="weather-header">
            <h4>Day ${index + 1} - ${forecast.location || 'Waypoint ' + (index + 1)}</h4>
            <span class="weather-date">${formattedDate}</span>
        </div>
        <div class="weather-grid">
            <div class="weather-item">
                <span class="icon">🌡️</span>
                <span class="value">${forecast.temperature || 'N/A'}°C</span>
                <span class="label">Temperature</span>
            </div>
            <div class="weather-item">
                <span class="icon">💨</span>
                <span class="value">${forecast.windSpeed || 'N/A'} kn</span>
                <span class="label">Wind ${forecast.windDirection || ''}</span>
            </div>
            <div class="weather-item">
                <span class="icon">🌊</span>
                <span class="value">${forecast.waveHeight || 'N/A'}m</span>
                <span class="label">Wave Height</span>
            </div>
            <div class="weather-item">
                <span class="icon">👁️</span>
                <span class="value">${forecast.visibility || 'N/A'}km</span>
                <span class="label">Visibility</span>
            </div>
            <div class="weather-item">
                <span class="icon">🌧️</span>
                <span class="value">${forecast.precipitation || 0}mm</span>
                <span class="label">Precipitation</span>
            </div>
            <div class="weather-item">
                <span class="icon">📊</span>
                <span class="value">${forecast.pressure || 'N/A'}hPa</span>
                <span class="label">Pressure</span>
            </div>
        </div>
        <div style="margin-top: 10px; text-align: center; color: #666;">
            <span class="icon">☁️</span> ${forecast.description || 'No description available'}
        </div>
        ${warnings.length > 0 ? `
            <div class="weather-warnings">
                ${warnings.map(w => `
                    <div class="warning-item">
                        <span class="icon">${w.severity === 'danger' ? '⚠️' : '⚡'}</span>
                        ${w.message}
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
    
    return card;
}

// Check weather conditions against vessel limits
function checkWeatherWarnings(forecast, vesselConfig) {
    const warnings = [];
    
    if (forecast.error) return warnings;
    
    const waveHeight = parseFloat(forecast.waveHeight || 0);
    const windSpeed = parseFloat(forecast.windSpeed || 0);
    const visibility = parseFloat(forecast.visibility || 10);
    
    if (waveHeight > vesselConfig.maxWaveHeight) {
        warnings.push({
            severity: 'danger',
            message: `Wave height (${waveHeight}m) exceeds vessel limit (${vesselConfig.maxWaveHeight}m)`
        });
    }
    
    if (windSpeed > vesselConfig.maxWindSpeed) {
        warnings.push({
            severity: 'danger',
            message: `Wind speed (${windSpeed} knots) exceeds vessel limit (${vesselConfig.maxWindSpeed} knots)`
        });
    }
    
    if (visibility < 1) {
        warnings.push({
            severity: 'warning',
            message: `Poor visibility conditions (${visibility}km)`
        });
    }
    
    return warnings;
}

// Display safety analysis
function displaySafetyAnalysis(analysis, vesselConfig) {
    try {
        const safetySection = document.getElementById('safetyAnalysis');
        if (!safetySection) return;
        
        // Ensure we have valid analysis data
        const safetyScore = analysis?.safetyScore || 0;
        const recommendation = analysis?.recommendation || 'Unable to analyze';
        const issues = analysis?.issues || [];
        
        // Determine color based on safety score
        const scoreColor = safetyScore >= 80 ? '#10b981' : 
                          safetyScore >= 60 ? '#f59e0b' : '#ef4444';
        
        safetySection.innerHTML = `
            <div class="safety-score">
                <div class="score-circle" style="--score-color: ${scoreColor}; --score-deg: ${safetyScore * 3.6}deg;">
                    <div class="score-inner">
                        ${safetyScore}%
                    </div>
                </div>
                <div class="score-label">Overall Safety Score</div>
            </div>
            
            <div class="safety-recommendations">
                <h4>Recommendation: ${recommendation}</h4>
                ${issues.length > 0 ? `
                    <div style="margin-top: 15px;">
                        <h5>Issues Found:</h5>
                        ${issues.map(issue => `
                            <div class="recommendation-item">
                                <span class="icon">📍</span>
                                <span>Day ${issue.day}: ${issue.message}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p style="margin-top: 10px; color: #10b981;">No significant issues detected on this route.</p>'}
            </div>
            
            <div style="margin-top: 15px; padding: 15px; background: #f8fafc; border-radius: 8px;">
                <h4 style="margin-bottom: 10px;">Vessel Configuration</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>Vessel Type: ${vesselConfig.type}</div>
                    <div>Max Wave Height: ${vesselConfig.maxWaveHeight}m</div>
                    <div>Max Wind Speed: ${vesselConfig.maxWindSpeed} knots</div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error displaying safety analysis:', error);
    }
}

// UI State Management Functions
function showLoadingState(show) {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) {
        if (show) {
            loadingState.classList.add('active');
        } else {
            loadingState.classList.remove('active');
        }
    }
}

function showErrorState(message) {
    const errorState = document.getElementById('errorState');
    if (errorState) {
        const errorMessage = errorState.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        errorState.classList.add('active');
    }
}

function hideErrorState() {
    const errorState = document.getElementById('errorState');
    if (errorState) {
        errorState.classList.remove('active');
    }
}

function showResultSections() {
    const sections = ['routeSection', 'weatherSection', 'safetySection'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'block';
        }
    });
    
    // Invalidate route map size to ensure proper display
    setTimeout(() => {
        if (routeMap) {
            routeMap.invalidateSize();
        }
    }, 100);
}

function hideResultSections() {
    const sections = ['routeSection', 'weatherSection', 'safetySection'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'none';
        }
    });
}

// Show alert messages
function showAlert(message, type) {
    // Remove any existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    // Create new alert
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    // Style based on type
    const baseStyle = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    const colors = {
        success: { bg: '#10b981', text: 'white' },
        warning: { bg: '#f59e0b', text: 'white' },
        error: { bg: '#ef4444', text: 'white' },
        info: { bg: '#3b82f6', text: 'white' }
    };
    
    const colorStyle = colors[type] || colors.info;
    alert.style.cssText = `${baseStyle} background: ${colorStyle.bg}; color: ${colorStyle.text};`;
    
    document.body.appendChild(alert);
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (alert && alert.parentNode) {
            alert.remove();
        }
    }, 5000);
}

// Add CSS for animations if not already present
function addDynamicStyles() {
    if (!document.querySelector('#dynamic-styles')) {
        const style = document.createElement('style');
        style.id = 'dynamic-styles';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            .alert {
                transition: opacity 0.3s ease;
            }
            
            .custom-div-icon {
                background: none !important;
                border: none !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize dynamic styles
addDynamicStyles();

// Error handler for uncaught errors
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showAlert('An unexpected error occurred. Please check the console for details.', 'error');
});

// Log initialization
console.log('Marine Route Weather Forecasting System initialized');
console.log('API URL:', API_BASE_URL);
console.log('Ready to plan routes!');