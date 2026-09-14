(function () {
    'use strict';

    // 1. Инициализация сети (защита от опечатки Reguest в старых версиях Lampa)
    var NetworkRequest = Lampa.Request || Lampa.Reguest;
    var network = new NetworkRequest();

    // ВАЖНО: Впиши сюда свой ключ от kinopoiskapiunofficial.tech
    var KP_API_KEY = 'YOUR_API_KEY_HERE'; 

    // 2. Рекурсивный сбор всех страниц коллекции CUB
    function requestPage(url, page, allItems, onComplete) {
        var pageUrl = url + (url.indexOf('?') > -1 ? '&' : '?') + 'page=' + page;
        
        network.silent(pageUrl, function (data) {
            if (data && data.results && data.results.length) {
                allItems = allItems.concat(data.results);
                // Защита от бесконечного цикла: собираем максимум 10 страниц (200 фильмов)
                if (page < data.total_pages && page < 10) { 
                    requestPage(url, page + 1, allItems, onComplete);
                } else {
                    onComplete(allItems);
                }
            } else {
                onComplete(allItems);
            }
        }, function () {
            // Если ошибка (например, таймаут), отдаем то, что успели собрать
            onComplete(allItems);
        });
    }

    // 3. Пакетная загрузка рейтингов с защитой от бана (429 Too Many Requests)
    function loadKpRatings(items, callback) {
        var index = 0;
        var results = [];

        function next() {
            if (index >= items.length) {
                return callback(results);
            }

            var item = items[index];
            index++;

            // Ищем ID Кинопоиска (в Lampa и CUB он может лежать в разных полях)
            var kpId = item.kinopoisk_id || item.kp_id || (item.ids && item.ids.kp);

            if (kpId) {
                // Проверяем кэш Lampa, чтобы не дергать API для уже известных фильмов
                var cachedRating = Lampa.Storage.get('kp_rating_' + kpId);
                if (cachedRating !== undefined && cachedRating !== null) {
                    item.custom_kp_rating = parseFloat(cachedRating);
                    results.push(item);
                    setTimeout(next, 10); // Из кэша отдаем почти моментально
                    return;
                }

                // Запрос к неофициальному API
                network.silent('https://kinopoiskapiunofficial.tech/api/v2.2/films/' + kpId, function (data) {
                    if (data && data.ratingKinopoisk) {
                        item.custom_kp_rating = parseFloat(data.ratingKinopoisk);
                        Lampa.Storage.set('kp_rating_' + kpId, item.custom_kp_rating);
                    } else {
                        item.custom_kp_rating = 0;
                    }
                    results.push(item);
                    setTimeout(next, 150); // Задержка 150мс спасает от блокировки API
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

    // 4. Пагинатор для защиты ОЗУ на Android TV
    function paginateResults(results, page, perPage) {
        var start = (page - 1) * perPage;
        return results.slice(start, start + perPage);
    }

    // 5. Главный обработчик: Сборка, парсинг, сортировка и подготовка данных для Lampa
    function buildCollectionData(comp, url, callback) {
        // Начинаем сбор с 1-й страницы
        requestPage(url, 1, [], function(allItems) {
            
            // Загружаем рейтинги для собранного массива
            loadKpRatings(allItems, function(sortedItems) {
                
                // Сортируем по убыванию рейтинга
                sortedItems.sort(function(a, b) {
                    return (b.custom_kp_rating || 0) - (a.custom_kp_rating || 0);
                });

                // Подменяем объект data, чтобы Lampa не сошла с ума от 200 карточек разом
                var data = {};
                data.all_results = sortedItems; // Прячем полный массив
                data.total_pages = Math.ceil(sortedItems.length / 20) || 1;
                data.results = paginateResults(sortedItems, 1, 20); // Отдаем только первые 20

                // Переопределяем метод бесконечного скролла Lampa для этой коллекции
                comp.nextPageRequest = function() {
                    comp.page++;
                    var nextResults = paginateResults(data.all_results, comp.page, 20);
                    if (nextResults.length) {
                        comp.append(nextResults); // Дорисовываем следующие 20 карточек
                    } else {
                        comp.empty_page = true; // Конец списка
                    }
                };

                callback(data);
            });
        });
    }

    // 6. Отрисовка UI сортировки на карточках
    function attachSortMenu(card, collectionId, title) {
        if (card.hasClass('sorted-hooked')) return;
        card.addClass('sorted-hooked');

        // Пример: добавляем визуальную метку с нашим рейтингом
        var data = card.data('card') || {};
        if (data.custom_kp_rating) {
            var ratingElement = $('<div class="card__rating" style="background: #f60; position: absolute; top: 5px; left: 5px; padding: 2px 5px; border-radius: 3px; font-weight: bold; font-size: 12px; z-index: 2;">' + data.custom_kp_rating.toFixed(1) + '</div>');
            card.find('.card__view').append(ratingElement);
        }
    }

    // 7. Поиск отрендеренных карточек в DOM
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
                        attachSortMenu($(this), collectionId, title);
                    });
                }
            }
            
            // Если карточек нет более 5 секунд - отменяем поиск
            if (tries > 50) clearInterval(timer); 
        }, 100);
    }

    // 8. Перехват инициализации компонентов Lampa
    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            // Хук в базовый компонент (например, когда открывается категория)
            var originalStart = Lampa.Component.prototype.start;
            
            Lampa.Component.prototype.start = function() {
                var comp = this;
                
                // Проверяем, что это коллекция CUB (название активности может отличаться в зависимости от версии CUB)
                if (comp.activity && comp.activity.component == 'cub_collection' && comp.activity.url) {
                    // Перехватываем стандартную загрузку
                    comp.build = function(data) {
                        // Тут вызывается оригинальный билд после нашей подмены данных
                        Lampa.Template.add('cub_sort_loader', '<div class="broadcast__text" style="text-align:center; padding: 50px;">Идет сортировка коллекции и загрузка рейтингов...</div>');
                        comp.empty(Lampa.Template.get('cub_sort_loader'));

                        buildCollectionData(comp, comp.activity.url, function(sortedData) {
                            comp.empty();
                            originalStart.call(comp, sortedData); // Запускаем стандартный рендер с нашей 1-й страницей
                            installCardHooks(comp, comp.activity.id, comp.activity.title);
                        });
                    };
                    return; // Прерываем стандартный start, пока не отработает buildCollectionData
                }
                
                originalStart.apply(comp, arguments);
            };
        }
    });

    // 9. Регистрация плагина
    Lampa.Plugin.add({
        name: 'CUB KP Sorter Full',
        version: '2.0.0',
        description: 'Локальная сортировка CUB по Кинопоиску с пагинацией и кэшем',
        author: 'Custom',
        onPreload: function () {
            console.log('Plugin CUB KP Sorter Full loaded');
        }
    });

})();
