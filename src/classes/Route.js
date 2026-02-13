// src/classes/Route.js
import Caravan from './Caravan.js';

export default class Route {
    constructor(scene, routeData) {
        this.scene = scene;
        this.routeData = routeData;
        this.curve = null;
        this.caravans = []; // Массив объектов {sprite, tween}

        this.updateCurve();
    }

    /**
     * Создает или обновляет математическую кривую пути
     */
    updateCurve() {
        // Ищем объекты городов по ID в данных маршрута
        const startCity = this.scene.cities.find(c => c.cityData.id === this.routeData.from_id);
        const endCity = this.scene.cities.find(c => c.cityData.id === this.routeData.to_id);

        if (!startCity || !endCity) {
            console.warn(`Города для маршрута ${this.routeData.id} не найдены`);
            return;
        }

        // Собираем все точки: Старт -> Промежуточные -> Конец
        const allPoints = [new Phaser.Math.Vector2(startCity.x, startCity.y)];
        if (this.routeData.points) {
            this.routeData.points.forEach(p => allPoints.push(new Phaser.Math.Vector2(p[0], p[1])));
        }
        allPoints.push(new Phaser.Math.Vector2(endCity.x, endCity.y));

        // Создаем сплайн (кривую)
        this.curve = new Phaser.Curves.Spline(allPoints);
    }

    /**
     * Отрисовка линии маршрута
     * @param {Phaser.GameObjects.Graphics} graphics - Слой для рисования
     * @param {boolean} isSelected - Выбран ли этот путь сейчас
     */
    draw(graphics, isSelected) {
        if (!this.curve) return;

        const color = (this.routeData.type === 'water' ? 0xaaaaff : 0x6b4e31);
        const alpha = isSelected ? 1.0 : 0.4;
        const width = isSelected ? 4 : 2;

        graphics.lineStyle(width, isSelected ? 0x00ff00 : color, alpha);

        if (this.routeData.type === 'water') {
            // Рисуем пунктир для морских путей
            const pathLength = this.curve.getLength();
            const segmentLength = 12;
            const divisions = Math.max(1, Math.floor(pathLength / segmentLength));
            const points = this.curve.getSpacedPoints(divisions);

            for (let i = 0; i < points.length - 1; i += 2) {
                graphics.lineBetween(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
            }
        } else {
            // Рисуем сплошную линию для трактов
            this.curve.draw(graphics);
        }
    }

    /**
     * Очистка и создание караванов на этом маршруте
     */
    spawnCaravans() {
        this.clearCaravans();

        if (!this.curve) return;

        const speedCoeff = this.routeData.speedCoeff || 1.0;
        const unitCount = this.routeData.unitCount !== undefined ? this.routeData.unitCount : (this.routeData.type === 'water' ? 1 : 3);
        const baseSpeed = this.scene.baseSpeeds[this.routeData.type] || 50;
        
        // Расчет времени в пути
        const finalSpeed = baseSpeed * speedCoeff;
        const pathLength = this.curve.getLength();
        const travelTimeMs = (pathLength / finalSpeed) * 1000;

        this.routeData.calculatedDuration = Math.round(travelTimeMs / 1000);

        const spacing = 1 / unitCount;

        for (let i = 0; i < unitCount; i++) {
            const caravanSprite = new Caravan(this.scene, 0, 0, this.routeData.type, this.routeData);
            const follower = { t: 0, vec: new Phaser.Math.Vector2() };

            const tween = this.scene.tweens.add({
                targets: follower,
                t: 1,
                ease: 'Linear',
                duration: travelTimeMs / (window.gameSpeed || 1),
                repeat: -1,
                delay: i * (spacing * (travelTimeMs / (window.gameSpeed || 1))),
                // СРАБАТЫВАЕТ ПРИ КАЖДОМ ЗАПУСКЕ (ПЕРВАЯ ЗАГРУЗКА)
                onStart: () => {
                    this.transferGoods(caravanSprite);
                },
                // СРАБАТЫВАЕТ, КОГДА КАРАВАН ЗАКОНЧИЛ ПУТЬ И НАЧИНАЕТ СНАЧАЛА
                onRepeat: () => {
                    // Каждый следующий круг — разгружаем то, что привезли, и грузим новое
                    this.transferGoods(caravanSprite);
                },
                onUpdate: () => {
                    this.curve.getPointAt(follower.t, follower.vec);
                    caravanSprite.setPosition(follower.vec.x, follower.vec.y);

                    const tangent = this.curve.getTangentAt(follower.t);
                    const angle = Phaser.Math.RadToDeg(Math.atan2(tangent.y, tangent.x));
                    caravanSprite.setRotationAndFlip(angle);
                }
            });

            this.caravans.push({ sprite: caravanSprite, tween: tween });
        }
    }

    transferGoods(caravan) {
        if (!this.scene.routesData) return;
        
        const inv = this.scene.routesData.cityInventory;
        const items = this.scene.routesData.items;

        // Приводим ID к числам, чтобы избежать ошибок "1" !== 1
        const toCityId = Number(this.routeData.to_id);
        const fromCityId = Number(this.routeData.from_id);

        // --- 1. РАЗГРУЗКА ---
        if (caravan.cargoItem && caravan.cargoAmount > 0) {
            const itemId = Number(caravan.cargoItem.id);
            
            let destInv = inv.find(i => Number(i.city_id) === toCityId && Number(i.item_id) === itemId);
            
            if (!destInv) {
                destInv = { city_id: toCityId, item_id: itemId, amount: 0 };
                inv.push(destInv);
            }
            
            destInv.amount += caravan.cargoAmount;
            
            console.log(`📦 [ДОСТАВКА] Город ${toCityId} получил ${caravan.cargoAmount} ед. ${caravan.cargoItem.name}`);
            
            // Очищаем данные каравана
            caravan.cargoAmount = 0;
            caravan.cargoItem = null;
            caravan.updateCargoVisual(false);

            // ОБНОВЛЯЕМ UI СРАЗУ, чтобы увидеть результат
            if (this.scene.selectedCity && 
                this.scene.viewingType === 'city' && 
                Number(this.scene.selectedCity.cityData.id) === toCityId) {
                this.scene.ui.updateCityInfo(this.scene.selectedCity.cityData, this.scene.routes);
            }
        }

        // --- 2. ПОГРУЗКА ---
        caravan.pickRandomGoods(); 
        
        if (caravan.selectedItemID) {
            // Ищем товар на складе города отправления
            let sourceInv = inv.find(i => 
                Number(i.city_id) === Number(this.routeData.from_id) && 
                Number(i.item_id) === Number(caravan.selectedItemID)
            );
            
            const amountToTake = 10; // Сколько единиц берет один караван

            if (sourceInv && sourceInv.amount >= amountToTake) {
                // ФИЗИЧЕСКИ ЗАБИРАЕМ СО СКЛАДА
                sourceInv.amount -= amountToTake;
                
                // ЗАПИСЫВАЕМ В КАРАВАН (чтобы он мог это выгрузить потом)
                caravan.cargoAmount = amountToTake;
                caravan.cargoItem = this.scene.routesData.items.find(it => Number(it.id) === Number(caravan.selectedItemID));
                
                caravan.updateCargoVisual(true);
                console.log(`🛒 Город ${this.routeData.from_id} отгрузил ${amountToTake} ед. ${caravan.cargoItem.name}`);

                if (this.scene.selectedCity && 
                    this.scene.viewingType === 'city' && 
                    Number(this.scene.selectedCity.cityData.id) === fromCityId) {
                    this.scene.ui.updateCityInfo(this.scene.selectedCity.cityData, this.scene.routes);
                }
            } else {
                // На складе нет нужного количества
                caravan.cargoAmount = 0;
                caravan.cargoItem = null;
                caravan.updateCargoVisual(false);
            }
        }
    }

    clearCaravans() {
        this.caravans.forEach(c => {
            if (c.tween) c.tween.remove();
            if (c.sprite) c.sprite.destroy();
        });
        this.caravans = [];
    }

    destroy() {
        this.clearCaravans();
    }
}