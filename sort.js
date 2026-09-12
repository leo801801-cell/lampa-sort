(function () {
    'use strict';

    // Манифест плагина для Lampa
    Lampa.Plugins.add({
        id: 'cub_sort_rating',
        name: 'Сортировка по рейтингу',
        version: '1.1.0',
        description: 'Добавляет сортировку карточек по рейтингу в коллекциях и списках CUB',
        author: 'Lampa Developer'
    });

    function initSort() {
        // Перехват отрисовки списков/коллекций
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                addSortButton(e.target);
            }
        });
    }

    function addSortButton(activity) {
        try {
            // Проверяем, что мы находимся в разделе коллекций или похожем списке
            let render = activity.render();
            if (!render) return;

            let head = render.find('.view--head');
            if (head.length && !head.find('.sort-by-rating-btn').length) {
                let btn = $(`<div class="selector view--sort-btn sort-by-rating-btn" style="padding: 0 15px; display: flex; align-items: center; cursor: pointer; margin-left: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;">
                    <span>По рейтингу</span>
                </div>`);

                btn.on('hover:enter', function () {
                    sortCollectionItems(activity);
                });

                head.append(btn);
            }
        } catch (err) {
            console.error('CUB Sort:', err);
        }
    }

    function sortCollectionItems(activity) {
        if (!activity || typeof activity.activity !== 'function') return;
        
        // Получаем текущие элементы карточек в активности
        let items = activity.getItems ? activity.getItems() : null;
        if (!items || !items.length) {
            Lampa.Noty.show('Нет элементов для сортировки');
            return;
        }

        // Сортируем элементы по убыванию рейтинга (vote_average или vote)
        items.sort(function (a, b) {
            let rateA = parseFloat(a.vote_average || a.rating || a.vote || 0);
            let rateB = parseFloat(b.vote_average || b.rating || b.vote || 0);
            return rateB - rateA;
        });

        // Перестраиваем отображение списка в Lampa
        if (typeof activity.draw === 'function') {
            activity.draw(items);
        } else if (typeof activity.append === 'function') {
            // Альтернативный метод обновления контейнера
            activity.reset();
            activity.append(items);
        }

        Lampa.Noty.show('Коллекция отсортирована по рейтингу');
    }

    if (window.appready) {
        initSort();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                initSort();
            }
        });
    }
})();
