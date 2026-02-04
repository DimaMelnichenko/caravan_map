export default class Caravan extends Phaser.GameObjects.Sprite {
    constructor(scene, x, y, route) {
        super(scene, x, y, 'caravan');
        
        this.route = route;
        this.speed = 1.0;
        this.goods = [];
        this.state = 'moving'; // moving, loading, unloading, waiting
        
        // Добавляем в сцену
        scene.add.existing(this);
        scene.physics.add.existing(this);
        
        // Анимация движения
        this.createAnimations();
        
        // Трейл эффект
        this.createTrail();
    }
    
    createAnimations() {
        this.scene.anims.create({
            key: 'caravan_move',
            frames: this.scene.anims.generateFrameNumbers('caravan', { start: 0, end: 3 }),
            frameRate: 8,
            repeat: -1
        });
        
        this.play('caravan_move');
    }
    
    createTrail() {
        this.trail = this.scene.add.particles('caravan');
        
        const emitter = this.trail.createEmitter({
            speed: 20,
            scale: { start: 0.3, end: 0 },
            blendMode: 'ADD',
            lifespan: 1000,
            frequency: 100
        });
        
        emitter.startFollow(this);
    }
    
    update() {
        // Обновление состояния каравана
        if (this.state === 'moving') {
            // Логика движения
        }
    }
}