(function () {
    'use strict';

    // Безопасная инициализация сетевого клиента с учетом возможных опечаток в ядре Lampa
    var NetworkRequest = Lampa.Request || Lampa.Reguest;
    var network = new NetworkRequest();

    // Неофициальный ключ API Кинопоиска (замените на актуальный при необходимости)
    var KP_API_KEY = 'YOUR_API_KEY_HERE';

    // Пакетная загрузка рейтингов с защитой от лимитов (429 Too Many Requests)
    function fetchKpRatings(items, callback) {
        var index = 0;
        var results = [];

        function next() {
            if (index >= items.length) {
                callback(results);
                return;
            }

            var item = items[index];
            index++;

            // Извлекаем ID Кинопоиска из различных возможных полей
            var kpId = item.kinopoisk_id || item.kp_id || (item.ids && item.ids.kp);

            if (kpId) {
                // Проверяем локальный кэш, чтобы не дергать API повторно
                var cachedRating = Lampa.Storage.get('kp_rating_' + kpId);
                if (cachedRating !== undefined && cachedRating !== null) {
                    item.custom_kp_rating = cachedRating;
                    results.push(item);
                    setTimeout(next, 10); // Быстрый переход для закэшированных данных
                    return;
                }

                network.silent('https://kinopoiskapiunofficial.tech/api/v2.2/films/' + kpId, function (data) {
                    if (data && data.ratingKinopoisk) {
                        item.custom_kp_rating = parseFloat(data.ratingKinopoisk);
                        Lampa.Storage.set('kp_rating_' + kpId, item.custom_kp_rating);
                    } else {
                        item.custom_kp_rating = 0;
                    }
                    results.push(item);
                    // Задержка 150мс для предотвращения блокировки со стороны API
                    setTimeout(next, 150);
                }, function () {
                    item.custom_kp_rating = 0;
                    results.push(item);
                    setTimeout(next, 150);
                }, false, {
                    'X-API-KEY': KP_API_KEY,
                    'Content-Type': 'application/json'
                });
            } else {
                item.custom_kp_rating = 0;
                results.push(item);
                setTimeout(next, 10);
            }
        }

        next();
    }

    // Нарезка полного отсортированного массива на страницы для защиты ОЗУ слабеньких ТВ-боксов
    function paginateResults(results, page, perPage) {
        var start = (page - 1) * perPage;
        var end = start + perPage;
        return results.slice(start, end);
    }

    // Основная функция обработки и сортировки элементов коллекции
    function processCollection(data, callback) {
        var allItems = data.results || [];
        
        fetchKpRatings(allItems, function(sortedItems) {
            // Сортировка по убыванию рейтинга Кинопоиска
            sortedItems.sort(function(a, b) {
                return (b.custom_kp_rating || 0) - (a.custom_kp_rating || 0);
            });

            // Сохраняем полный отсортированный массив и формируем первую страницу (по 20 элементов)
            data.all_results = sortedItems;
            data.total_pages = Math.ceil(sortedItems.length / 20) || 1;
            data.results = paginateResults(sortedItems, 1, 20);

            callback(data);
        });
    }

    // Безопасная установка хуков на карточки с ограничением попыток ожидания рендеринга
    function installCardHooks(comp, collectionId, title) {
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            var render = comp.render && comp.render();
            
            if (render && render.find) {
                var cards = render.find('.card');
                if (cards.length) {
                    clearInterval(timer);
                    cards.each(function () {
                        var card = $(this);
                        // Проверяем, чтобы не вешать обработчик дважды
                        if (!card.hasClass('sorted-hooked')) {
                            card.addClass('sorted-hooked');
                            // Дополнительная логика взаимодействия с карточкой при необходимости
                        }
                    });
                }
            }
            
            // Прекращаем попытки через 5 секунд ожидания
            if (tries > 50) {
                clearInterval(timer);
            }
        }, 100);
    }

    // Регистрация плагина в среде Lampa
    Lampa.Plugin.add({
        name: 'CUB KP Sorter',
        version: '1.1.0',
        description: 'Локальная сортировка коллекций CUB по рейтингу Кинопоиска с оптимизацией для Android TV',
        author: 'Custom',
        onPreload: function () {
            console.log('Plugin CUB KP Sorter loaded successfully');
        }
    });

})();
