const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 8080;
const DATA_PATH = path.join(__dirname, 'assets/data/routes.json');

app.use(cors());
app.use(bodyParser.json());
// Раздаем статические файлы (наш фронтенд)
app.use(express.static(__dirname));

// Эндпоинт для сохранения данных
app.post('/api/save', (req, res) => {
    const newData = req.body;
    
    fs.writeFile(DATA_PATH, JSON.stringify(newData, null, 4), (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Ошибка при записи файла');
        }
        res.send({ message: 'Данные успешно сохранены' });
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log(`Теперь вы можете редактировать карту и изменения сохранятся!`);
});