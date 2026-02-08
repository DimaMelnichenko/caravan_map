export default class Caravan extends Phaser.GameObjects.Container {
    constructor(scene, x, y, type, routeData) {
        super(scene, x, y);

        this.scene = scene;
        this.routeData = routeData;
        this.type = type;

        // 1. Создаем основной спрайт (повозка или корабль)
        const texture = type === 'water' ? 'ship' : 'caravan';
        this.baseSprite = scene.add.sprite(0, 0, texture);
        this.baseSprite.setScale(type === 'water' ? 0.05 : 0.1);
        
        // Добавляем в контейнер
        this.add(this.baseSprite);

        // 2. Создаем спрайт для иконки товара (поверх повозки)
        // Смещаем чуть выше (y: -20)
        this.goodsIcon = scene.add.sprite(0, -20, ''); 
        this.goodsIcon.setScale(0.4); // Иконка поменьше
        this.goodsIcon.setVisible(false); // По умолчанию скрыта
        this.add(this.goodsIcon);

        // 3. Настраиваем логику выбора товара
        this.pickRandomGoods();

        // Добавляем контейнер на сцену
        scene.add.existing(this);
        this.setDepth(5);

        // Сделаем караван кликабельным
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

    pickRandomGoods() {
        // Ищем город отправления, чтобы узнать, какие там есть товары
        const startCity = this.scene.cities.find(c => c.cityData.id === this.routeData.from_id);
        
        if (startCity && startCity.cityData.goods && startCity.cityData.goods.length > 0) {
            // Фильтруем пустые строки, если они есть
            const validGoods = startCity.cityData.goods.filter(g => g.trim() !== "");
            
            if (validGoods.length > 0) {
                this.currentGood = validGoods[Math.floor(Math.random() * validGoods.length)];
                
                // Проверяем, загружена ли иконка с именем 'icon_Товар'
                const iconKey = 'icon_' + this.currentGood;
                if (this.scene.textures.exists(iconKey)) {
                    this.goodsIcon.setTexture(iconKey);
                    this.goodsIcon.setVisible(true);
                }
            }
        }
    }

    // Метод для плавного удаления
    destroy() {
        if (this.particles) this.particles.destroy();
        super.destroy();
    }

    setupInteraction() {
        // Устанавливаем размер зоны клика по размеру базового спрайта
        const width = this.baseSprite.width * this.baseSprite.scaleX;
        const height = this.baseSprite.height * this.baseSprite.scaleY;
        this.setSize(width, height);
        this.setInteractive({ useHandCursor: true });

        this.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            
            // Показываем инфо о караване в UI
            const startCity = this.scene.cities.find(c => c.cityData.id === this.routeData.from_id);
            const endCity = this.scene.cities.find(c => c.cityData.id === this.routeData.to_id);
            
            const info = {
                title: this.type === 'water' ? 'Торговое судно' : 'Торговый караван',
                from: startCity?.cityData.name,
                to: endCity?.cityData.name,
                good: this.currentGood || 'Провизия'
            };
            
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