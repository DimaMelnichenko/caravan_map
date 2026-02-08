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

    /**
     * Сохраняет всё состояние мира (текущий метод)
     */
    async saveWorld(allData) {
        try {
            const response = await fetch(`${this.baseUrl}/api/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(allData)
            });
            return response.ok;
        } catch (err) {
            console.error("DataService.saveWorld:", err);
            return false;
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

    // Специфические методы
    saveCity(city) { return this.post('/api/cities', city); }
    deleteCity(id) { return this.delete(`/api/cities/${id}`); }
    
    saveRoute(route) { return this.post('/api/routes', route); }
    deleteRoute(id) { return this.delete(`/api/routes/${id}`); }
    
    saveCountry(country) { return this.post('/api/countries', country); }
}