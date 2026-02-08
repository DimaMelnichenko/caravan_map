// src/classes/UIManager.js

export default class UIManager {
    constructor(scene) {
        this.scene = scene;
        
        // Кэшируем основные элементы, чтобы не искать их каждый раз
        this.cityInfoContent = document.getElementById('city-info-content');
        this.cityEditor = document.getElementById('editor-panel');
        this.routeEditor = document.getElementById('route-editor-panel');
        this.countryEditor = document.getElementById('country-editor-panel');
        this.infoPanelBody = document.getElementById('city-info-body');
        this.panelArrow = document.getElementById('panel-toggle-arrow');

        this.initInfoPanelToggle();
    }

    /**
     * Логика сворачивания/разворачивания левой панели
     */
    initInfoPanelToggle() {
        const header = document.getElementById('city-info-header');
        header.onclick = () => {
            const isCollapsed = this.infoPanelBody.style.maxHeight === '0px';
            if (isCollapsed) this.expandInfoPanel();
            else this.collapseInfoPanel();
        };
    }

    expandInfoPanel() {
        this.infoPanelBody.style.maxHeight = '1000px';
        this.infoPanelBody.style.marginTop = '15px';
        this.panelArrow.style.transform = 'rotate(0deg)';
    }

    collapseInfoPanel() {
        this.infoPanelBody.style.maxHeight = '0px';
        this.infoPanelBody.style.marginTop = '0px';
        this.panelArrow.style.transform = 'rotate(-90deg)';
    }

    /**
     * Обновление информации о городе (левая панель)
     */
    updateCityInfo(cityData, routes) {
        this.expandInfoPanel();

        const country = this.scene.routesData.countries.find(c => c.id === cityData.country_id);
        const countryName = country ? country.name : 'Независимый город';

        // Фильтруем маршруты для этого города
        const connectedRoutes = routes.filter(r => 
            r.routeData.from_id === cityData.id || r.routeData.to_id === cityData.id
        );

        const goodsHTML = cityData.goods?.length > 0
            ? `<div class="goods-list">${cityData.goods.map(g => `<span class="good-tag">${g}</span>`).join('')}</div>`
            : '<span>Нет товаров</span>';

        const routesHTML = connectedRoutes.map(route => {
            const isFrom = route.routeData.from_id === cityData.id;
            const targetId = isFrom ? route.routeData.to_id : route.routeData.from_id;
            const targetCity = this.scene.cities.find(c => c.cityData.id === targetId);
            
            return `
                <div class="route-item" onclick="window.gameScene.selectRouteById(${route.routeData.id})" style="cursor: pointer;">
                    <strong>${isFrom ? '→' : '←'} ${targetCity?.cityData.name || 'Путь'}</strong><br>
                    <small>Длительность: ${route.routeData.calculatedDuration || 0} дн.</small>
                </div>
            `;
        }).join('');

        this.cityInfoContent.innerHTML = `
            <div class="city-property">Город: <strong>${cityData.name}</strong></div>
            <div class="city-property">Держава: <strong style="color: #8b87dc;">${countryName}</strong></div>
            <div class="city-property">Население: ${cityData.population?.toLocaleString()}</div>
            <div class="city-property">Товары: ${goodsHTML}</div>
            <div class="city-property">Маршруты (${connectedRoutes.length}):</div>
            ${routesHTML}
        `;
    }

    /**
     * Обновление информации о стране (левая панель)
     */
    updateCountryInfo(countryData) {
        this.expandInfoPanel();

        // 1. Ищем все города, принадлежащие этой стране
        // Мы обращаемся к массиву объектов City в сцене
        const ownedCities = this.scene.cities.filter(city => 
            city.cityData.country_id === countryData.id
        );

        // 2. Формируем список городов в HTML
        // Мы добавим обработчик onclick, чтобы при клике на название города камера летела к нему
        const cityListHTML = ownedCities.length > 0
            ? `<ul style="list-style: none; padding: 0; margin-top: 10px;">
                ${ownedCities.map(city => `
                    <li onclick="window.gameScene.selectCity({id: ${city.cityData.id}})" 
                        style="cursor: pointer; padding: 5px; margin-bottom: 3px; background: rgba(255,255,255,0.05); border-radius: 4px; transition: background 0.2s;"
                        onmouseover="this.style.background='rgba(74, 111, 165, 0.3)'"
                        onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        🏛️ ${city.cityData.name} 
                        <small style="float: right; color: #aaa;">${city.cityData.population?.toLocaleString()} чел.</small>
                    </li>
                `).join('')}
            </ul>`
            : '<p style="color: #aaa; font-style: italic;">У этой державы пока нет городов.</p>';

        // 3. Считаем общее население страны
        const totalPopulation = ownedCities.reduce((sum, city) => sum + (city.cityData.population || 0), 0);

        // 4. Выводим всё в панель
        this.cityInfoContent.innerHTML = `
            <div class="city-property" style="border-left-color: ${countryData.color || '#ff0000'};">
                Держава: <strong style="font-size: 1.2em;">${countryData.name}</strong>
            </div>
            <div class="city-property">Основная раса: ${countryData.race || 'Неизвестно'}</div>
            <div class="city-property">Религия: ${countryData.religion || 'Нет'}</div>
            <div class="city-property">Общее население: <strong>${totalPopulation.toLocaleString()}</strong> чел.</div>
            
            <h4 style="margin: 15px 0 5px 0; color: #4a6fa5; border-bottom: 1px solid #4a6fa5;">🏛️ Города державы (${ownedCities.length}):</h4>
            ${cityListHTML}
            
            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 15px 0;">
            <p><small>Нажмите на название города в списке, чтобы перейти к нему.</small></p>
        `;
    }

    /**
     * Открытие редакторов (правая сторона)
     */
    showCityEditor(cityData) {
        this.hideAllEditors();
        this.cityEditor.style.display = 'block';

        // Находим наш выпадающий список
        const countrySelect = document.getElementById('edit-city-country');
        
        // Очищаем и заполняем заново
        countrySelect.innerHTML = '<option value="0">Независимый / Ничей</option>';
        this.scene.routesData.countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country.id;
            option.text = country.name;
            // Если город принадлежит этой стране, выбираем её
            if (cityData.country_id === country.id) {
                option.selected = true;
            }
            countrySelect.appendChild(option);
        });

        // Заполняем поля (теперь через закэшированный доступ или прямо так)
        document.getElementById('edit-city-id').value = cityData.id;
        document.getElementById('edit-city-name').value = cityData.name;
        document.getElementById('edit-city-population').value = cityData.population || 0;
        document.getElementById('edit-city-desc').value = cityData.description || '';
        document.getElementById('edit-city-goods').value = (cityData.goods || []).join(', ');

        // Твой эффект мигания
        this.cityEditor.style.borderColor = '#00FF00';
        setTimeout(() => { 
            this.cityEditor.style.borderColor = '#4a6fa5'; 
        }, 300);
    }

    showRouteEditor(routeData) {
        this.hideAllEditors();
        this.routeEditor.style.display = 'block';
        document.getElementById('edit-route-id').value = routeData.id;
        document.getElementById('edit-route-type').value = routeData.type;
        document.getElementById('edit-route-coeff').value = routeData.speedCoeff || 1.0;
        document.getElementById('edit-route-count').value = routeData.unitCount;
    }

    showCountryEditor(data) {
        this.hideAllEditors();
        this.countryEditor.style.display = 'block';
        document.getElementById('edit-country-id').value = data.id;
        document.getElementById('edit-country-name').value = data.name;
        document.getElementById('edit-country-race').value = data.race;
        document.getElementById('edit-country-pop').value = data.population;
        
        // Обновляем слайдеры и их текстовые значения
        const cult = data.culture || 0;
        const mil = data.militancy || 0;
        const ang = data.angle || 0;

        document.getElementById('edit-country-culture').value = cult;
        document.getElementById('val-culture').innerText = cult;
        document.getElementById('edit-country-militancy').value = mil;
        document.getElementById('val-militancy').innerText = mil;
        document.getElementById('edit-country-angle').value = ang;
        document.getElementById('val-angle').innerText = ang;
    }

    hideAllEditors() {
        this.cityEditor.style.display = 'none';
        this.routeEditor.style.display = 'none';
        this.countryEditor.style.display = 'none';
    }

    showNotification(message, type = 'info') {
        // Создаем элемент
        const notification = document.createElement('div');
        notification.className = `game-notification ${type}`;
        notification.innerText = message;

         console.log( message )

        // Добавляем в документ
        document.body.appendChild(notification);

        // Запускаем анимацию появления (через небольшую задержку, чтобы transition сработал)
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Планируем исчезновение
        setTimeout(() => {
            notification.classList.remove('show');
            // Удаляем из DOM после завершения анимации исчезновения
            setTimeout(() => {
                notification.remove();
            }, 400);
        }, 3000); // 3 секунды плашка висит на экране
    }

    showCaravanInfo(info) {
        this.expandInfoPanel();
        this.cityInfoContent.innerHTML = `
            <div class="city-property" style="border-color: #ff9900;">🚚 <strong>${info.title}</strong></div>
            <div class="city-property">Маршрут: <strong>${info.from} → ${info.to}</strong></div>
            <div class="city-property">Груз: <span class="good-tag">${info.good}</span></div>
            <hr>
            <p><small>Караваны перевозят товары между городами, поддерживая экономику держав.</small></p>
        `;
    }
}