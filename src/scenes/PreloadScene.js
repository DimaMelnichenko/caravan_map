export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    async preload() {
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

        try {
            const response = await fetch('/api/load');
            const data = await response.json();
            this.itemsData = data.items; // Сохраняем, чтобы проверить в create()
        } catch (e) {
            console.error("Не удалось получить список товаров для загрузки иконок", e);
            this.itemsData = [];
        }

        // --- ДИНАМИЧЕСКАЯ ЗАГРУЗКА ИКОНОК ---
        this.itemsData.forEach(item => {
            if (item.icon) {
                // Предполагаем, что имя иконки в БД соответствует имени файла в папке
                // Например: icon_grain -> assets/images/items/grain.png
                const fileName = item.icon.replace('icon_', '') + '.png';
                this.load.image(item.icon, `assets/images/items/${fileName}`);
            }
        });
        
        this.load.image('border_dash', 'assets/images/border_dash.png');
    }
    
    create() {
        
        // --- ГЕНЕРАЦИЯ ЗАГЛУШЕК ДЛЯ НЕЗАГРУЗИВШИХСЯ ИКОНОК ---
        this.itemsData.forEach(item => {
            // Если текстура не появилась в менеджере (файл не найден), создаем черный квадрат
            if (!this.textures.exists(item.icon)) {
                console.warn(`Иконка ${item.icon} не найдена. Создаю заглушку.`);
                
                const size = 32;
                const graphics = this.make.graphics({ x: 0, y: 0, add: false });
                
                // Рисуем черный квадрат с рамкой
                graphics.fillStyle(0x000000, 1);
                graphics.fillRect(0, 0, size, size);
                graphics.lineStyle(2, 0xffffff, 0.5);
                graphics.strokeRect(0, 0, size, size);
                
                // Генерируем текстуру из графики прямо в память под тем же именем (key)
                graphics.generateTexture(item.icon, size, size);
            }
        });

        this.scene.start('MainScene');
    }
}