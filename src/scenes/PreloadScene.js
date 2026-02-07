export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
        // Создание индикатора загрузки
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(240, 270, 320, 50);
        
        const loadingText = this.add.text(400, 260, 'Загрузка...', {
            font: '20px Arial',
            fill: '#ffffff'
        }).setOrigin(0.5);
        
        // Обработка прогресса
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0x4a6fa5, 1);
            progressBar.fillRect(250, 280, 300 * value, 30);
        });
        
        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
        });
        
        // Загрузка изображений
        this.load.image('map', 'assets/images/map.jpg');
        this.load.image('caravan', 'assets/images/caravan.png');
        this.load.image('ship', 'assets/images/ship.png');
        this.load.image('city', 'assets/images/city.png');
        this.load.image('selected-city', 'assets/images/city.png');
        
        // Загрузка звуков
        this.load.audio('caravan_sound', ['assets/audio/caravan.mp3', 'assets/audio/caravan.ogg']);
        this.load.audio('ambient', ['assets/audio/ambient.mp3', 'assets/audio/ambient.ogg']);
        this.load.audio('city_click', ['assets/audio/city_click.mp3', 'assets/audio/city_click.ogg']);
        
        // Загрузка данных
        this.load.json('cities_data', 'assets/data/cities.json');
        this.load.json('routes_data', 'assets/data/routes.json');
        this.load.json('countries_data', 'assets/data/countries.json');
    }
    
    create() {
        this.scene.start('MainScene');
    }
}