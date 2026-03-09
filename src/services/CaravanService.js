// src/services/CaravanService.js

export default class CaravanService {
    constructor() {
        this.baseUrl = window.location.origin;
        this.lastUpdateTime = Date.now();
    }

    /**
     * Получить все караваны с сервера
     */
    async getAllCaravans() {
        try {
            const response = await fetch(`${this.baseUrl}/api/caravans`);
            if (!response.ok) throw new Error('Ошибка получения караванов');
            return await response.json();
        } catch (err) {
            console.error("CaravanService.getAllCaravans:", err);
            return [];
        }
    }

    /**
     * Обновить позицию каравана и получить результат движения
     * @param {number} id - ID каравана
     * @param {number} deltaTime - Время в мс с последнего обновления
     */
    async updateCaravanPosition(id, deltaTime) {
        try {
            const response = await fetch(`${this.baseUrl}/api/caravans/${id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deltaTime })
            });
            if (!response.ok) throw new Error('Ошибка обновления каравана');
            const result = await response.json();
            console.log(`[Caravan ${id}] Обновлено: progress=${result.progress}`);
            return result;
        } catch (err) {
            console.error("CaravanService.updateCaravanPosition:", err);
            return null;
        }
    }

    /**
     * Инициализировать караваны для маршрута
     * @param {number} routeId - ID маршрута
     */
    async initCaravans(routeId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/routes/${routeId}/init-caravans`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Ошибка инициализации караванов');
            return await response.json();
        } catch (err) {
            console.error("CaravanService.initCaravans:", err);
            return null;
        }
    }

    /**
     * Удалить все караваны маршрута
     * @param {number} routeId - ID маршрута
     */
    async deleteRouteCaravans(routeId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/routes/${routeId}/caravans`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Ошибка удаления караванов');
            return await response.json();
        } catch (err) {
            console.error("CaravanService.deleteRouteCaravans:", err);
            return null;
        }
    }

    /**
     * Получить время, прошедшее с последнего обновления
     */
    getDeltaTime() {
        const now = Date.now();
        const deltaTime = now - this.lastUpdateTime;
        this.lastUpdateTime = now;
        return deltaTime;
    }

    /**
     * Сбросить таймер
     */
    resetTimer() {
        this.lastUpdateTime = Date.now();
    }
}
