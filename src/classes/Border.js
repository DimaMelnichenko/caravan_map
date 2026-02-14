// src/classes/Border.js
export default class Border {
    constructor(scene, data) {
        this.scene = scene;
        this.data = data;

        // 1. УМНЫЙ ПАРСИНГ (защита от двойного квотирования в БД)
        let pts = data.points;
        
        // Пытаемся парсить до тех пор, пока это строка
        // (иногда БД возвращает '"[[...]]"', что после JSON.parse дает строку "[[...]]")
        while (typeof pts === 'string') {
            try {
                pts = JSON.parse(pts);
            } catch (e) {
                console.error("Ошибка парсинга точек для границы:", data.id);
                break; 
            }
        }

        // 2. Гарантируем, что это массив
        this.points = Array.isArray(pts) ? pts : [];
        
        // Синхронизируем данные объекта, чтобы в БД улетал чистый массив при сохранении
        this.data.points = this.points;

        this.curve = null;

        if (this.points.length >= 2) {
            this.updateCurve();
        }
    }

    updateCurve() {
        // Еще раз проверяем, что это массив перед map
        if (!Array.isArray(this.points) || this.points.length < 2) {
            console.warn("updateCurve: недостаточно точек или не массив", this.points);
            return;
        }

        try {
            const vectorPoints = this.points.map(p => new Phaser.Math.Vector2(p[0], p[1]));
            this.curve = new Phaser.Curves.Spline(vectorPoints);
        } catch (err) {
            console.error("Ошибка создания сплайна:", err);
        }
    }

    /**
     * @param {Phaser.GameObjects.RenderTexture} rt - Холст для рисования
     * @param {Phaser.GameObjects.Sprite} stamp - Спрайт-черточка
     */
    drawToCanvas(rt, stamp) {
        if (!this.curve || this.points.length < 2) return;

        const country = this.scene.routesData.countries.find(c => c.id === this.data.country_id);
        const color = country ? Phaser.Display.Color.HexStringToColor(country.color || '#ffffff').color : 0xffffff;

        const length = this.curve.getLength();
        const stepPx = 24; // Четкий шаг в пикселях
        const iterations = Math.floor(length / stepPx);

        stamp.setTint(color);

        for (let i = 0; i <= iterations; i++) {
            // u - это позиция от 0 до 1, основанная на пройденном расстоянии (линейно)
            const u = (i * stepPx) / length;
            if (u > 1) break;

            // Используем getPointAt вместо getPoint для равномерного распределения
            const pos = this.curve.getPointAt(u);
            const tangent = this.curve.getTangentAt(u);
            const angle = Phaser.Math.RadToDeg(Math.atan2(tangent.y, tangent.x));

            stamp.setAngle(angle);
            rt.draw(stamp, pos.x, pos.y);
        }
    }
}