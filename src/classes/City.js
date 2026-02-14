import CityStorage from './CityStorage.js';

export default class City extends Phaser.GameObjects.Sprite {
    constructor(scene, data) {
        // Выбираем текстуру 'city'
        super(scene, data.x, data.y, 'city');
        
        this.cityData = data; // Снова используем уникальное имя свойства
        this.scene = scene;

        // Инициализируем склад
        this.storage = new CityStorage(scene, data.id, data.max_storage || 1000);

        // Настройки из твоего оригинала
        this.setScale(scene.cityScale);
        this.setDepth(10);

        this.label = scene.add.text(data.x, data.y - 35, data.name, {
            font: 'bold 16px Arial',
            fill: this.getLabelColor(), // Используем метод для выбора цвета
            stroke: '#000000',
            strokeThickness: 3,
            shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 2, fill: true }
        }).setOrigin(0.5).setDepth(100);

        // Добавляем на сцену
        scene.add.existing(this);

        // Включаем интерактивность
        this.setInteractive({ useHandCursor: true });

        this.setupEvents();
    }

    destroy(fromScene) {
        // Если у города есть надпись, удаляем её принудительно
        if (this.label) {
            this.label.destroy(fromScene);
        }
        // Вызываем стандартный метод удаления спрайта
        super.destroy(fromScene);
    }

    getLabelColor() {
        if (this.cityData.population > 10000) {
            return '#ffcc00'; // Золотой для мегаполисов
        }
        return '#aa7fFF'; // Обычный цвет
    }

    setupEvents() {
        // Эффект при наведении
        this.on('pointerover', () => {
            this.scene.tweens.add({
                targets: this,
                scale: this.scene.cityScale + 0.05,
                duration: 200
            });
            
            // Если город не выбран, добавляем легкое свечение
            if (this.scene.selectedCity !== this) {
                this.postFX.addGlow(0x4a6fa5, 2);
            }
        });

        // Эффект при уходе мышки
        this.on('pointerout', () => {
            if (this.scene.selectedCity !== this) {
                this.scene.tweens.add({
                    targets: this,
                    scale: this.scene.cityScale,
                    duration: 200
                });
                this.postFX.clear();
            }
        });

        // Клик по городу
        this.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            // Вызываем метод выбора города в сцене
            this.scene.selectCity(this.cityData);
            this.scene.sound.play('city_click', { volume: window.gameVolume });
        });
    }

    // Метод для визуального выделения города (когда он выбран)
    setSelected(isSelected) {
        this.postFX.clear(); // Сбрасываем старые эффекты
        
        if (isSelected) {
            this.scene.tweens.add({
                targets: this,
                scale: this.scene.cityScale + 0.07,
                duration: 300,
                ease: 'Back.easeOut'
            });

            const glow = this.postFX.addGlow(0x4a6fa5, 4, 0, false, 0.1, 12);
            this.scene.tweens.add({
                targets: glow,
                outerStrength: 10,
                duration: 1000,
                yoyo: true,
                repeat: -1
            });
        } else {
            this.scene.tweens.add({
                targets: this,
                scale: this.scene.cityScale,
                duration: 200
            });
        }
    }
}