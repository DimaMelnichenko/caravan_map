export default class Caravan extends Phaser.GameObjects.Sprite {
    constructor(scene, x, y, type, routeData) {
        // Выбираем текстуру в зависимости от типа
        const texture = type === 'water' ? 'ship' : 'caravan';
        super(scene, x, y, texture);
        
        this.routeData = routeData;
        this.type = type;

        // Добавляем объект на сцену
        scene.add.existing(this);
        
        // Настраиваем внешний вид
        this.setScale(type === 'water' ? 0.05 : 0.1);
        this.setDepth(5);

        // Создаем эффект следа (пыль для караванов, пена для кораблей)
        this.createTrail(scene, type);
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
}