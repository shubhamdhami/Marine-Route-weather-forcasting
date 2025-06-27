const axios = require('axios');
const NodeCache = require('node-cache');

// Cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

class WeatherService {
    constructor() {
        this.apiKey = process.env.OPENWEATHER_API_KEY;
        if (!this.apiKey) {
            console.error('WARNING: OPENWEATHER_API_KEY not found in environment variables!');
        }
        this.baseUrl = 'https://api.openweathermap.org/data/2.5';
    }

    async getWeatherForecast(lat, lng) {
        const cacheKey = `weather_${lat}_${lng}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            console.log('Returning cached data for:', cacheKey);
            return cachedData;
        }

        try {
            console.log(`Fetching weather for coordinates: ${lat}, ${lng}`);
            
            // Try current weather + forecast (free tier)
            const currentWeatherPromise = this.getCurrentWeather(lat, lng);
            const forecastPromise = this.getForecast(lat, lng);
            
            const [currentWeather, forecast] = await Promise.all([
                currentWeatherPromise,
                forecastPromise
            ]);

            // Format data to match expected structure
            const formattedData = this.formatWeatherData(currentWeather, forecast, lat, lng);
            
            cache.set(cacheKey, formattedData);
            return formattedData;
        } catch (error) {
            console.error('Error fetching weather data:', error.response?.data || error.message);
            console.log('Returning mock data due to API error');
            return this.getMockWeatherData(lat, lng);
        }
    }

    async getCurrentWeather(lat, lng) {
        try {
            const response = await axios.get(`${this.baseUrl}/weather`, {
                params: {
                    lat: lat,
                    lon: lng,
                    appid: this.apiKey,
                    units: 'metric'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching current weather:', error.response?.data || error.message);
            throw error;
        }
    }

    async getForecast(lat, lng) {
        try {
            const response = await axios.get(`${this.baseUrl}/forecast`, {
                params: {
                    lat: lat,
                    lon: lng,
                    appid: this.apiKey,
                    units: 'metric',
                    cnt: 40 // 5 days, 8 forecasts per day
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching forecast:', error.response?.data || error.message);
            throw error;
        }
    }

    formatWeatherData(current, forecast, lat, lng) {
        // Convert 5-day forecast to daily format
        const dailyData = {};
        
        // Group forecast data by day
        forecast.list.forEach(item => {
            const date = new Date(item.dt * 1000);
            const dayKey = date.toDateString();
            
            if (!dailyData[dayKey]) {
                dailyData[dayKey] = {
                    temps: [],
                    wind_speeds: [],
                    wind_gusts: [],
                    wind_degs: [],
                    weather: [],
                    rain: 0,
                    humidity: [],
                    pressure: [],
                    visibility: []
                };
            }
            
            dailyData[dayKey].temps.push(item.main.temp);
            dailyData[dayKey].wind_speeds.push(item.wind.speed);
            dailyData[dayKey].wind_gusts.push(item.wind.gust || item.wind.speed);
            dailyData[dayKey].wind_degs.push(item.wind.deg);
            dailyData[dayKey].weather.push(item.weather[0]);
            dailyData[dayKey].rain += (item.rain?.['3h'] || 0);
            dailyData[dayKey].humidity.push(item.main.humidity);
            dailyData[dayKey].pressure.push(item.main.pressure);
            dailyData[dayKey].visibility.push(item.visibility || 10000);
        });

        // Convert to daily array
        const daily = Object.keys(dailyData).slice(0, 10).map((dayKey, index) => {
            const day = dailyData[dayKey];
            const avgTemp = day.temps.reduce((a, b) => a + b, 0) / day.temps.length;
            const maxTemp = Math.max(...day.temps);
            const minTemp = Math.min(...day.temps);
            const avgWindSpeed = day.wind_speeds.reduce((a, b) => a + b, 0) / day.wind_speeds.length;
            const maxWindGust = Math.max(...day.wind_gusts);
            const avgWindDeg = day.wind_degs.reduce((a, b) => a + b, 0) / day.wind_degs.length;
            
            // Get most common weather
            const weatherCounts = {};
            day.weather.forEach(w => {
                weatherCounts[w.main] = (weatherCounts[w.main] || 0) + 1;
            });
            const mainWeather = Object.keys(weatherCounts).reduce((a, b) => 
                weatherCounts[a] > weatherCounts[b] ? a : b
            );

            return {
                dt: Date.now() / 1000 + (index * 86400),
                temp: {
                    day: avgTemp,
                    min: minTemp,
                    max: maxTemp,
                    night: minTemp + 2
                },
                pressure: day.pressure.reduce((a, b) => a + b, 0) / day.pressure.length,
                humidity: day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length,
                wind_speed: avgWindSpeed,
                wind_deg: avgWindDeg,
                wind_gust: maxWindGust,
                weather: [{
                    main: mainWeather,
                    description: day.weather[0].description,
                    icon: day.weather[0].icon
                }],
                rain: day.rain,
                visibility: day.visibility.reduce((a, b) => a + b, 0) / day.visibility.length
            };
        });

        // Add more days with mock data if needed
        while (daily.length < 10) {
            const lastDay = daily[daily.length - 1] || this.generateMockDay(daily.length);
            daily.push({
                ...lastDay,
                dt: lastDay.dt + 86400,
                temp: {
                    day: 20 + Math.random() * 10,
                    min: 15 + Math.random() * 5,
                    max: 25 + Math.random() * 5,
                    night: 18 + Math.random() * 5
                },
                wind_speed: 5 + Math.random() * 15,
                rain: Math.random() * 5
            });
        }

        return {
            lat: lat,
            lon: lng,
            timezone: 'UTC',
            timezone_offset: 0,
            current: {
                dt: current.dt,
                temp: current.main.temp,
                feels_like: current.main.feels_like,
                pressure: current.main.pressure,
                humidity: current.main.humidity,
                clouds: current.clouds.all,
                visibility: current.visibility,
                wind_speed: current.wind.speed,
                wind_deg: current.wind.deg,
                wind_gust: current.wind.gust || current.wind.speed,
                weather: current.weather
            },
            daily: daily
        };
    }

    generateMockDay(index) {
        return {
            dt: Date.now() / 1000 + (index * 86400),
            temp: {
                day: 20 + Math.random() * 10,
                min: 15 + Math.random() * 5,
                max: 25 + Math.random() * 5,
                night: 18 + Math.random() * 5
            },
            pressure: 1010 + Math.random() * 20,
            humidity: 60 + Math.random() * 30,
            wind_speed: 5 + Math.random() * 20,
            wind_deg: Math.random() * 360,
            wind_gust: 10 + Math.random() * 25,
            weather: [{
                main: ['Clear', 'Clouds', 'Rain'][Math.floor(Math.random() * 3)],
                description: 'scattered clouds',
                icon: '02d'
            }],
            rain: Math.random() * 10,
            visibility: 8000 + Math.random() * 2000
        };
    }

    getMockWeatherData(lat, lng) {
        const days = [];
        const weatherConditions = ['Clear', 'Clouds', 'Rain', 'Storm', 'Thunderstorm'];
        
        for (let i = 0; i < 10; i++) {
            // Generate more realistic patterns
            const baseWindSpeed = 5 + Math.random() * 15;
            const isStormy = Math.random() < 0.2; // 20% chance of storm
            
            days.push({
                dt: Date.now() / 1000 + (i * 86400),
                temp: {
                    day: 20 + Math.random() * 10,
                    min: 15 + Math.random() * 5,
                    max: 25 + Math.random() * 5,
                    night: 18 + Math.random() * 5
                },
                feels_like: {
                    day: 22 + Math.random() * 8
                },
                pressure: 1010 + Math.random() * 20,
                humidity: 60 + Math.random() * 30,
                dew_point: 15 + Math.random() * 5,
                wind_speed: isStormy ? 25 + Math.random() * 30 : baseWindSpeed,
                wind_deg: Math.random() * 360,
                wind_gust: isStormy ? 35 + Math.random() * 40 : baseWindSpeed + 5 + Math.random() * 10,
                weather: [{
                    id: 800,
                    main: isStormy ? weatherConditions[3 + Math.floor(Math.random() * 2)] : weatherConditions[Math.floor(Math.random() * 3)],
                    description: isStormy ? 'thunderstorm with heavy rain' : 'scattered clouds',
                    icon: '02d'
                }],
                clouds: Math.random() * 100,
                pop: isStormy ? 0.8 + Math.random() * 0.2 : Math.random() * 0.5,
                rain: isStormy ? 20 + Math.random() * 30 : Math.random() * 10,
                uvi: Math.random() * 10,
                visibility: isStormy ? 2000 + Math.random() * 3000 : 8000 + Math.random() * 2000
            });
        }

        return {
            lat: lat,
            lon: lng,
            timezone: 'UTC',
            timezone_offset: 0,
            current: {
                dt: Date.now() / 1000,
                temp: 22,
                feels_like: 24,
                pressure: 1013,
                humidity: 70,
                dew_point: 16,
                uvi: 5,
                clouds: 40,
                visibility: 10000,
                wind_speed: 10,
                wind_deg: 180,
                wind_gust: 15,
                weather: [{
                    id: 802,
                    main: 'Clouds',
                    description: 'scattered clouds',
                    icon: '03d'
                }]
            },
            daily: days
        };
    }

    async getStormAlerts(lat, lng) {
        const weather = await this.getWeatherForecast(lat, lng);
        const alerts = [];

        weather.daily.forEach((day, index) => {
            const windSpeedKnots = (day.wind_speed || 0) * 1.94384;
            if (windSpeedKnots > 34 || 
                day.weather[0].main === 'Storm' || 
                day.weather[0].main === 'Thunderstorm') {
                alerts.push({
                    day: index,
                    type: 'storm',
                    severity: windSpeedKnots > 64 ? 'extreme' : 
                             windSpeedKnots > 48 ? 'severe' : 'moderate',
                    message: `High winds expected: ${Math.round(windSpeedKnots)} knots`,
                    conditions: day.weather[0].main,
                    windSpeed: windSpeedKnots,
                    description: day.weather[0].description
                });
            }
        });

        return alerts;
    }

    async getHistoricalWeather(lat, lng, date) {
        // Mock implementation - historical data requires paid subscription
        return {
            date: date,
            location: { lat, lng },
            weather: this.generateMockHistoricalData()
        };
    }

    generateMockHistoricalData() {
        const days = [];
        for (let i = 0; i < 30; i++) {
            days.push({
                date: new Date(Date.now() - (i * 86400000)).toISOString(),
                windSpeed: 5 + Math.random() * 25,
                waveHeight: 1 + Math.random() * 4,
                swellHeight: 0.5 + Math.random() * 2,
                currentSpeed: 0.5 + Math.random() * 2,
                weather: ['Clear', 'Clouds', 'Rain'][Math.floor(Math.random() * 3)],
                temp: 18 + Math.random() * 10
            });
        }
        return days;
    }
}

module.exports = new WeatherService();