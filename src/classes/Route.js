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

        // Находим данные о транспорте
        const transport = this.scene.routesData.transportTypes.find(t => 
            Number(t.id) === Number(this.routeData.transport_id)
        ) || this.scene.routesData.transportTypes[0];

        // Скорость = (Базовая скорость транспорта) * (Коэффициент дороги)
        const finalSpeed = transport.speed * (this.routeData.speedCoeff || 1.0);
        const travelTimeMs = (this.curve.getLength() / finalSpeed) * 1000;
        
        const unitCount = this.routeData.unitCount || 1;
        const spacing = 1 / unitCount;

        for (let i = 0; i < unitCount; i++) {
            // Передаем данные транспорта в конструктор
            const caravanSprite = new Caravan(this.scene, 0, 0, transport, this.routeData);

            const follower = { t: 0, vec: new Phaser.Math.Vector2() };
            
            const tween = this.scene.tweens.add({
                targets: follower,
                t: 1,
                duration: travelTimeMs / window.gameSpeed,
                repeat: -1,
                delay: i * (spacing * (travelTimeMs / window.gameSpeed)),
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
        const fromCity = this.scene.cities.find(c => Number(c.cityData.id) === Number(this.routeData.from_id));
        const toCity = this.scene.cities.find(c => Number(c.cityData.id) === Number(this.routeData.to_id));

        if (!fromCity || !toCity) return;

        // --- 1. РАЗГРУЗКА ---
        if (caravan.cargoAmount > 0) {
            const cargo = caravan.unloadCargo(); // Забираем всё из ящика
            const accepted = toCity.storage.addItems(cargo.item.id, cargo.amount);
            
            /*if (accepted > 0) {
                console.log(`📦 ${toCity.cityData.name} принял ${accepted} ед. ${cargo.item.name}`);
            }*/
            // Если склад был полон, остаток товара просто "исчезает" или можно вернуть в караван
        }

        // ПОГРУЗКА
        const selectedItem = this.getBestCargoItem(fromCity, toCity);
        if (selectedItem) {
            // ТЕПЕРЬ БЕРЕМ СТОЛЬКО, СКОЛЬКО ВМЕЩАЕТ ТРАНСПОРТ
            const amountToTake = caravan.capacity; 
            const taken = fromCity.storage.takeItems(selectedItem.id, amountToTake);

            if (taken > 0) {
                caravan.loadCargo(selectedItem, taken);
            }
        }

        // Обновление UI...
        this.refreshCityUI(fromCity, toCity);
    }

    refreshCityUI(cityA, cityB) {
        if (this.scene.selectedCity && this.scene.viewingType === 'city') {
            const selId = Number(this.scene.selectedCity.cityData.id);
            if (selId === cityA.cityData.id || selId === cityB.cityData.id) {
                this.scene.ui.updateCityInfo(this.scene.selectedCity.cityData, this.scene.routes);
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

    getBestCargoItem(fromCity, toCity) {
        const items = this.scene.routesData.items;
        const economy = this.scene.routesData.cityEconomy;

        // 1. Сначала смотрим, что вообще есть на складе отправителя (минимум 10 ед, чтобы не гонять пустые караваны)
        const availableInSource = items.filter(item => fromCity.storage.getAmount(item.id) >= 50);
        
        if (availableInSource.length === 0) return null;

        // --- ЛОГИКА ПРИОРИТЕТОВ ---

        // 2. ПРИОРИТЕТ 1: Товары, в которых целевой город НУЖДАЕТСЯ (Demand)
        // Ищем правила потребления для целевого города
        const targetDemands = economy.filter(e => 
            Number(e.city_id) === Number(toCity.cityData.id) && e.type === 'consumption'
        );

        const neededItems = availableInSource.filter(item => {
            // Проверяем, есть ли этот товар в списке потребления цели
            const isRequired = targetDemands.some(d => Number(d.item_id) === Number(item.id));
            if (!isRequired) return false;

            // Проверяем лимит: везем только если на целевом складе меньше 150 ед.
            const amountAtTarget = toCity.storage.getAmount(item.id);
            return amountAtTarget < 150;
        });

        if (neededItems.length > 0) {
            // Если нашли нужные товары, выбираем случайный из них
            return neededItems[Math.floor(Math.random() * neededItems.length)];
        }

        // 3. ПРИОРИТЕТ 2: Транзит или Экспорт (город не нуждается прямо сейчас)
        // Везем только если на складе целевого города этого товара меньше 70 ед.
        const transitItems = availableInSource.filter(item => {
            const amountAtTarget = toCity.storage.getAmount(item.id);
            return amountAtTarget < 70;
        });

        if (transitItems.length > 0) {
            // Выбираем случайный товар для транзита/экспорта
            return transitItems[Math.floor(Math.random() * transitItems.length)];
        }

        // 4. ИНАЧЕ: Ни одно условие не выполнено (склады цели заполнены до лимитов)
        // Возвращаем null, караван поедет пустым
        return null;
    }
}