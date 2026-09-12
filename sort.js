(function () {
    'use strict';

    // Обязательная регистрация манифеста плагина в Lampa
    Lampa.Plugins.add({
        id: 'cub_sort_rating',
        name: 'Сортировка по рейтингу',
        version: '1.2.0',
        description: 'Добавляет пункт «По рейтингу» для сортировки карточек в коллекциях и списках CUB',
        author: 'Lampa Developer'
    });

    function initSortPlugin() {
        // Перехватываем отрисовку разделов и коллекций в Lampa
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite' || e.type === 'build') {
                setTimeout(function () {
                    addSortButton(e.target);
                }, 300);
            }
        });
    }

    function addSortButton(activity) {
        try {
            var render = activity.render ? activity.render() : null;
            if (!render) return;

            var head = render.find('.view--head .view__actions, .full-start__buttons, .view--actions');
            if (!head.length) {
                head = render.find('.full-start__buttons');
            }
            if (!head.length) return;

            // Защита от дублирования кнопки
            if (head.find('.lamp-sort-rating-btn').length) return;

            var sortButton = $(
                '<div class="selector view__action lamp-sort-rating-btn" style="display:inline-flex;align-items:center;cursor:pointer;margin-left:10px;">' +
                    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l4-4 4-4M7 5v14M21 15l-4 4-4-4M17 19V5"/></svg>' +
                    '<span style="margin-left: 5px;">По рейтингу</span>' +
                '</div>'
            );

            // Обработка нажатия пульта / клика
            sortButton.on('hover:enter', function () {
                sortCollectionCards(activity);
            });

            head.append(sortButton);
        } catch (err) {
            console.log('Sort Plugin Error:', err);
        }
    }

    function sortCollectionCards(activity) {
        try {
            var items = activity.card_items || activity.items || (activity.activity && activity.activity.items);
            if (!items || !items.length) {
                if (activity.results) items = activity.results;
            }

            if (!items || !items.length) {
                Lampa.Noty.show('Элементы для сортировки не найдены');
                return;
            }

            // Сортировка элементов по убыванию рейтинга (vote_average / rating)
            items.sort(function (a, b) {
                var ratingA = parseFloat(a.vote_average || a.rating || a.vote || 0);
                var ratingB = parseFloat(b.vote_average || b.rating || b.vote || 0);
                return ratingB - ratingA;
            });

            // Обновление представления (перерисовка сетки)
            if (typeof activity.refresh === 'function') {
                activity.refresh();
            } else if (typeof activity.build === 'function') {
                activity.build();
            } else if (typeof activity.draw === 'function') {
                activity.draw(items);
            }

            Lampa.Noty.show('Коллекция отсортирована по рейтингу');
        } catch (err) {
            console.log('Sort Plugin Sort Error:', err);
            Lampa.Noty.show('Ошибка сортировки');
        }
    }

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
