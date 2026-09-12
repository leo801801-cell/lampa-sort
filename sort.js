/**
 * @plugin Сортировка по рейтингу
 * @version 1.3.0
 * @description Добавляет кнопку «По рейтингу» для сортировки карточек в коллекциях и списках CUB
 * @author Lampa Developer
 */

(function () {
    'use strict';

    if (window.cub_sort_rating_plugin_loaded) return;
    window.cub_sort_rating_plugin_loaded = true;

    function initSortPlugin() {
        // Перехватываем отрисовку компонентов и коллекций в Lampa
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite' || e.type === 'build') {
                setTimeout(function () {
                    addSortButton(e.target);
                }, 300);
            }
        });

        Lampa.Listener.follow('activity', function (e) {
            if (e.type === 'start') {
                setTimeout(function () {
                    if (e.component && (e.component === 'cub_collection' || e.component === 'favorite' || e.component === 'category')) {
                        addSortButton(e.object);
                    }
                }, 400);
            }
        });
    }

    function addSortButton(target) {
        try {
            if (!target || typeof target.render !== 'function') return;
            var render = target.render();
            if (!render || !render.length) return;

            // Ищем шапку страницы коллекции
            var head = render.find('.view--head .view__actions, .box__head, .full-start__buttons, .view--actions').first();
            if (!head.length) {
                head = render.find('.view--head');
            }
            if (!head.length) return;

            // Защита от дублирования кнопки
            if (head.find('.lamp-sort-rating-btn').length) return;

            var sortButton = $(
                '<div class="selector view__action lamp-sort-rating-btn" style="display:inline-flex;align-items:center;cursor:pointer;margin-left:10px;padding: 0 15px;background: rgba(255,255,255,0.1);border-radius: 8px;height: 44px;">' +
                    '<span style="font-size: 14px;">По рейтингу</span>' +
                '</div>'
            );

            // Обработка нажатия пульта / клика
            sortButton.on('hover:enter', function () {
                sortCollectionCards(target);
            });

            head.append(sortButton);
        } catch (err) {
            console.log('CUB Sort Error adding button:', err);
        }
    }

    function sortCollectionCards(target) {
        try {
            var items = target.card_items || target.items || (target.activity && target.activity.items) || target.results;

            if (!items || !Array.isArray(items) || items.length === 0) {
                if (target.storage && target.storage.movie) {
                    items = target.storage.movie;
                }
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                Lampa.Noty.show('Элементы для сортировки не найдены');
                return;
            }

            // Сортировка элементов по убыванию рейтинга (vote_average / rating)
            items.sort(function (a, b) {
                var ratingA = parseFloat(a.vote_average || a.rating || a.vote || 0);
                var ratingB = parseFloat(b.vote_average || b.rating || b.vote || 0);
                return ratingB - ratingA;
            });

            // Обновление представления (перерисовка сетки карточек)
            if (typeof target.refresh === 'function') {
                target.refresh();
            } else if (typeof target.build === 'function') {
                target.build();
            } else if (typeof target.draw === 'function') {
                target.draw(items);
            } else if (target.activity && typeof target.activity.refresh === 'function') {
                target.activity.refresh();
            }

            Lampa.Noty.show('Коллекция отсортирована по рейтингу');
        } catch (err) {
            console.log('CUB Sort Error sorting:', err);
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
