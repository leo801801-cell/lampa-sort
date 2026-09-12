(function () {
    'use strict';

    function initSortPlugin() {
        // Перехватываем отрисовку списков/коллекций в Lampa
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'build') {
                // Безопасное добавление функционала сортировки
                setTimeout(function () {
                    try {
                        addSortControl();
                    } catch (err) {
                        console.log('Sort Plugin Error:', err);
                    }
                }, 500);
            }
        });
    }

    function addSortControl() {
        // Ищем панель управления или меню на странице коллекции
        var head = $('.view--head .view__actions');
        if (!head.length) return;

        // Проверяем, чтобы кнопка не дублировалась
        if (head.find('.lamp-sort-rating-btn').length) return;

        var sortButton = $(
            '<div class="selector view__action lamp-sort-rating-btn">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<path d="M3 9l4-4 4 4M7 5v14M21 15l-4 4-4-4M17 19V5"/>' +
                '</svg>' +
                '<span>Сортировать по рейтингу</span>' +
            '</div>'
        );

        sortButton.on('hover:enter', function () {
            sortCollectionCards();
        });

        head.append(sortButton);
    }

    function sortCollectionCards() {
        // Получаем текущий активный компонент карточек
        var activeComponent = Lampa.Activity.active();
        if (!activeComponent || !activeComponent.activity) return;

        // Находим массив элементов на странице
        var items = activeComponent.card_items || activeComponent.items;
        if (!items || !items.length) {
            Lampa.Noty.show('Элементы для сортировки не найдены');
            return;
        }

        // Сортируем элементы по рейтингу (vote_average / rating) от большего к меньшему
        items.sort(function (a, b) {
            var ratingA = parseFloat(a.vote_average || a.rating || 0);
            var ratingB = parseFloat(b.vote_average || b.rating || 0);
            return ratingB - ratingA;
        });

        // Перерисовываем сетку карточек
        if (typeof activeComponent.refresh === 'function') {
            activeComponent.refresh();
        } else if (typeof activeComponent.build === 'function') {
            activeComponent.build();
        }

        Lampa.Noty.show('Коллекция отсортирована по рейтингу');
    }

    // Инициализация плагина при готовности Lampa
    if (window.appready) {
        initSortPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                initSortPlugin();
            }
        });
    }
})();
