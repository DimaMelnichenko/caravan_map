// src/classes/Country.js

export default class Country extends Phaser.GameObjects.Text {
    /**
     * @param {Phaser.Scene} scene - Ссылка на сцену MainScene
     * @param {Object} data - Объект с данными страны из JSON/БД
     */
    constructor(scene, data) {
        // Вызываем конструктор родителя (Text)
        super(scene, data.x, data.y, data.name, {
            fontFamily: 'MyMedievalFont',
            fontSize: data.fontSize || '40px',
            fill: data.color || '#ff0000',
            stroke: '#000000',
            strokeThickness: 4
        });

        // Сохраняем данные внутри объекта
        this.countryData = data; 
        this.scene = scene;

        // Настройка внешнего вида
        this.setOrigin(0.5);
        this.setDepth(1);
        this.setAngle(data.angle || 0);

        // Добавляем объект на сцену
        scene.add.existing(this);

        // Включаем интерактивность
        this.setInteractive({ useHandCursor: true, draggable: true });

        // Настраиваем события
        this.setupEvents();
    }

    setupEvents() {
        // Клик по стране
        this.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();

            this.scene.viewingType = 'country'; // Устанавливаем фокус на страну
    
            if (this.scene.selectedCity) {
                this.scene.selectedCity.setSelected(false);
            }

            if (this.scene.isEditorMode) {
                this.scene.ui.showCountryEditor(this.countryData);
            } else {
                this.scene.ui.updateCountryInfo(this.countryData);
            }
            
            this.scene.sound.play('city_click', { volume: window.gameVolume });
        });

        // Перетаскивание (только в режиме редактора)
        this.on('drag', (pointer, dragX, dragY) => {
            if (this.scene.isEditorMode) {
                // Округляем координаты для чистоты данных
                this.x = Math.round(dragX);
                this.y = Math.round(dragY);
                
                // Обновляем данные в объекте, чтобы при сохранении они были актуальны
                this.countryData.x = this.x;
                this.countryData.y = this.y;
            }
        });
    }
}