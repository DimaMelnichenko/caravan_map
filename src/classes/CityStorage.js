// src/classes/Storage.js

export default class CityStorage {
    constructor(scene, cityId, maxCapacity = 1000) {
        this.scene = scene;
        this.cityId = Number(cityId);
        this.maxCapacity = maxCapacity;
        
        // Ссылка на часть глобального инвентаря для удобства
        this.inventory = this.scene.routesData.cityInventory;
    }

    // Получить количество конкретного товара
    getAmount(itemId) {
        const record = this.inventory.find(i => 
            Number(i.city_id) === this.cityId && Number(i.item_id) === Number(itemId)
        );
        return record ? record.amount : 0;
    }

    // Общий объем всех товаров на складе
    getTotalVolume() {
        return this.inventory
            .filter(i => Number(i.city_id) === this.cityId)
            .reduce((sum, i) => sum + i.amount, 0);
    }

    // Добавить товар (с проверкой лимита)
    addItems(itemId, amount) {
        const spaceLeft = this.maxCapacity - this.getTotalVolume();
        const actualToAdd = Math.min(amount, spaceLeft);

        if (actualToAdd <= 0) return 0;

        let record = this.inventory.find(i => 
            Number(i.city_id) === this.cityId && Number(i.item_id) === Number(itemId)
        );

        if (!record) {
            record = { city_id: this.cityId, item_id: Number(itemId), amount: 0 };
            this.inventory.push(record);
        }

        record.amount += actualToAdd;
        return actualToAdd; // Возвращаем сколько реально удалось положить
    }

    // Забрать товар
    takeItems(itemId, amount) {
        const record = this.inventory.find(i => 
            Number(i.city_id) === this.cityId && Number(i.item_id) === Number(itemId)
        );

        if (!record || record.amount <= 0) return 0;

        const actualToTake = Math.min(amount, record.amount);
        record.amount -= actualToTake;
        return actualToTake; // Возвращаем сколько реально взяли
    }

    // Метод для экономики (производство/потребление)
    processCycle(rules) {
        rules.forEach(rule => {
            const itemId = Number(rule.item_id);
            const amount = parseFloat(rule.amount);
            if (rule.type === 'production') {
                const currentAmount = this.getAmount(itemId);
                if (currentAmount <= 200) { 
                    this.addItems(itemId, amount);
                }
            } else if (rule.type === 'consumption') {
                this.takeItems(itemId, amount);
            }
        });
    }

    getSaveData() {
        // Мы фильтруем глобальный инвентарь, чтобы получить актуальные цифры именно этого города
        return this.inventory
            .filter(i => Number(i.city_id) === this.cityId)
            .map(i => ({
                city_id: i.city_id,
                item_id: i.item_id,
                amount: i.amount
            }));
    }
}