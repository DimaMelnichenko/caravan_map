# Caravan Map — Архитектура и структура данных

## Структура базы данных

### Таблица `routes`

**Важное уточнение:** Маршруты хранятся следующим образом:
- `from_id` — ссылка на город в таблице `cities` (содержит координаты `x, y` — это **начальная точка** маршрута)
- `to_id` — ссылка на город в таблице `cities` (содержит координаты `x, y` — это **конечная точка** маршрута)
- `points` — **промежуточные точки** кривой Безье (НЕ включают начальную и конечную точки!)

**Полный маршрут состоит из:**
1. Начальная точка: `cities[from_id].x, cities[from_id].y`
2. Промежуточные точки: `routes.points` (массив `[x, y]`)
3. Конечная точка: `cities[to_id].x, cities[to_id].y`

### Пример полного маршрута

```javascript
// Маршрут из БД
{
  id: 1,
  from_id: 10,      // Город А
  to_id: 20,        // Город Б
  points: [[100, 200], [150, 250], [200, 300]]  // Промежуточные точки
}

// Города
cities.find(c => c.id === 10)  // { x: 50, y: 50 }
cities.find(c => c.id === 20)  // { x: 400, y: 350 }

// Полный путь для кривой:
// [50, 50] → [100, 200] → [150, 250] → [200, 300] → [400, 350]
```

## Архитектура синхронизации

### Серверная часть
- **WorldState** — хранение состояния мира в памяти
- **GameLoop** — вычисление движения караванов (1 тик/сек)
- **SyncManager** — отправка событий клиентам

### Клиентская часть
- **ServerSyncService** — получение событий от сервера
- **Caravan** — клиентское вычисление позиции на основе времени
- **Route** — отрисовка маршрута и управление караванами

### Протокол обмена

**События сервер → клиент:**
- `caravan_spawn` — появление каравана (с `started_at`, `travel_time`)
- `caravan_arrived` — караван прибыл в город
- `caravan_trading` — началась торговля
- `trade_complete` — торговля завершена, караван разворачивается
- `time_sync` — синхронизация времени

**Формула движения:**
```javascript
progress = (Date.now() - started_at) / travel_time * 100
```

## Исправления для Route.js

### Неправильно (старый код):
```javascript
const allPoints = [
    new Phaser.Math.Vector2(startCity.x, startCity.y)
];
if (this.routeData.points) {
    this.routeData.points.forEach(p => 
        allPoints.push(new Phaser.Math.Vector2(p[0], p[1]))
    );
}
// ОШИБКА: не добавлена конечная точка!
```

### Правильно (новый код):
```javascript
const allPoints = [
    new Phaser.Math.Vector2(startCity.x, startCity.y)  // from_id
];
if (this.routeData.points) {
    this.routeData.points.forEach(p => 
        allPoints.push(new Phaser.Math.Vector2(p[0], p[1]))
    );
}
allPoints.push(new Phaser.Math.Vector2(endCity.x, endCity.y));  // to_id
```
