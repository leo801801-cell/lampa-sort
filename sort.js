(function () {
    'use strict';

    var VERSION = '1.2.1';

    var SORT_KEY = 'cub_rating_sort_mode';
    var KP_CACHE_KEY = 'kp_rating';

    var SORT_TMDB_DESC = 'tmdb_desc';
    var SORT_TMDB_ASC = 'tmdb_asc';
    var SORT_KP_DESC = 'kp_desc';
    var SORT_KP_ASC = 'kp_asc';
    var SORT_ORIGINAL = 'original';

    var currentCollectionContext = null;
    var pendingLongPress = false;
    var selectPatched = false;

    var network = new Lampa.Reguest();

    function getAccount() {
        try {
            return Lampa.Storage.get('account', '{}');
        } catch (e) {
            return {};
        }
    }

    function getHeaders() {
        var user = getAccount();

        if (!user || !user.token) {
            return {};
        }

        return {
            headers: {
                token: user.token,
                profile: user.id
            }
        };
    }

    function getApiUrl() {
        return Lampa.Utils.protocol() +
            Lampa.Manifest.cub_domain +
            '/api/collections/';
    }

    function getNumber(value) {
        if (value === undefined || value === null || value === '') {
            return -1;
        }

        var number = parseFloat(value);

        if (isNaN(number)) {
            return -1;
        }

        return number;
    }

    function getTmdbRating(item) {
        if (!item) return -1;

        var fields = [
            item.vote_average,
            item.rating,
            item.tmdb_rating,
            item.tmdb_vote_average
        ];

        for (var i = 0; i < fields.length; i++) {
            var value = getNumber(fields[i]);

            if (value >= 0) {
                return value;
            }
        }

        return -1;
    }

    function getImdbId(item) {
        if (!item) return '';

        return item.imdb_id ||
            item.imdb ||
            item.imdbid ||
            item.imdbId ||
            '';
    }

    function getYear(item) {
        if (!item) return '';

        var year =
            item.release_year ||
            item.year ||
            item.release_date ||
            item.first_air_date ||
            '';

        if (typeof year === 'string' && year.length > 4) {
            year = year.substr(0, 4);
        }

        return String(year || '');
    }

    function getTitle(item) {
        if (!item) return '';

        return String(
            item.title ||
            item.name ||
            item.original_title ||
            item.original_name ||
            ''
        );
    }

    function normalizeTitle(title) {
        return String(title || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[^a-zа-я0-9]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getKpCache() {
        try {
            var cache = Lampa.Storage.cache(KP_CACHE_KEY, 500, {});

            if (!cache || typeof cache !== 'object') {
                return {};
            }

            return cache;
        } catch (e) {
            return {};
        }
    }

    function setKpCache(cache) {
        try {
            Lampa.Storage.cache(KP_CACHE_KEY, 500, cache);
        } catch (e) {
            try {
                Lampa.Storage.set(KP_CACHE_KEY, cache);
            } catch (e2) {}
        }
    }

    function getCachedKpRating(item) {
        var cache = getKpCache();

        var keys = [];

        var imdb = getImdbId(item);

        if (imdb) {
            keys.push('imdb:' + imdb);
        }

        if (item && item.kinopoisk_id) {
            keys.push('kp:' + item.kinopoisk_id);
        }

        if (item && item.kp_id) {
            keys.push('kp:' + item.kp_id);
        }

        var title = normalizeTitle(getTitle(item));

        if (title) {
            keys.push('title:' + title + ':' + getYear(item));
            keys.push('title:' + title);
        }

        for (var i = 0; i < keys.length; i++) {
            if (Object.prototype.hasOwnProperty.call(cache, keys[i])) {
                var value = getNumber(cache[keys[i]]);

                if (value >= 0) {
                    return value;
                }
            }
        }

        return -1;
    }

    function saveKpRating(item, rating, kpId) {
        var cache = getKpCache();

        var value = getNumber(rating);

        if (value < 0) {
            return;
        }

        var imdb = getImdbId(item);

        if (imdb) {
            cache['imdb:' + imdb] = value;
        }

        var title = normalizeTitle(getTitle(item));

        if (title) {
            cache['title:' + title + ':' + getYear(item)] = value;
            cache['title:' + title] = value;
        }

        if (kpId) {
            cache['kp:' + kpId] = value;
        }

        if (item) {
            if (item.kinopoisk_id) {
                cache['kp:' + item.kinopoisk_id] = value;
            }

            if (item.kp_id) {
                cache['kp:' + item.kp_id] = value;
            }
        }

        setKpCache(cache);
    }

    function setItemKpRating(item, rating) {
        if (!item) return;

        var value = getNumber(rating);

        if (value < 0) return;

        item.kp_rating = value;
        item.rating_kp = value;
        item.kinopoisk_rating = value;
        item.ratingKinopoisk = value;
    }

    function findExistingKpRating(item) {
        if (!item) return -1;

        var fields = [
            item.kp_rating,
            item.rating_kp,
            item.kinopoisk_rating,
            item.ratingKinopoisk,
            item.kinopoiskRating,
            item.kpRating
        ];

        for (var i = 0; i < fields.length; i++) {
            var value = getNumber(fields[i]);

            if (value >= 0) {
                return value;
            }
        }

        return -1;
    }

    function getKpRating(item) {
        var existing = findExistingKpRating(item);

        if (existing >= 0) {
            return existing;
        }

        return getCachedKpRating(item);
    }

    function decodeSecret(value) {
        try {
            var result = '';
            var salt = 'a';

            for (var i = 0; i < value.length; i++) {
                var code = value.charCodeAt(i);

                if (code >= 65 && code <= 90) {
                    code = ((code - 65 - salt.charCodeAt(i % salt.length) + 65) % 26 + 26) % 26 + 65;
                } else if (code >= 97 && code <= 122) {
                    code = ((code - 97 - salt.charCodeAt(i % salt.length) + 97) % 26 + 26) % 26 + 97;
                }

                result += String.fromCharCode(code);
            }

            return result;
        } catch (e) {
            return value;
        }
    }

    function salt(length) {
        var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var result = '';

        for (var i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        return result;
    }

    /*
     * Kinopoisk API key.
     *
     * The key is intentionally constructed in the same way as the
     * rating.js plugin supplied by the user.
     */
    var KP_KEY_PART_1 = 'd';
    var KP_KEY_PART_2 = 'd';
    var KP_KEY_PART_3 = '4';
    var KP_KEY_PART_4 = '7';
    var KP_KEY_PART_5 = '6';
    var KP_KEY_PART_6 = '8';
    var KP_KEY_PART_7 = '8';
    var KP_KEY_PART_8 = '1';
    var KP_KEY_PART_9 = '2';
    var KP_KEY_PART_10 = '5';

    function getKpApiKey() {
        return [
            KP_KEY_PART_1,
            KP_KEY_PART_2,
            KP_KEY_PART_3,
            KP_KEY_PART_4,
            KP_KEY_PART_5,
            KP_KEY_PART_6,
            KP_KEY_PART_7,
            KP_KEY_PART_8,
            KP_KEY_PART_9,
            KP_KEY_PART_10
        ].join('');
    }

    function kpRequest(url, success, error) {
        var req = new Lampa.Reguest();

        var headers = {
            headers: {
                'X-API-KEY': getKpApiKey(),
                'Content-Type': 'application/json'
            }
        };

        req.silent(
            url,
            success,
            error || function () {},
            false,
            headers
        );
    }

    function chooseKpFilm(items, item) {
        if (!items || !items.length) {
            return null;
        }

        var imdb = getImdbId(item);
        var title = normalizeTitle(getTitle(item));
        var year = getYear(item);

        var best = null;
        var bestScore = -1;

        items.forEach(function (film) {
            if (!film) return;

            var score = 0;

            var filmImdb =
                film.imdbId ||
                film.imdb_id ||
                film.imdb ||
                '';

            if (imdb && filmImdb && imdb === filmImdb) {
                score += 1000;
            }

            var filmName = normalizeTitle(
                film.nameRu ||
                film.nameEn ||
                film.nameOriginal ||
                film.name ||
                ''
            );

            if (title && filmName) {
                if (title === filmName) {
                    score += 500;
                } else if (
                    filmName.indexOf(title) >= 0 ||
                    title.indexOf(filmName) >= 0
                ) {
                    score += 200;
                }
            }

            var filmYear =
                film.year ||
                (film.yearFrom ? film.yearFrom : '') ||
                '';

            if (year && filmYear && String(year) === String(filmYear)) {
                score += 100;
            }

            if (score > bestScore) {
                bestScore = score;
                best = film;
            }
        });

        return best;
    }

    function searchKpFilm(item, callback) {
        var title = getTitle(item);

        if (!title) {
            callback(null);
            return;
        }

        var keyword = encodeURIComponent(title);

        var url =
            'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword' +
            '?keyword=' + keyword +
            '&page=1';

        kpRequest(url, function (data) {
            if (!data || !data.films) {
                callback(null);
                return;
            }

            var film = chooseKpFilm(data.films, item);

            if (!film) {
                callback(null);
                return;
            }

            var kpId =
                film.filmId ||
                film.kinopoiskId ||
                film.kinopoisk_id ||
                film.id;

            var rating =
                film.ratingKinopoisk ||
                film.rating ||
                film.rating_kp;

            rating = getNumber(rating);

            if (rating >= 0) {
                callback({
                    id: kpId,
                    rating: rating
                });
                return;
            }

            if (!kpId) {
                callback(null);
                return;
            }

            getKpDetails(kpId, function (details) {
                if (!details) {
                    callback(null);
                    return;
                }

                var detailsRating =
                    details.ratingKinopoisk ||
                    details.rating ||
                    details.rating_kp;

                detailsRating = getNumber(detailsRating);

                if (detailsRating >= 0) {
                    callback({
                        id: kpId,
                        rating: detailsRating
                    });
                } else {
                    callback(null);
                }
            });
        }, function () {
            callback(null);
        });
    }

    function getKpDetails(kpId, callback) {
        if (!kpId) {
            callback(null);
            return;
        }

        var url =
            'https://kinopoiskapiunofficial.tech/api/v2.2/films/' +
            encodeURIComponent(kpId);

        kpRequest(url, function (data) {
            callback(data || null);
        }, function () {
            callback(null);
        });
    }

    function getKpXml(kpId, callback) {
        if (!kpId) {
            callback(null);
            return;
        }

        var url =
            'https://rating.kinopoisk.ru/' +
            encodeURIComponent(kpId) +
            '.xml';

        try {
            var req = new Lampa.Reguest();

            req.silent(
                url,
                function (data) {
                    if (!data) {
                        callback(null);
                        return;
                    }

                    var text = String(data);

                    var match =
                        text.match(/<kp_rating[^>]*>([\d.,]+)<\/kp_rating>/i) ||
                        text.match(/<rating[^>]*>([\d.,]+)<\/rating>/i);

                    if (!match) {
                        callback(null);
                        return;
                    }

                    var rating = parseFloat(
                        String(match[1]).replace(',', '.')
                    );

                    if (isNaN(rating)) {
                        callback(null);
                    } else {
                        callback(rating);
                    }
                },
                function () {
                    callback(null);
                },
                false
            );
        } catch (e) {
            callback(null);
        }
    }

    function loadOneKpRating(item, callback) {
        var existing = findExistingKpRating(item);

        if (existing >= 0) {
            setItemKpRating(item, existing);
            callback(existing);
            return;
        }

        var cached = getCachedKpRating(item);

        if (cached >= 0) {
            setItemKpRating(item, cached);
            callback(cached);
            return;
        }

        searchKpFilm(item, function (result) {
            if (result && result.rating >= 0) {
                setItemKpRating(item, result.rating);
                saveKpRating(item, result.rating, result.id);
                callback(result.rating);
                return;
            }

            /*
             * If we already know the Kinopoisk ID, try the XML fallback.
             */
            var kpId =
                item &&
                (
                    item.kinopoisk_id ||
                    item.kp_id ||
                    item.kinopoiskId ||
                    item.filmId
                );

            if (kpId) {
                getKpXml(kpId, function (xmlRating) {
                    if (xmlRating !== null && xmlRating >= 0) {
                        setItemKpRating(item, xmlRating);
                        saveKpRating(item, xmlRating, kpId);
                        callback(xmlRating);
                    } else {
                        callback(-1);
                    }
                });
            } else {
                callback(-1);
            }
        });
    }

    function loadKpRatings(items, callback) {
        if (!items || !items.length) {
            callback();
            return;
        }

        var index = 0;

        function next() {
            if (index >= items.length) {
                callback();
                return;
            }

            var item = items[index++];

            loadOneKpRating(item, function () {
                setTimeout(next, 0);
            });
        }

        next();
    }

    function sortItems(items, mode) {
        var copy = items ? items.slice() : [];

        if (mode === SORT_ORIGINAL) {
            return copy;
        }

        copy.sort(function (a, b) {
            var ra;
            var rb;

            if (mode === SORT_KP_DESC || mode === SORT_KP_ASC) {
                ra = getKpRating(a);
                rb = getKpRating(b);
            } else {
                ra = getTmdbRating(a);
                rb = getTmdbRating(b);
            }

            if (ra < 0) ra = -1;
            if (rb < 0) rb = -1;

            if (mode === SORT_TMDB_ASC || mode === SORT_KP_ASC) {
                return ra - rb;
            }

            return rb - ra;
        });

        return copy;
    }

    function getSortMode() {
        try {
            return Lampa.Storage.get(SORT_KEY, SORT_TMDB_DESC);
        } catch (e) {
            return SORT_TMDB_DESC;
        }
    }

    function setSortMode(mode) {
        try {
            Lampa.Storage.set(SORT_KEY, mode);
        } catch (e) {}
    }

    function getSortTitle(mode) {
        if (mode === SORT_TMDB_DESC) {
            return 'TMDB — сначала лучшие';
        }

        if (mode === SORT_TMDB_ASC) {
            return 'TMDB — сначала худшие';
        }

        if (mode === SORT_KP_DESC) {
            return 'Кинопоиск — сначала лучшие';
        }

        if (mode === SORT_KP_ASC) {
            return 'Кинопоиск — сначала худшие';
        }

        return 'Исходный порядок CUB';
    }

    function reloadCollection(collectionId, title) {
        if (!collectionId) {
            return;
        }

        Lampa.Activity.replace({
            url: collectionId,
            title: title || 'Коллекция',
            component: 'cub_collections_view',
            page: 1,
            cub_rating_sort_reload: Date.now()
        });
    }

    function showSortMenu(context, callback) {
        var current = getSortMode();

        var items = [
            {
                title: 'TMDB — сначала лучшие' +
                    (current === SORT_TMDB_DESC ? '  ✓' : ''),
                sort_mode: SORT_TMDB_DESC
            },
            {
                title: 'TMDB — сначала худшие' +
                    (current === SORT_TMDB_ASC ? '  ✓' : ''),
                sort_mode: SORT_TMDB_ASC
            },
            {
                title: 'Кинопоиск — сначала лучшие' +
                    (current === SORT_KP_DESC ? '  ✓' : ''),
                sort_mode: SORT_KP_DESC
            },
            {
                title: 'Кинопоиск — сначала худшие' +
                    (current === SORT_KP_ASC ? '  ✓' : ''),
                sort_mode: SORT_KP_ASC
            },
            {
                title: 'Исходный порядок CUB' +
                    (current === SORT_ORIGINAL ? '  ✓' : ''),
                sort_mode: SORT_ORIGINAL
            }
        ];

        Lampa.Select.show({
            title: 'Сортировка коллекции',
            items: items,

            onSelect: function (item) {
                if (!item || !item.sort_mode) {
                    return;
                }

                setSortMode(item.sort_mode);

                if (callback) {
                    callback(item.sort_mode);
                }

                if (context && context.id) {
                    reloadCollection(
                        context.id,
                        context.title
                    );
                }
            },

            onBack: function () {
                Lampa.Controller.toggle('content');
            }
        });
    }

    /*
     * Интеграция с существующим меню Lampa.
     *
     * ВАЖНО:
     * Мы НЕ перехватываем hover:long у карточки.
     * Сначала открывается оригинальное меню CUB/Lampa,
     * а затем в него добавляется наш пункт.
     */
    function installSelectIntegration() {
        if (selectPatched) {
            return;
        }

        selectPatched = true;

        /*
         * Отслеживаем долгое нажатие, но не отменяем событие.
         * Это позволяет оригинальному CUB меню открыться как раньше.
         */
        document.addEventListener(
            'hover:long',
            function (event) {
                try {
                    var target = event.target;

                    if (!target) {
                        return;
                    }

                    var card = target.closest ?
                        target.closest('.card') :
                        null;

                    if (!card) {
                        return;
                    }

                    if (!currentCollectionContext) {
                        return;
                    }

                    pendingLongPress = true;

                    setTimeout(function () {
                        pendingLongPress = false;
                    }, 1500);
                } catch (e) {}
            },
            true
        );

        if (
            !Lampa.Select ||
            typeof Lampa.Select.show !== 'function'
        ) {
            return;
        }

        var originalShow = Lampa.Select.show;

        Lampa.Select.show = function (params) {
            try {
                /*
                 * Если это не меню после долгого нажатия на карточке
                 * коллекции — ничего не меняем.
                 */
                if (
                    !pendingLongPress ||
                    !currentCollectionContext ||
                    !params ||
                    !params.items
                ) {
                    return originalShow.apply(
                        Lampa.Select,
                        arguments
                    );
                }

                pendingLongPress = false;

                var originalItems = params.items || [];
                var items = originalItems.slice();

                /*
                 * Не добавляем пункт повторно.
                 */
                var alreadyExists = items.some(function (item) {
                    return item &&
                        item.__cubRatingSortItem;
                });

if (!alreadyExists) {
    items.push({
        title: '🔀 Сортировка коллекции',
        __cubRatingSortItem: true,
        onSelect: function () {
            showSortMenu(currentCollectionContext);
        }
    });
}

                var originalOnSelect = params.onSelect;
                var context = currentCollectionContext;

                var patched = {};

                Object.keys(params).forEach(function (key) {
                    patched[key] = params[key];
                });

                patched.items = items;

                patched.onSelect = function (item) {
                    if (
                        item &&
                        item.__cubRatingSortItem
                    ) {
                        showSortMenu(context);
                        return;
                    }

                    if (originalOnSelect) {
                        return originalOnSelect(item);
                    }
                };

                return originalShow.call(
                    Lampa.Select,
                    patched
                );
            } catch (e) {
                return originalShow.apply(
                    Lampa.Select,
                    arguments
                );
            }
        };
    }

    function getCollectionId(object) {
        return object && object.url ?
            String(object.url) :
            '';
    }

    function getCollectionTitle(object) {
        return object && object.title ?
            String(object.title) :
            'Коллекция';
    }

    function buildCollectionData(data, items) {
        var result = {};

        Object.keys(data || {}).forEach(function (key) {
            result[key] = data[key];
        });

        result.results = items;
        result.total_pages = 1;
        result.page = 1;

        return result;
    }

    function loadAllCollectionPages(object, firstData, callback) {
        var firstItems =
            firstData &&
            Array.isArray(firstData.results) ?
            firstData.results.slice() :
            [];

        var totalPages = parseInt(
            firstData &&
            firstData.total_pages ?
            firstData.total_pages :
            1
        );

        if (!totalPages || totalPages < 1) {
            totalPages = 1;
        }

        /*
         * Чтобы не зависеть от некорректного total_pages,
         * ограничиваемся разумным количеством страниц.
         */
        if (totalPages > 100) {
            totalPages = 100;
        }

        if (totalPages <= 1) {
            callback(firstItems);
            return;
        }

        var all = firstItems;
        var page = 2;

        function next() {
            if (page > totalPages) {
                callback(all);
                return;
            }

            var currentPage = page++;

            Api.fullPage(
                object,
                currentPage,
                function (data) {
                    if (
                        data &&
                        Array.isArray(data.results)
                    ) {
                        all = all.concat(data.results);
                    }

                    setTimeout(next, 0);
                },
                function () {
                    setTimeout(next, 0);
                }
            );
        }

        next();
    }

    var Api = {
        fullPage: function (
            object,
            page,
            oncomplete,
            onerror
        ) {
            var url =
                getApiUrl() +
                'view/' +
                object.url +
                '?page=' +
                page;

            network.silent(
                url,
                function (data) {
                    if (!data) {
                        if (onerror) onerror();
                        return;
                    }

                    data.collection = true;
                    data.page = page;

                    if (!data.total_pages) {
                        data.total_pages = 1;
                    }

                    oncomplete(data);
                },
                onerror || function () {},
                false,
                getHeaders()
            );
        },

        full: function (
            object,
            oncomplete,
            onerror
        ) {
            this.fullPage(
                object,
                1,
                oncomplete,
                onerror
            );
        },

        clear: function () {
            try {
                network.clear();
            } catch (e) {}
        }
    };

    function makeComponent(object) {
        var comp = new Lampa.InteractionCategory(object);

        var collectionId = getCollectionId(object);
        var collectionTitle = getCollectionTitle(object);

        currentCollectionContext = {
            id: collectionId,
            title: collectionTitle
        };

        comp.create = function () {
            var self = this;

            self.activity.loader(true);

            Api.full(
                object,
                function (data) {
                    var mode = getSortMode();

                    loadAllCollectionPages(
                        object,
                        data,
                        function (allItems) {
                            function finishBuild() {
                                var sorted =
                                    sortItems(
                                        allItems,
                                        mode
                                    );

                                var result =
                                    buildCollectionData(
                                        data,
                                        sorted
                                    );

                                self.build(result);

                                try {
                                    self.render()
                                        .find('.category-full')
                                        .addClass(
                                            'mapping--grid cols--6'
                                        );
                                } catch (e) {}

                                self.activity.loader(false);
                            }

                            if (
                                mode === SORT_KP_DESC ||
                                mode === SORT_KP_ASC
                            ) {
                                loadKpRatings(
                                    allItems,
                                    finishBuild
                                );
                            } else {
                                finishBuild();
                            }
                        }
                    );
                },
                function () {
                    self.activity.loader(false);
                    self.empty();
                }
            );

            return self.render();
        };

        comp.nextPageReuest = function (
            object,
            resolve,
            reject
        ) {
            Api.fullPage(
                object,
                object.page,
                resolve.bind(comp),
                reject.bind(comp)
            );
        };

        /*
         * Нажатие на карточку коллекции.
         */
        comp.cardRender = function (
            object,
            element,
            card
        ) {
            card.onMenu = false;

            card.onEnter = function () {
                Lampa.Activity.push({
                    url: element.id,
                    title: element.title,
                    component: 'cub_collection',
                    page: 1
                });
            };
        };

        return comp;
    }

    function componentMain(object) {
        var comp = new Lampa.InteractionMain(object);

        comp.create = function () {
            var self = this;

            self.activity.loader(true);

            self.build([]);

            self.activity.loader(false);
        };

        return comp;
    }

    function componentCollection(object) {
        var comp = new Lampa.InteractionCategory(object);

        comp.create = function () {
            var self = this;

            self.activity.loader(true);

            /*
             * Получаем обычную страницу списка коллекций.
             * Эта часть нужна для совместимости с CUB.
             */
            var url =
                getApiUrl() +
                'list?category=' +
                encodeURIComponent(object.url || '') +
                '&page=' +
                (object.page || 1);

            network.silent(
                url,
                function (data) {
                    if (!data) {
                        self.activity.loader(false);
                        self.empty();
                        return;
                    }

                    data.collection = true;

                    if (!data.total_pages) {
                        data.total_pages = 15;
                    }

                    self.build(data);
                    self.activity.loader(false);
                },
                function () {
                    self.activity.loader(false);
                    self.empty();
                },
                false,
                getHeaders()
            );

            return self.render();
        };

        comp.nextPageReuest = function (
            object,
            resolve,
            reject
        ) {
            var url =
                getApiUrl() +
                'list?category=' +
                encodeURIComponent(object.url || '') +
                '&page=' +
                (object.page || 1);

            network.silent(
                url,
                resolve.bind(comp),
                reject.bind(comp),
                false,
                getHeaders()
            );
        };

        return comp;
    }

    function registerComponents() {
        Lampa.Component.add(
            'cub_collections_main',
            componentMain
        );

        Lampa.Component.add(
            'cub_collections_collection',
            componentCollection
        );

        Lampa.Component.add(
            'cub_collections_view',
            makeComponent
        );
    }

    function addMenuButton(manifest) {
        function add() {
            if (
                $('.menu .menu__list')
                    .eq(0)
                    .find('.cub-rating-sort-menu')
                    .length
            ) {
                return;
            }

            var button = $(
                '<li class="menu__item selector cub-rating-sort-menu">' +
                '<div class="menu__ico">' +
                '<svg width="191" height="239" viewBox="0 0 191 239" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path fill-rule="evenodd" clip-rule="evenodd" d="M35.3438 35.3414V26.7477C35.3438 19.9156 38.0594 13.3543 42.8934 8.51604C47.7297 3.68251 54.2874 0.967027 61.125 0.966431H164.25C171.086 0.966431 177.643 3.68206 182.482 8.51604C187.315 13.3524 190.031 19.91 190.031 26.7477V186.471C190.031 189.87 189.022 193.192 187.133 196.018C185.245 198.844 182.561 201.046 179.421 202.347C176.28 203.647 172.825 203.988 169.492 203.325C166.158 202.662 163.096 201.026 160.692 198.623L155.656 193.587V220.846C155.656 224.245 154.647 227.567 152.758 230.393C150.87 233.219 148.186 235.421 145.046 236.722C141.905 238.022 138.45 238.363 135.117 237.7C131.783 237.037 128.721 235.401 126.317 232.998L78.3125 184.993L30.3078 232.998C27.9041 235.401 24.8419 237.037 21.5084 237.7C18.1748 238.363 14.7195 238.022 11.5794 236.722C8.43922 235.421 5.75517 233.219 3.86654 230.393C1.9779 227.567 0.969476 224.245 0.96875 220.846V61.1227C0.96875 54.2906 3.68437 47.7293 8.51836 42.891C13.3547 38.0575 19.9124 35.342 26.75 35.3414H35.3438ZM138.469 220.846V61.1227C138.469 58.8435 137.563 56.6576 135.952 55.046C134.34 53.4343 132.154 52.5289 129.875 52.5289H26.75C24.4708 52.5289 22.2849 53.4343 20.6733 55.046C19.0617 56.6576 18.1562 58.8435 18.1562 61.1227V220.846L66.1609 172.841C69.3841 169.619 73.755 167.809 78.3125 167.809C82.87 167.809 87.2409 169.619 90.4641 172.841L138.469 220.846ZM155.656 169.284L172.844 186.471V26.7477C172.844 24.4685 171.938 22.2826 170.327 20.671C168.715 19.0593 166.529 18.1539 164.25 18.1539H61.125C58.8458 18.1539 56.6599 19.0593 55.0483 20.671C53.4367 22.2826 52.5312 24.4685 52.5312 26.7477V35.3414H129.875C136.711 35.3414 143.268 38.0571 148.107 42.891C152.94 47.7274 155.656 54.285 155.656 61.1227V169.284Z" fill="currentColor"/>' +
                '</svg>' +
                '</div>' +
                '<div class="menu__text">' +
                'Сортировка CUB' +
                '</div>' +
                '</li>'
            );

            button.on(
                'hover:enter',
                function () {
                    showSortMenu(
                        currentCollectionContext
                    );
                }
            );

            $('.menu .menu__list')
                .eq(0)
                .append(button);
        }

        if (window.appready) {
            add();
        } else {
            Lampa.Listener.follow(
                'app',
                function (e) {
                    if (e.type === 'ready') {
                        add();
                    }
                }
            );
        }
    }

    function startPlugin() {
        installSelectIntegration();

        registerComponents();

        addMenuButton({
            name: 'Коллекции'
        });

        console.log(
            'CUB: сортировка коллекции загружена, версия ' +
            VERSION
        );
    }

    if (
        !window.cub_rating_sort_ready
    ) {
        window.cub_rating_sort_ready = true;

        if (
            window.Lampa &&
            Lampa.Manifest &&
            Lampa.Manifest.app_digital >= 242
        ) {
            startPlugin();
        }
    }
})();
