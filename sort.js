(function () {
    'use strict';

    /*
     * CUB Collections — сортировка фильмов по рейтингу TMDB / Кинопоиск
     *
     * Версия: 1.2.0
     *
     * Что делает:
     * - заменяет экран просмотра коллекции CUB;
     * - загружает все страницы коллекции;
     * - сортирует фильмы по TMDB;
     * - сортирует фильмы по Кинопоиску;
     * - позволяет вернуть исходный порядок CUB;
     * - выбор режима сохраняется для каждой коллекции;
     * - пункт сортировки добавляется в существующее меню
     *   долгого нажатия, не заменяя меню других плагинов.
     */

    if (window.CUBCollectionRatingSort) return;
    window.CUBCollectionRatingSort = true;

    var VERSION = '1.2.0';
    var STORAGE_KEY = 'cub_collection_rating_sort';
    var network = null;

    function getStorage() {
        var data = Lampa.Storage.get(STORAGE_KEY, '{}');

        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                data = {};
            }
        }

        return data || {};
    }

    function setStorage(data) {
        Lampa.Storage.set(STORAGE_KEY, data);
    }

    function getMode(collectionId) {
        var data = getStorage();

        return data[collectionId] || 'rating_desc';
    }

    function setMode(collectionId, mode) {
        var data = getStorage();

        data[collectionId] = mode;

        setStorage(data);
    }

    /*
     * ---------------------------------------------------------
     * TMDB
     * ---------------------------------------------------------
     */

    function getRating(item) {
        if (!item) return -1;

        var values = [
            item.vote_average,
            item.rating,
            item.tmdb_rating,
            item.tmdb_vote_average
        ];

        for (var i = 0; i < values.length; i++) {
            var value = parseFloat(values[i]);

            if (isFinite(value)) return value;
        }

        return -1;
    }

    function sortByRating(items, direction) {
        return items
            .map(function (item, index) {
                return {
                    item: item,
                    index: index,
                    rating: getRating(item)
                };
            })
            .sort(function (a, b) {

                /*
                 * Фильмы без рейтинга всегда в конце.
                 */

                if (a.rating < 0 && b.rating >= 0) return 1;
                if (a.rating >= 0 && b.rating < 0) return -1;

                if (a.rating !== b.rating) {
                    return direction === 'asc'
                        ? a.rating - b.rating
                        : b.rating - a.rating;
                }

                /*
                 * При одинаковом рейтинге сохраняем
                 * исходный порядок CUB.
                 */

                return a.index - b.index;
            })
            .map(function (entry) {
                return entry.item;
            });
    }


    /*
     * ---------------------------------------------------------
     * КИНОПОИСК
     *
     * Используется тот же механизм, что и в rating.js.
     * Рейтинг сохраняется в kp_rating.
     * ---------------------------------------------------------
     */

    var KP_API_URL = 'https://kinopoiskapiunofficial.tech/';
    var KP_RATING_URL = 'https://rating.kinopoisk.ru/';
    var KP_API_KEY = null;

    function decodeKpKey() {
        if (KP_API_KEY) return KP_API_KEY;

        var input = [
            85, 4, 115, 118, 107, 125, 10, 70,
            85, 67, 82, 14, 32, 110, 102, 43,
            9, 19, 85, 73, 4, 83, 33, 110,
            52, 44, 92, 21, 72, 22, 87, 1,
            118, 32, 100, 127
        ];

        var password = atob('X0tQM3Bhc3N3b3Jk');

        function saltLocal(value) {
            var str = (value || '') + '';
            var hash = 0;

            for (var i = 0; i < str.length; i++) {
                var c = str.charCodeAt(i);

                hash = ((hash << 5) - hash) + c;
                hash = hash & hash;
            }

            var result = '';

            for (
                var j = 32 - 3, k = 0;
                j >= 0;
                k += 3, j -= 3
            ) {
                var x =
                    (((hash >>> k) & 7) << 3) +
                    ((hash >>> j) & 7);

                result += String.fromCharCode(
                    x < 26
                        ? 97 + x
                        : x < 52
                            ? 39 + x
                            : x - 4
                );
            }

            return result;
        }

        var hash = saltLocal('123456789' + password);

        while (hash.length < input.length) {
            hash += hash;
        }

        var result = '';

        for (var n = 0; n < input.length; n++) {
            result += String.fromCharCode(
                input[n] ^ hash.charCodeAt(n)
            );
        }

        KP_API_KEY = result;

        return KP_API_KEY;
    }


    function getKpCache() {
        return Lampa.Storage.cache(
            'kp_rating',
            500,
            {}
        );
    }


    function getKpRatingFromCache(item) {
        if (!item) return -1;

        var id = item.id;

        if (id === undefined || id === null) {
            return -1;
        }

        var cache = getKpCache();
        var entry = cache[String(id)];

        if (!entry) return -1;

        var value = parseFloat(entry.kp);

        return isFinite(value) && value > 0
            ? value
            : -1;
    }


    function getItemKpId(item) {
        if (!item) return '';

        return String(
            item.kp_id ||
            item.kinopoisk_id ||
            item.kinopoiskId ||
            item.filmId ||
            ''
        );
    }


    function kpCleanTitleForSearch(str) {
        str = (str || '') + '';

        return str
            .replace(/[\s.,:;’'`!?]+/g, ' ')
            .trim()
            .replace(/^[ \/\\]+/, '')
            .replace(/[ \/\\]+$/, '')
            .replace(/\+( *[+\/\\])+/g, '+')
            .replace(/([+\/\\] *)+\+/g, '+')
            .replace(/( *[\/\\]+ *)+/g, '+');
    }


    function normalizeKpTitle(str) {
        return (str || '')
            .toString()
            .toLowerCase()
            .replace(/[\s.,:;’'`!?]+/g, ' ')
            .replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-')
            .replace(/ё/g, 'е')
            .trim();
    }


    function titleContainsKp(a, b) {
        a = normalizeKpTitle(a);
        b = normalizeKpTitle(b);

        return !!a &&
            !!b &&
            a.indexOf(b) !== -1;
    }


    function titleEqualsKp(a, b) {
        return normalizeKpTitle(a) === normalizeKpTitle(b);
    }


    function itemYear(item) {
        var date = item && (
            item.release_date ||
            item.first_air_date ||
            item.last_air_date
        );

        var year = parseInt(
            ((date || '') + '').slice(0, 4),
            10
        );

        return isFinite(year)
            ? year
            : 0;
    }


    function chooseKpFilm(items, item) {
        if (!items || !items.length) return null;

        var original =
            item.original_title ||
            item.original_name ||
            '';

        var title = item.title || '';
        var year = itemYear(item);

        var cards = items.slice();

        /*
         * Сначала пытаемся найти фильм по IMDb.
         */

        if (item.imdb_id) {
            var byImdb = cards.filter(function (c) {
                return String(
                    c.imdb_id ||
                    c.imdbId ||
                    ''
                ) === String(item.imdb_id);
            });

            if (byImdb.length) {
                return byImdb[0];
            }
        }

        /*
         * Затем по оригинальному названию.
         */

        if (original) {
            var byOriginal = cards.filter(function (c) {
                return titleContainsKp(
                    c.orig_title ||
                    c.nameOriginal,
                    original
                ) ||
                titleContainsKp(
                    c.en_title ||
                    c.nameEn,
                    original
                ) ||
                titleContainsKp(
                    c.title ||
                    c.ru_title ||
                    c.nameRu,
                    original
                );
            });

            if (byOriginal.length) {
                cards = byOriginal;
            }
        }

        /*
         * Затем по названию.
         */

        if (title) {
            var byTitle = cards.filter(function (c) {
                return titleContainsKp(
                    c.title ||
                    c.ru_title ||
                    c.nameRu,
                    title
                ) ||
                titleContainsKp(
                    c.en_title ||
                    c.nameEn,
                    title
                ) ||
                titleContainsKp(
                    c.orig_title ||
                    c.nameOriginal,
                    title
                );
            });

            if (byTitle.length) {
                cards = byTitle;
            }
        }

        /*
         * Уточняем годом.
         */

        if (cards.length > 1 && year) {
            var byYear = cards.filter(function (c) {
                var y = parseInt(
                    (
                        c.start_date ||
                        c.year ||
                        ''
                    ) + '',
                    10
                );

                return y === year;
            });

            if (byYear.length) {
                cards = byYear;
            }
        }

        /*
         * Если остался ровно один вариант —
         * считаем его найденным.
         */

        if (cards.length !== 1) {
            return null;
        }

        return cards[0];
    }


    function saveKpRating(tmdbId, kp, imdb) {
        var cache = getKpCache();
        var key = String(tmdbId);
        var old = cache[key] || {};

        var kpValue = parseFloat(kp);
        var imdbValue = parseFloat(imdb);

        cache[key] = {
            kp: isFinite(kpValue)
                ? kpValue
                : 0,

            imdb: isFinite(imdbValue)
                ? imdbValue
                : (
                    parseFloat(old.imdb) || 0
                ),

            timestamp: new Date().getTime()
        };

        Lampa.Storage.set(
            'kp_rating',
            cache
        );

        return cache[key];
    }


    function fetchKpRating(item, done) {

        var cached = getKpRatingFromCache(item);

        if (cached >= 0) {
            done(cached);
            return;
        }

        if (
            !item ||
            item.id === undefined ||
            item.id === null
        ) {
            done(-1);
            return;
        }

        var req = new Lampa.Reguest();

        var key = decodeKpKey();

        var headers = {
            headers: {
                'X-API-KEY': key
            }
        };

        var kpId = getItemKpId(item);


        function finishWithKpId(id) {

            if (!id) {
                saveKpRating(
                    item.id,
                    0,
                    0
                );

                done(-1);
                return;
            }

            req.clear();
            req.timeout(10000);

            req.silent(
                KP_API_URL +
                'api/v2.2/films/' +
                encodeURIComponent(id),

                function (data) {

                    var kp = parseFloat(
                        data &&
                        data.ratingKinopoisk
                    );

                    var imdb = parseFloat(
                        data &&
                        data.ratingImdb
                    );

                    if (
                        isFinite(kp) &&
                        kp > 0
                    ) {

                        saveKpRating(
                            item.id,
                            kp,
                            imdb
                        );

                        done(kp);

                    } else {

                        /*
                         * Резервный источник.
                         */

                        req.clear();
                        req.timeout(10000);

                        req["native"](
                            KP_RATING_URL +
                            encodeURIComponent(id) +
                            '.xml',

                            function (str) {

                                try {

                                    var xml = $(
                                        $.parseXML(str)
                                    );

                                    var kpNode =
                                        xml.find(
                                            'kp_rating'
                                        );

                                    var imdbNode =
                                        xml.find(
                                            'imdb_rating'
                                        );

                                    var kpXml =
                                        kpNode.length
                                            ? parseFloat(
                                                kpNode.text()
                                            )
                                            : 0;

                                    var imdbXml =
                                        imdbNode.length
                                            ? parseFloat(
                                                imdbNode.text()
                                            )
                                            : 0;

                                    saveKpRating(
                                        item.id,
                                        kpXml,
                                        imdbXml
                                    );

                                    done(
                                        kpXml > 0
                                            ? kpXml
                                            : -1
                                    );

                                } catch (e) {

                                    saveKpRating(
                                        item.id,
                                        0,
                                        0
                                    );

                                    done(-1);
                                }
                            },

                            function () {

                                saveKpRating(
                                    item.id,
                                    0,
                                    0
                                );

                                done(-1);
                            },

                            false,

                            {
                                dataType: 'text'
                            }
                        );
                    }
                },

                function () {

                    saveKpRating(
                        item.id,
                        0,
                        0
                    );

                    done(-1);
                },

                false,

                headers
            );
        }


        /*
         * Если CUB уже содержит KP ID,
         * сразу используем его.
         */

        if (kpId) {
            finishWithKpId(kpId);
            return;
        }


        /*
         * Иначе ищем фильм по названию.
         */

        var cleanTitle =
            kpCleanTitleForSearch(
                item.title || ''
            );

        var url =
            Lampa.Utils.addUrlComponent(
                KP_API_URL +
                'api/v2.1/films/search-by-keyword',
                'keyword=' +
                encodeURIComponent(cleanTitle)
            );

        req.timeout(15000);

        req.silent(
            url,

            function (json) {

                var items = json && (
                    json.items ||
                    json.films ||
                    []
                );

                var film =
                    chooseKpFilm(
                        items,
                        item
                    );

                var id = film && (
                    film.kp_id ||
                    film.kinopoisk_id ||
                    film.kinopoiskId ||
                    film.filmId
                );

                finishWithKpId(id);
            },

            function () {

                saveKpRating(
                    item.id,
                    0,
                    0
                );

                done(-1);
            },

            false,

            headers
        );
    }


    function loadKpRatings(items, done) {

        var result = [];
        var index = 0;
        var total = items.length;

        function next() {

            if (index >= total) {
                done(result);
                return;
            }

            var item = items[index++];

            fetchKpRating(
                item,
                function (rating) {

                    result.push({
                        item: item,
                        rating: rating
                    });

                    /*
                     * Последовательная загрузка.
                     * Не отправляем одновременно сотни запросов.
                     */

                    setTimeout(
                        next,
                        0
                    );
                }
            );
        }

        next();
    }


    function sortByKpRating(items, direction) {

        return items
            .map(function (item, index) {

                return {
                    item: item,
                    index: index,
                    rating:
                        getKpRatingFromCache(item)
                };
            })

            .sort(function (a, b) {

                /*
                 * Фильмы без рейтинга в конце.
                 */

                if (
                    a.rating < 0 &&
                    b.rating >= 0
                ) {
                    return 1;
                }

                if (
                    a.rating >= 0 &&
                    b.rating < 0
                ) {
                    return -1;
                }

                if (a.rating !== b.rating) {

                    return direction === 'asc'
                        ? a.rating - b.rating
                        : b.rating - a.rating;
                }

                return a.index - b.index;
            })

            .map(function (entry) {
                return entry.item;
            });
    }


    /*
     * ---------------------------------------------------------
     * CUB COLLECTION
     * ---------------------------------------------------------
     */

    function getItems(data) {
        if (!data) return [];

        if (Array.isArray(data.results)) {
            return data.results;
        }

        if (Array.isArray(data.items)) {
            return data.items;
        }

        if (Array.isArray(data.movies)) {
            return data.movies;
        }

        if (Array.isArray(data.data)) {
            return data.data;
        }

        return [];
    }


    function getTotalPages(data) {

        var pages = parseInt(
            data &&
            data.total_pages,
            10
        );

        /*
         * CUB использует 15 как fallback.
         */

        if (
            !isFinite(pages) ||
            pages < 1
        ) {
            pages = 15;
        }

        return Math.min(
            pages,
            100
        );
    }


    function getCollectionId(object) {

        if (!object) return '';

        return String(
            object.url ||
            object.collection ||
            object.id ||
            ''
        );
    }


    function getCollectionTitle(object) {

        return object &&
            object.title
            ? object.title
            : 'Коллекция CUB';
    }


    function cubDomain() {

        if (
            Lampa.Manifest &&
            Lampa.Manifest.cub_domain
        ) {
            return Lampa.Manifest.cub_domain;
        }

        return 'cub.red';
    }


    function apiUrl(
        collectionId,
        page
    ) {

        return Lampa.Utils.protocol() +
            cubDomain() +
            '/api/collections/view/' +
            encodeURIComponent(
                collectionId
            ) +
            '?page=' +
            page;
    }


    function getHeaders() {

        var user =
            Lampa.Storage.get(
                'account',
                '{}'
            );

        if (
            !user ||
            !user.token
        ) {
            return {};
        }

        return {
            headers: {
                token: user.token,
                profile: user.id
            }
        };
    }


    function requestPage(
        collectionId,
        page,
        onSuccess,
        onError
    ) {

        network.silent(
            apiUrl(
                collectionId,
                page
            ),

            onSuccess,
            onError,

            false,

            getHeaders()
        );
    }


    /*
     * Загружаем всю коллекцию.
     */

    function loadAll(
        collectionId,
        done,
        failed
    ) {

        var all = [];
        var firstPage = null;

        function loadPage(page) {

            requestPage(
                collectionId,
                page,

                function (data) {

                    if (!firstPage) {
                        firstPage = data;
                    }

                    all = all.concat(
                        getItems(data)
                    );

                    var totalPages =
                        getTotalPages(
                            firstPage
                        );

                    if (
                        page >= totalPages
                    ) {

                        done(
                            firstPage,
                            all
                        );

                        return;
                    }

                    loadPage(
                        page + 1
                    );
                },

                function () {

                    /*
                     * Если первая страница загрузилась,
                     * но следующая не ответила —
                     * показываем то, что успели получить.
                     */

                    if (
                        firstPage &&
                        all.length
                    ) {

                        done(
                            firstPage,
                            all
                        );

                    } else {

                        failed();
                    }
                }
            );
        }

        loadPage(1);
    }


    /*
     * ---------------------------------------------------------
     * МЕНЮ СОРТИРОВКИ
     * ---------------------------------------------------------
     */

    function showSortMenu(
        collectionId,
        title,
        onSelect
    ) {

        var current =
            getMode(collectionId);

        var items = [

            {
                title:
                    '⭐ TMDB — сначала лучшие',

                selected:
                    current ===
                    'rating_desc',

                mode:
                    'rating_desc'
            },

            {
                title:
                    'TMDB — сначала худшие',

                selected:
                    current ===
                    'rating_asc',

                mode:
                    'rating_asc'
            },

            {
                title:
                    '🎬 Кинопоиск — сначала лучшие',

                selected:
                    current ===
                    'kp_desc',

                mode:
                    'kp_desc'
            },

            {
                title:
                    'Кинопоиск — сначала худшие',

                selected:
                    current ===
                    'kp_asc',

                mode:
                    'kp_asc'
            },

            {
                title:
                    'Исходный порядок CUB',

                selected:
                    current ===
                    'original',

                mode:
                    'original'
            }
        ];


        Lampa.Select.show({

            title:
                'Сортировка коллекции',

            items:
                items,

            onSelect:
                function (item) {

                    if (
                        !item ||
                        !item.mode
                    ) {
                        return;
                    }

                    setMode(
                        collectionId,
                        item.mode
                    );

                    if (onSelect) {
                        onSelect(
                            item.mode
                        );
                    }
                }
        });
    }


    function reloadCollection(
        collectionId,
        title
    ) {

        Lampa.Activity.replace({

            url:
                collectionId,

            title:
                title,

            component:
                'cub_collections_view',

            page:
                1,

            cub_rating_sort_reload:
                Date.now()
        });
    }


    /*
     * ---------------------------------------------------------
     * ИНТЕГРАЦИЯ С СУЩЕСТВУЮЩИМ МЕНЮ LAMPA
     *
     * ВАЖНО:
     *
     * Мы больше НЕ делаем:
     *
     *     event.stopPropagation()
     *
     * и НЕ открываем своё меню непосредственно
     * на hover:long.
     *
     * Вместо этого:
     *
     * 1. ловим факт долгого нажатия;
     * 2. CUB и другие плагины продолжают работать
     *    как раньше;
     * 3. когда вызывается Lampa.Select.show(),
     *    добавляем в его существующий список
     *    один наш пункт.
     *
     * Поэтому пункты других плагинов не должны исчезать.
     * ---------------------------------------------------------
     */

    var currentCollectionContext = null;
    var pendingLongPress = null;
    var selectIntegrationInstalled = false;


    function installSelectIntegration() {

        if (selectIntegrationInstalled) {
            return;
        }

        if (
            !window.Lampa ||
            !Lampa.Select ||
            !Lampa.Select.show
        ) {
            return;
        }

        selectIntegrationInstalled = true;


        /*
         * Capture = true.
         *
         * Это позволяет узнать о long press ДО того,
         * как оригинальный обработчик CUB откроет Select.
         */

        document.addEventListener(
            'hover:long',

            function (event) {

                if (
                    !currentCollectionContext
                ) {
                    return;
                }

                var target =
                    event &&
                    event.target;

                var card =
                    target &&
                    target.closest
                        ? target.closest(
                            '.card'
                        )
                        : null;

                if (!card) {
                    return;
                }

                pendingLongPress = {

                    context:
                        currentCollectionContext,

                    time:
                        Date.now()
                };
            },

            true
        );


        /*
         * Сохраняем оригинальный Lampa.Select.show.
         */

        var originalShow =
            Lampa.Select.show;


        /*
         * Перехватываем только момент показа
         * существующего Select.
         */

        Lampa.Select.show =
            function (params) {

                var pending =
                    pendingLongPress;

                /*
                 * Сразу очищаем.
                 *
                 * Это важно, чтобы наш пункт не попал
                 * в последующее подменю сортировки.
                 */

                pendingLongPress = null;


                /*
                 * Обычный Select —
                 * вообще ничего не меняем.
                 */

                if (
                    !pending ||
                    !params ||
                    !Array.isArray(
                        params.items
                    )
                ) {

                    return originalShow.apply(
                        this,
                        arguments
                    );
                }


                /*
                 * Long press должен быть свежим.
                 */

                if (
                    Date.now() -
                    pending.time >
                    5000
                ) {

                    return originalShow.apply(
                        this,
                        arguments
                    );
                }


                var context =
                    pending.context;


                if (
                    !context ||
                    !context.id
                ) {

                    return originalShow.apply(
                        this,
                        arguments
                    );
                }


                var items =
                    params.items.slice();


                /*
                 * Защита от повторного добавления.
                 */

                var alreadyAdded =
                    items.some(
                        function (item) {

                            return item &&
                                item.__cubRatingSortItem;
                        }
                    );


                if (alreadyAdded) {

                    return originalShow.apply(
                        this,
                        arguments
                    );
                }


                var originalOnSelect =
                    params.onSelect;


                /*
                 * Наш единственный пункт
                 * в существующем меню.
                 */

                var sortItem = {

                    title:
                        '🔀 Сортировка коллекции',

                    separator:
                        true,

                    __cubRatingSortItem:
                        true,

                    onSelect:
                        function () {

                            /*
                             * Небольшая задержка,
                             * чтобы текущий Select успел закрыться.
                             */

                            setTimeout(
                                function () {

                                    showSortMenu(
                                        context.id,
                                        context.title,

                                        function (mode) {

                                            reloadCollection(
                                                context.id,
                                                context.title
                                            );
                                        }
                                    );

                                },
                                50
                            );
                        }
                };


                items.push(
                    sortItem
                );


                /*
                 * Копируем все параметры
                 * оригинального Select.
                 */

                var patched = {};

                for (
                    var key in params
                ) {

                    if (
                        Object.prototype
                            .hasOwnProperty
                            .call(
                                params,
                                key
                            )
                    ) {

                        patched[key] =
                            params[key];
                    }
                }


                patched.items =
                    items;


                /*
                 * Очень важная часть.
                 *
                 * Оригинальный CUB Select имеет свой
                 * onSelect. Если просто добавить наш
                 * item, оригинальный callback может
                 * попытаться обработать его как обычный
                 * пункт меню CUB.
                 *
                 * Поэтому наш пункт отсекаем здесь.
                 */

                patched.onSelect =
                    function (item) {

                        if (
                            item &&
                            item.__cubRatingSortItem
                        ) {

                            if (
                                item.onSelect
                            ) {

                                item.onSelect(
                                    item
                                );
                            }

                            return;
                        }


                        if (
                            originalOnSelect
                        ) {

                            return originalOnSelect(
                                item
                            );
                        }
                    };


                return originalShow.call(
                    this,
                    patched
                );
            };
    }


    /*
     * ---------------------------------------------------------
     * ФОРМИРОВАНИЕ ДАННЫХ КАТЕГОРИИ
     * ---------------------------------------------------------
     */

    function buildCollectionData(
        comp,
        firstPage,
        result,
        mode
    ) {

        var data = {};

        for (
            var key in firstPage
        ) {

            if (
                Object.prototype
                    .hasOwnProperty
                    .call(
                        firstPage,
                        key
                    )
            ) {

                data[key] =
                    firstPage[key];
            }
        }


        data.results =
            result;

        data.total_pages =
            1;

        data.page =
            1;

        data.cub_rating_sorted =
            mode !== 'original';

        data.cub_rating_sort_mode =
            mode;


        comp.build(
            data
        );
    }


    /*
     * ---------------------------------------------------------
     * COMPONENT КОЛЛЕКЦИИ
     * ---------------------------------------------------------
     */

    function makeComponent(object) {

        var comp =
            new Lampa.InteractionCategory(
                object
            );

        var collectionId =
            getCollectionId(
                object
            );

        var collectionTitle =
            getCollectionTitle(
                object
            );


        /*
         * Запоминаем текущую коллекцию.
         *
         * Это используется только для добавления
         * пункта в меню долгого нажатия.
         */

        currentCollectionContext = {

            id:
                collectionId,

            title:
                collectionTitle
        };


        comp.create =
            function () {

                var self =
                    this;


                this.activity.loader(
                    true
                );


                loadAll(

                    collectionId,

                    function (
                        firstPage,
                        allItems
                    ) {

                        var mode =
                            getMode(
                                collectionId
                            );

                        var result =
                            allItems.slice();


                        /*
                         * TMDB.
                         */

                        if (
                            mode ===
                            'rating_desc'
                        ) {

                            result =
                                sortByRating(
                                    result,
                                    'desc'
                                );
                        }


                        if (
                            mode ===
                            'rating_asc'
                        ) {

                            result =
                                sortByRating(
                                    result,
                                    'asc'
                                );
                        }


                        /*
                         * Кинопоиск.
                         *
                         * Сначала получаем недостающие
                         * рейтинги.
                         */

                        if (
                            mode ===
                                'kp_desc' ||
                            mode ===
                                'kp_asc'
                        ) {

                            self.activity.loader(
                                true
                            );


                            loadKpRatings(
                                allItems,

                                function () {

                                    result =
                                        sortByKpRating(

                                            allItems,

                                            mode ===
                                                'kp_asc'
                                                ? 'asc'
                                                : 'desc'
                                        );


                                    buildCollectionData(

                                        self,

                                        firstPage,

                                        result,

                                        mode
                                    );


                                    self.activity.loader(
                                        false
                                    );
                                }
                            );


                            return;
                        }


                        /*
                         * Обычная TMDB-сортировка
                         * или исходный порядок.
                         */

                        buildCollectionData(

                            self,

                            firstPage,

                            result,

                            mode
                        );


                        self.activity.loader(
                            false
                        );
                    },

                    function () {

                        self.activity.loader(
                            false
                        );

                        self.empty();
                    }
                );


                return this.render();
            };


        /*
         * Все страницы уже загрузили сами,
         * поэтому последующий запрос страниц
         * не требуется.
         */

        comp.nextPageReuest =
            function (
                object,
                resolve,
                reject
            ) {

                resolve({

                    results:
                        [],

                    total_pages:
                        1,

                    page:
                        1
                });
            };


        return comp;
    }


    /*
     * ---------------------------------------------------------
     * ЗАПУСК
     * ---------------------------------------------------------
     */

    function startPlugin() {

        network =
            new Lampa.Reguest();


        /*
         * Устанавливаем интеграцию с существующим
         * меню Lampa ДО регистрации нашего component.
         */

        installSelectIntegration();


        /*
         * Регистрируем собственный component
         * с тем же именем, которое использует CUB.
         */

        Lampa.Component.add(
            'cub_collections_view',
            makeComponent
        );


        /*
         * Уведомление показываем только один раз.
         */

        if (
            !Lampa.Storage.get(
                'cub_rating_sort_notice',
                false
            )
        ) {

            Lampa.Storage.set(
                'cub_rating_sort_notice',
                true
            );


            setTimeout(
                function () {

                    Lampa.Noty.show(
                        'CUB: сортировка по TMDB и Кинопоиску доступна в существующем меню долгого нажатия на фильм'
                    );

                },
                1200
            );
        }


        console.log(
            '[CUB Rating Sort] v' +
            VERSION +
            ' loaded'
        );
    }


    /*
     * ---------------------------------------------------------
     * ОЖИДАНИЕ CUB
     * ---------------------------------------------------------
     */

    var attempts = 0;


    function waitForCUB() {

        attempts++;


        if (

            window.Lampa &&

            Lampa.Component &&

            Lampa.InteractionCategory &&

            Lampa.Reguest &&

            Lampa.Storage &&

            Lampa.Activity &&

            Lampa.Manifest &&

            Lampa.Manifest.cub_domain

        ) {

            startPlugin();

            return;
        }


        if (
            attempts < 100
        ) {

            setTimeout(
                waitForCUB,
                250
            );

        } else {

            console.warn(
                '[CUB Rating Sort] CUB Collections не найден'
            );
        }
    }


    if (window.appready) {

        waitForCUB();

    } else {

        Lampa.Listener.follow(
            'app',

            function (event) {

                if (
                    event.type ===
                    'ready'
                ) {

                    waitForCUB();
                }
            }
        );
    }

})();
