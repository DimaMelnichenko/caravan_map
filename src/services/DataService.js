// src/services/DataService.js

export default class DataService {
    constructor() {
        this.baseUrl = window.location.origin;
    }

    /**
     * Загружает все данные мира при старте
     */
    async loadWorld() {
        try {
            const response = await fetch(`${this.baseUrl}/api/load`);
            if (!response.ok) throw new Error('Ошибка загрузки данных');
            return await response.json();
        } catch (err) {
            console.error("DataService.loadWorld:", err);
            throw err;
        }
    }

    // Универсальный метод для POST запросов
    async post(endpoint, data) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.ok;
    }

    // Универсальный метод для DELETE запросов
    async delete(endpoint) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'DELETE'
        });
        return response.ok;
    }

    async saveCityEconomy(cityId, economyArray) {
        return this.post('/api/city-economy', {
            city_id: cityId,
            economy: economyArray
        });
    }

    async saveAllInventory(inventory) {
        return this.post('/api/save-inventory', { inventory });
    }

    async saveBorder(borderData) {
        // Преобразуем точки в строку JSON перед отправкой, если они еще не строка
        const payload = {
            ...borderData,
            points: typeof borderData.points === 'string' ? borderData.points : JSON.stringify(borderData.points)
        };
        return this.post('/api/borders', payload);
    }

    async deleteBorder(id) {
        return this.delete(`/api/borders/${id}`);
    }

    // Специфические методы
    saveCity(city) { return this.post('/api/cities', city); }
    deleteCity(id) { return this.delete(`/api/cities/${id}`); }
    
    saveRoute(route) { return this.post('/api/routes', route); }
    deleteRoute(id) { return this.delete(`/api/routes/${id}`); }
    
    saveCountry(country) { return this.post('/api/countries', country); }
}