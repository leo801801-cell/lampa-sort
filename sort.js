(function () {
    'use strict';

    /*
     * CUB Collections — сортировка фильмов по рейтингу
     * Версия: 1.0.0
     */

    if (window.CUBCollectionRatingSort) return;
    window.CUBCollectionRatingSort = true;

    var VERSION = '1.0.0';
    var STORAGE_KEY = 'cub_collection_rating_sort';
    var network = null;

    function getStorage() {
        return Lampa.Storage.get(STORAGE_KEY, '{}');
    }

    function setStorage(data) {
        Lampa.Storage.set(STORAGE_KEY, data);
    }

    function getMode(collectionId) {
        var data = getStorage();
        if (!data || typeof data !== 'object') data = {};
        return data[collectionId] || 'rating_desc';
    }

    function setMode(collectionId, mode) {
        var data = getStorage();
        if (!data || typeof data !== 'object') data = {};
        data[collectionId] = mode;
        setStorage(data);
    }

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

    function getItems(data) {
        if (!data) return [];
        if (Array.isArray(data.results)) return data.results;
        if (Array.isArray(data.items)) return data.items;
        if (Array.isArray(data.movies)) return data.movies;
        if (Array.isArray(data.data)) return data.data;
        return [];
    }

    function getTotalPages(data) {
        var pages = parseInt(data && data.total_pages, 10);
        if (!isFinite(pages) || pages < 1) pages = 15;
        return Math.min(pages, 100);
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
        return object && object.title
            ? object.title
            : 'Коллекция CUB';
    }

    function cubDomain() {
        if (Lampa.Manifest && Lampa.Manifest.cub_domain) {
            return Lampa.Manifest.cub_domain;
        }
        return 'cub.red';
    }

    function apiUrl(collectionId, page) {
        return Lampa.Utils.protocol() +
            cubDomain() +
            '/api/collections/view/' +
            encodeURIComponent(collectionId) +
            '?page=' +
            page;
    }

    function getHeaders() {
        var user = Lampa.Storage.get('account', '{}');
        if (!user || !user.token) return {};
        return {
            headers: {
                token: user.token,
                profile: user.id
            }
        };
    }

    function requestPage(collectionId, page, onSuccess, onError) {
        network.silent(
            apiUrl(collectionId, page),
            onSuccess,
            onError,
            false,
            getHeaders()
        );
    }

    function loadAll(collectionId, done, failed) {
        var all = [];
        var firstPage = null;

        function loadPage(page) {
            requestPage(collectionId, page, function (data) {
                if (!firstPage) firstPage = data;
                all = all.concat(getItems(data));
                var totalPages = getTotalPages(firstPage);

                if (page >= totalPages) {
                    done(firstPage, all);
                    return;
                }
                loadPage(page + 1);
            }, function () {
                if (firstPage && all.length) done(firstPage, all);
                else failed();
            });
        }

        loadPage(1);
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
                if (a.rating < 0 && b.rating >= 0) return 1;
                if (a.rating >= 0 && b.rating < 0) return -1;

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

    function showSortMenu(collectionId, title) {
        Lampa.Select.show({
            title: 'Сортировка коллекции',
            items: [
                {
                    title: '⭐ По рейтингу — сначала лучшие',
                    mode: 'rating_desc'
                },
                {
                    title: 'По рейтингу — сначала худшие',
                    mode: 'rating_asc'
                },
                {
                    title: 'Исходный порядок CUB',
                    mode: 'original'
                }
            ],
            onSelect: function (item) {
                if (!item || !item.mode) return;
                setMode(collectionId, item.mode);
                Lampa.Activity.replace({
                    url: collectionId,
                    title: title,
                    component: 'cub_collections_view',
                    page: 1
                });
            },
            onBack: function () {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function installCardHooks(comp, collectionId, title) {
        var tries = 0;

        function scan() {
            tries++;
            var render = comp.render && comp.render();

            if (render && render.find) {
                render.find('.card.selector').each(function () {
                    var card = this;
                    if (card.__cubRatingSortAttached) return;
                    card.__cubRatingSortAttached = true;

                    $(card).on(
                        'hover:long.cub_rating_sort',
                        function (event) {
                            if (event && event.stopPropagation) {
                                event.stopPropagation();
                            }
                            showSortMenu(collectionId, title);
                        }
                    );
                });
            }

            if (tries < 20) {
                setTimeout(scan, 150);
            }
        }

        scan();
    }

    function makeComponent(object) {
        var comp = new Lampa.InteractionCategory(object);
        var collectionId = getCollectionId(object);
        var collectionTitle = getCollectionTitle(object);

        comp.create = function () {
            var self = this;
            this.activity.loader(true);

            loadAll(collectionId, function (firstPage, allItems) {
                var mode = getMode(collectionId);
                var result = allItems.slice();

                var ratedCount = allItems.filter(function (item) {
                    return getRating(item) >= 0;
                }).length;

                if (mode === 'rating_desc') {
                    result = sortByRating(result, 'desc');
                } else if (mode === 'rating_asc') {
                    result = sortByRating(result, 'asc');
                }

                if (mode !== 'original' && allItems.length && ratedCount === 0) {
                    setTimeout(function () {
                        Lampa.Noty.show('CUB не передал рейтинг фильмов — сортировка невозможна');
                    }, 300);
                }

                var data = {};
                for (var key in firstPage) {
                    if (Object.prototype.hasOwnProperty.call(firstPage, key)) {
                        data[key] = firstPage[key];
                    }
                }

                data.results = result;
                data.total_pages = 1;
                data.page = 1;

                self.build(data);
                installCardHooks(self, collectionId, collectionTitle);
                self.activity.loader(false);

            }, function () {
                self.activity.loader(false);
                self.empty();
            });

            return this.render();
        };

        comp.nextPageReuest = function (object, resolve) {
            resolve({
                results: [],
                total_pages: 1,
                page: 1
            });
        };

        return comp;
    }

    function startPlugin() {
        network = new Lampa.Reguest();
        Lampa.Component.add('cub_collections_view', makeComponent);
        console.log('[CUB Rating Sort] v' + VERSION + ' loaded');
        Lampa.Noty.show('CUB: сортировка доступна долгим нажатием на фильм');
    }

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

        if (attempts < 100) {
            setTimeout(waitForCUB, 250);
        } else {
            console.warn('[CUB Rating Sort] CUB Collections не найден');
        }
    }

    if (window.appready) {
        waitForCUB();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                waitForCUB();
            }
        });
    }
})();
