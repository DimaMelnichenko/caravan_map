export default class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        // Загрузка минимальных ресурсов для загрузочного экрана
        this.load.image('loading', 'assets/images/loading.png');
    }

    create() {
        this.scene.start('PreloadScene');
    }
}