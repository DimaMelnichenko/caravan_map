export default class Caravan extends Phaser.GameObjects.Container {
    constructor(scene, x, y, transportData, routeData) {
        super(scene, x, y);
        this.scene = scene;
        this.routeData = routeData;
        this.transportData = transportData;

        // Физические свойства груза
        this.capacity = transportData.capacity || 1;
        this.cargoItem = null;
        this.cargoAmount = 0;

        // Визуальные части (базовый спрайт и иконка)
        const texture = transportData.texture || 'caravan';
        this.baseSprite = scene.add.sprite(0, 0, texture);
        const baseScale = texture === 'ship' ? 0.05 : 0.1;
        this.baseSprite.setScale(baseScale);
        this.add(this.baseSprite);

        this.goodsIcon = scene.add.sprite(0, -20, ''); 
        this.goodsIcon.setScale(0.4);
        this.goodsIcon.setVisible(false);
        this.add(this.goodsIcon);

        scene.add.existing(this);
        this.setDepth(5);
        this.setupInteraction();

        // Создаем эффект следа (пыль для караванов, пена для кораблей)
        //this.createTrail(scene, type);
    }
    
    createTrail(scene, type) {
        // Создаем частицы. В Phaser 3.60+ синтаксис немного изменился
        const color = type === 'water' ? 0xffffff : 0x6b4e31;
        
        this.particles = scene.add.particles(0, 0, textureSafeKey(type), {
            scale: { start: 0.02, end: 0 },
            alpha: { start: 0.4, end: 0 },
            lifespan: 600,
            speed: 10,
            frequency: 150,
            blendMode: 'ADD',
            follow: this
        });
        
        this.particles.setDepth(4);

        function textureSafeKey(t) {
            return t === 'water' ? 'ship' : 'caravan'; // Или можно создать маленькую точку-текстуру
        }
    }

    // Метод для плавного удаления
    destroy() {
        if (this.particles) this.particles.destroy();
        super.destroy();
    }

    // Метод для загрузки товара в "ящик"
    loadCargo(item, amount) {
        this.cargoItem = item;
        this.cargoAmount = amount;

        if (item && amount > 0) {
            if (this.scene.textures.exists(item.icon)) {
                this.goodsIcon.setTexture(item.icon);
                this.goodsIcon.setVisible(true);
            }
        } else {
            this.goodsIcon.setVisible(false);
        }
    }

    // Метод для полной выгрузки
    unloadCargo() {
        const data = { item: this.cargoItem, amount: this.cargoAmount };
        this.cargoItem = null;
        this.cargoAmount = 0;
        this.goodsIcon.setVisible(false);
        return data;
    }

    setupInteraction() {
        const width = this.baseSprite.width * this.baseSprite.scaleX;
        const height = this.baseSprite.height * this.baseSprite.scaleY;
        this.setSize(width, height);
        this.setInteractive({ useHandCursor: true });

        this.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            
            // Находим города для отображения имен
            const startCity = this.scene.cities.find(c => Number(c.cityData.id) === Number(this.routeData.from_id));
            const endCity = this.scene.cities.find(c => Number(c.cityData.id) === Number(this.routeData.to_id));
            
            // Формируем объект информации
            const info = {
                // Берем название прямо из данных транспорта (из таблицы transport_types)
                title: this.transportData.name || "Транспорт", 
                from: startCity?.cityData.name || "Неизвестно",
                to: endCity?.cityData.name || "Неизвестно",
                // Показываем товар и количество, если они есть
                good: this.cargoItem ? `${this.cargoItem.name} (${Math.round(this.cargoAmount)} ед.)` : 'Пусто (ищет товар)'
            };
            
            this.scene.viewingType = 'caravan'; 
            this.scene.ui.showCaravanInfo(info);
        });
    }

    setRotationAndFlip(angle) {
        this.setAngle(angle);

        // Если едем влево, переворачиваем всё содержимое контейнера по вертикали
        if (angle > 90 || angle < -90) {
            this.baseSprite.setFlipY(true);
            this.goodsIcon.setFlipY(true);
            // Корректируем позицию иконки, чтобы она не оказалась под повозкой при перевороте
            this.goodsIcon.setY(20); 
        } else {
            this.baseSprite.setFlipY(false);
            this.goodsIcon.setFlipY(false);
            this.goodsIcon.setY(-20);
        }
    }
}