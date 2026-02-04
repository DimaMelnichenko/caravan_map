import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import MainScene from './scenes/MainScene.js';

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BootScene, PreloadScene, MainScene],
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            gravity: { y: 0 }
        }
    },
    render: {
        pixelArt: false,
        antialias: true
    }
};

const game = new Phaser.Game(config);

// Глобальные переменные
window.gameSpeed = 1.0;
window.isMuted = false;
window.gameVolume = 0.5;

// Управление скоростью
document.getElementById('speed-slow').addEventListener('click', () => {
    window.gameSpeed = 0.5;
    updateSpeedButtons('speed-slow');
});

document.getElementById('speed-normal').addEventListener('click', () => {
    window.gameSpeed = 1.0;
    updateSpeedButtons('speed-normal');
});

document.getElementById('speed-fast').addEventListener('click', () => {
    window.gameSpeed = 2.0;
    updateSpeedButtons('speed-fast');
});

document.getElementById('mute-btn').addEventListener('click', () => {
    window.isMuted = !window.isMuted;
    document.getElementById('mute-btn').textContent = 
        window.isMuted ? '🔇' : '🔈';
});

document.getElementById('volume-slider').addEventListener('input', (e) => {
    window.gameVolume = e.target.value / 100;
});

function updateSpeedButtons(activeId) {
    document.querySelectorAll('.speed-control button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(activeId).classList.add('active');
}