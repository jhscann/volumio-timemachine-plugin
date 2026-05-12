'use strict';

var libQ = require('kew');
var fs = require('fs');
var path = require('path');
var net = require('net');
var http = require('http');
var crypto = require('crypto');
var Config = require('v-conf');

module.exports = ControllerTimeMachine;

var PLUGIN_NAME = 'timemachine';
var DISPLAY_NAME = 'Time Machine';
var URI_VERSION = 'v7';
var ROOT_URI = 'timemachine';
var URI_PREFIX = ROOT_URI + '/' + URI_VERSION;
var DEFAULT_MPD_HOST = '127.0.0.1';
var DEFAULT_MPD_PORT = 6600;
var DEFAULT_MPD_PATHS = 'NAS/NAS/Flac,NAS/NAS/Vinyl';
var DEFAULT_MAX_RANDOM_TRACKS = 50;
var DEFAULT_RANDOM_ALBUMS_COUNT = 3;
var SOURCE_ICON_FILE = 'icon.png';
var REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
var DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

function ControllerTimeMachine(context) {
  this.context = context;
  this.commandRouter = this.context.coreCommand;
  this.logger = this.context.logger;
  this.configManager = this.context.configManager;
  this.config = null;
  this.cacheDir = '/data/configuration/music_service/timemachine';
  this.cacheFile = path.join(this.cacheDir, 'library.json');
  this.library = emptyLibrary();
  this.buildInProgress = false;
}

ControllerTimeMachine.prototype.onVolumioStart = function () {
  var configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
  this.config = new Config();
  this.config.loadFile(configFile);
  return libQ.resolve();
};

ControllerTimeMachine.prototype.onStart = function () {
  this.ensureCacheDir();
  this.addToBrowseSources();
  this.loadCache();
  this.logger.info('[timemachine] plugin startup');
  this.logger.info('[timemachine] configured MPD library paths: ' + this.getConfiguredMpdPaths().join(', '));
  if (!this.library || !this.library.tracks || this.library.tracks.length === 0) {
    this.logger.info('[timemachine] no library cache loaded; use plugin settings to build MPD index');
  } else {
    this.logger.info('[timemachine] loaded cache with ' + this.library.tracks.length + ' tracks');
  }
  return libQ.resolve();
};

ControllerTimeMachine.prototype.onStop = function () {
  return libQ.resolve();
};

ControllerTimeMachine.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

ControllerTimeMachine.prototype.addToBrowseSources = function () {
  this.commandRouter.volumioAddToBrowseSources({
    name: DISPLAY_NAME,
    uri: ROOT_URI,
    albumart: buildSourceIconUri(),
    plugin_type: 'music_service',
    plugin_name: PLUGIN_NAME
  });
};

ControllerTimeMachine.prototype.getUIConfig = function () {
  var defer = libQ.defer();
  var langCode = this.commandRouter.sharedVars.get('language_code') || 'en';
  var self = this;

  this.commandRouter.i18nJson(
    __dirname + '/i18n/strings_' + langCode + '.json',
    __dirname + '/i18n/strings_en.json',
    __dirname + '/UIConfig.json'
  )
  .then(function (uiconf) {
    try {
      setUIConfigValue(uiconf, 'mpdPaths', self.getConfiguredMpdPaths().join(','));
      setUIConfigValue(uiconf, 'maxRandomTracks', String(self.getConfiguredMaxRandomTracks()));
      setUIConfigValue(uiconf, 'randomAlbumsCount', String(self.getConfiguredRandomAlbumsCount()));
      setUIConfigValue(uiconf, 'includeMissingYear', String(self.getConfiguredIncludeMissingYear()));
    } catch (e) {
      self.logger.warn('[timemachine] Could not populate settings UI: ' + e.message);
    }
    defer.resolve(uiconf);
  })
  .fail(function () {
    defer.reject(new Error('Unable to load UI config'));
  });

  return defer.promise;
};

ControllerTimeMachine.prototype.saveSettings = function (data) {
  var self = this;
  var submittedMpdPaths = getSubmittedValue(data, 'mpdPaths');
  var submittedMaxRandomTracks = getSubmittedValue(data, 'maxRandomTracks');
  var submittedRandomAlbumsCount = getSubmittedValue(data, 'randomAlbumsCount');
  var submittedIncludeMissingYear = getSubmittedValue(data, 'includeMissingYear');

  if (submittedMpdPaths !== undefined) this.config.set('mpdPaths', String(submittedMpdPaths));
  if (submittedMaxRandomTracks !== undefined) this.config.set('maxRandomTracks', parseInt(submittedMaxRandomTracks, 10) || DEFAULT_MAX_RANDOM_TRACKS);
  if (submittedRandomAlbumsCount !== undefined) this.config.set('randomAlbumsCount', parseInt(submittedRandomAlbumsCount, 10) || DEFAULT_RANDOM_ALBUMS_COUNT);
  if (submittedIncludeMissingYear !== undefined) this.config.set('includeMissingYear', parseBoolean(submittedIncludeMissingYear));
  this.config.save();

  this.logger.info('[timemachine] settings saved; mpdPaths=' + this.getConfiguredMpdPaths().join(', ') + ', maxRandomTracks=' + this.getConfiguredMaxRandomTracks() + ', randomAlbumsCount=' + this.getConfiguredRandomAlbumsCount() + ', includeMissingYear=' + this.getConfiguredIncludeMissingYear());

  if (this.buildInProgress) {
    this.commandRouter.pushToastMessage('warning', DISPLAY_NAME, 'MPD index build is already running.');
    return libQ.resolve();
  }

  this.commandRouter.pushToastMessage('info', DISPLAY_NAME, 'Building MPD index. Watch the Volumio log for progress.');
  setTimeout(function () {
    self.buildIndex().then(function () {
      self.commandRouter.pushToastMessage('success', DISPLAY_NAME, 'MPD index built: ' + self.library.tracks.length + ' tracks.');
    }).fail(function (e) {
      self.logger.error('[timemachine] MPD index build failed: ' + (e.stack || e.message));
      self.commandRouter.pushToastMessage('error', DISPLAY_NAME, 'MPD index build failed: ' + e.message);
    });
  }, 50);
  return libQ.resolve();
};

ControllerTimeMachine.prototype.handleBrowseUri = function (curUri) {
  this.logger.info('[timemachine] handleBrowseUri: ' + curUri);

  if (curUri === ROOT_URI) return this.listRoot();
  if (curUri === URI_PREFIX + '/report') return this.listReport();
  if (curUri === URI_PREFIX + '/missing') return this.listDecadeActions('Missing Year');

  var decadeMatch = curUri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/decade/([^/]+)$'));
  if (decadeMatch) return this.listDecadeActions(decodeURIComponent(decadeMatch[1]));

  var actionMatch = curUri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/decade/([^/]+)/(random-tracks|random-albums)(?:/[^/]+)?$')) || curUri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/decade/([^/]+)/(albums|tracks)$'));
  if (actionMatch) {
    var decade = decodeURIComponent(actionMatch[1]);
    var action = actionMatch[2];
    if (action === 'random-tracks') return this.playRandomTracks(decade);
    if (action === 'random-albums') return this.playRandomAlbums(decade);
    if (action === 'albums') return this.listAlbums(decade);
    if (action === 'tracks') return this.listTracks(decade);
  }

  var missingActionMatch = curUri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/missing/(random-tracks|random-albums)(?:/[^/]+)?$')) || curUri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/missing/(albums|tracks)$'));
  if (missingActionMatch) {
    var missingAction = missingActionMatch[1];
    if (missingAction === 'random-tracks') return this.playRandomTracks('Missing Year');
    if (missingAction === 'random-albums') return this.playRandomAlbums('Missing Year');
    if (missingAction === 'albums') return this.listAlbums('Missing Year');
    if (missingAction === 'tracks') return this.listTracks('Missing Year');
  }

  var albumMatch = curUri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/album/([^/]+)$'));
  if (albumMatch) return this.listAlbumTracks(decodeURIComponent(albumMatch[1]));

  return libQ.resolve(this.emptyNavigation('Unknown Time Machine item', ROOT_URI));
};

ControllerTimeMachine.prototype.explodeUri = function (uri) {
  this.logger.info('[timemachine] explodeUri: ' + uri);
  var m = uri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/decade/([^/]+)/(random-tracks|random-albums)(?:/[^/]+)?$'));
  if (m) {
    var decade = decodeURIComponent(m[1]);
    if (m[2] === 'random-tracks') { var rt = this.getRandomTrackItems(decade); this.logger.info('[timemachine] explode random-tracks for ' + decade + ': ' + rt.length + ' item(s); first=' + (rt[0] ? rt[0].uri : '(none)')); return libQ.resolve(rt); }
    if (m[2] === 'random-albums') { var ra = this.getRandomAlbumTrackItems(decade); this.logger.info('[timemachine] explode random-albums for ' + decade + ': ' + ra.length + ' item(s); first=' + (ra[0] ? ra[0].uri : '(none)')); return libQ.resolve(ra); }
  }
  var mm = uri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/missing/(random-tracks|random-albums)(?:/[^/]+)?$'));
  if (mm) {
    if (mm[1] === 'random-tracks') return libQ.resolve(this.getRandomTrackItems('Missing Year'));
    if (mm[1] === 'random-albums') return libQ.resolve(this.getRandomAlbumTrackItems('Missing Year'));
  }
  var albumMatch = uri.match(new RegExp('^' + escapeRegExp(URI_PREFIX) + '/album/([^/]+)$'));
  if (albumMatch) return libQ.resolve(this.trackItemsForAlbum(decodeURIComponent(albumMatch[1])));
  return libQ.resolve([]);
};

ControllerTimeMachine.prototype.search = function (query) {
  var q = String(query || '').toLowerCase();
  var items = (this.library.tracks || []).filter(function (t) {
    return ((t.title || '') + ' ' + (t.artist || '') + ' ' + (t.album || '') + ' ' + (t.albumArtist || '')).toLowerCase().indexOf(q) !== -1;
  }).slice(0, 100).map(trackToMpdItem);

  return libQ.resolve({
    title: DISPLAY_NAME,
    icon: 'fa fa-clock-o',
    albumart: buildSourceIconUri(),
    availableListViews: ['list'],
    items: items
  });
};

ControllerTimeMachine.prototype.listRoot = function () {
  var self = this;
  var items = DECADES.map(function (d) {
    var count = self.countTracksForDecade(d);
    return browseOnly({
      service: PLUGIN_NAME,
      type: 'folder',
      title: d,
      artist: count + ' tracks',
      albumart: buildSourceIconUri(),
      icon: 'fa fa-calendar',
      uri: URI_PREFIX + '/decade/' + encodeURIComponent(d)
    });
  });

  items.push(browseOnly({
    service: PLUGIN_NAME,
    type: 'folder',
    title: 'Missing Year',
    artist: this.countTracksForDecade('Missing Year') + ' tracks',
    albumart: buildSourceIconUri(),
    icon: 'fa fa-question-circle',
    uri: URI_PREFIX + '/missing'
  }));

  items.push(browseOnly({
    service: PLUGIN_NAME,
    type: 'folder',
    title: 'Library Report',
    artist: this.library && this.library.meta && this.library.meta.scannedAt ? 'Last indexed ' + this.library.meta.scannedAt : 'No index yet',
    albumart: buildSourceIconUri(),
    icon: 'fa fa-bar-chart',
    uri: URI_PREFIX + '/report'
  }));

  if (!this.library || !this.library.tracks || this.library.tracks.length === 0) {
    items.unshift(browseOnly({
      service: PLUGIN_NAME,
      type: 'folder',
      title: 'Library not indexed yet',
      artist: 'Open plugin settings and use Save and rebuild MPD index',
      icon: 'fa fa-info-circle',
      uri: URI_PREFIX + '/report'
    }));
  }

  return libQ.resolve({
    navigation: {
      prev: { uri: '/' },
      lists: [browseList({
        title: DISPLAY_NAME,
        icon: 'fa fa-clock-o',
        availableListViews: ['list'],
        items: items
      })]
    }
  });
};

ControllerTimeMachine.prototype.listDecadeActions = function (decade) {
  var base = decade === 'Missing Year' ? URI_PREFIX + '/missing' : URI_PREFIX + '/decade/' + encodeURIComponent(decade);
  var count = this.countTracksForDecade(decade);
  var items = [
    browseOnly({ service: PLUGIN_NAME, type: 'folder', title: 'Play Random Tracks', artist: count + ' matching tracks', albumart: buildSourceIconUri(), icon: 'fa fa-random', uri: randomActionUri(base, 'random-tracks') }),
    browseOnly({ service: PLUGIN_NAME, type: 'folder', title: 'Play Random Albums', artist: this.countAlbumsForDecade(decade) + ' matching albums', albumart: buildSourceIconUri(), icon: 'fa fa-random', uri: randomActionUri(base, 'random-albums') }),
    browseOnly({ service: PLUGIN_NAME, type: 'folder', title: 'Browse Albums', artist: this.countAlbumsForDecade(decade) + ' albums', icon: 'fa fa-folder-open-o', uri: base + '/albums' }),
    browseOnly({ service: PLUGIN_NAME, type: 'folder', title: 'Browse Tracks', artist: count + ' tracks', icon: 'fa fa-music', uri: base + '/tracks' })
  ];

  return libQ.resolve({
    navigation: {
      prev: { uri: ROOT_URI },
      lists: [browseList({
        title: decade,
        icon: 'fa fa-calendar',
        availableListViews: ['list'],
        items: items
      })]
    }
  });
};

ControllerTimeMachine.prototype.listAlbums = function (decade) {
  var albums = this.getAlbumsForDecade(decade);
  var items = albums.map(albumToBrowseItem);
  return libQ.resolve({
    navigation: {
      prev: { uri: decade === 'Missing Year' ? URI_PREFIX + '/missing' : URI_PREFIX + '/decade/' + encodeURIComponent(decade) },
      lists: [browseList({ title: decade + ' Albums', icon: 'fa fa-folder-open-o', availableListViews: ['list', 'grid'], items: items })]
    }
  });
};

ControllerTimeMachine.prototype.listTracks = function (decade) {
  var tracks = this.getTracksForDecade(decade).slice().sort(trackSort);
  var items = tracks.map(trackToMpdItem);
  return libQ.resolve({
    navigation: {
      prev: { uri: decade === 'Missing Year' ? URI_PREFIX + '/missing' : URI_PREFIX + '/decade/' + encodeURIComponent(decade) },
      lists: [browseList({ title: decade + ' Tracks', icon: 'fa fa-music', availableListViews: ['list'], items: items })]
    }
  });
};

ControllerTimeMachine.prototype.listAlbumTracks = function (albumId) {
  var tracks = this.trackItemsForAlbum(albumId);
  var title = 'Album';
  if (tracks.length > 0) title = (tracks[0].artist ? tracks[0].artist + ' - ' : '') + (tracks[0].album || 'Album');
  return libQ.resolve({
    navigation: {
      prev: { uri: ROOT_URI },
      lists: [browseList({ title: title, icon: 'fa fa-music', availableListViews: ['list'], items: tracks })]
    }
  });
};

ControllerTimeMachine.prototype.listReport = function () {
  var meta = this.library.meta || {};
  var items = [];
  items.push(reportItem('Source', meta.source || 'mpd'));
  items.push(reportItem('Last indexed', meta.scannedAt || 'Never'));
  items.push(reportItem('MPD paths', (meta.mpdPaths || this.getConfiguredMpdPaths()).join(', ')));
  items.push(reportItem('Tracks', String(meta.trackCount || 0)));
  items.push(reportItem('Albums', String(meta.albumCount || 0)));
  DECADES.forEach(function (d) { items.push(reportItem(d, String((meta.decadeCounts && meta.decadeCounts[d]) || 0))); });
  items.push(reportItem('Missing Year', String(meta.missingYearCount || 0)));

  return libQ.resolve({
    navigation: {
      prev: { uri: ROOT_URI },
      lists: [browseList({ title: 'Library Report', icon: 'fa fa-bar-chart', availableListViews: ['list'], items: items })]
    }
  });
};

ControllerTimeMachine.prototype.listGeneratedRandomTracks = function (decade) {
  var items = this.getRandomTrackItems(decade);
  this.logger.info('[timemachine] generated random tracks for ' + decade + ': ' + items.length + ' item(s); first=' + (items[0] ? items[0].uri : '(none)'));
  return libQ.resolve({
    navigation: {
      prev: { uri: decade === 'Missing Year' ? URI_PREFIX + '/missing' : URI_PREFIX + '/decade/' + encodeURIComponent(decade) },
      lists: [browseList({ title: 'Random Tracks - ' + decade, icon: 'fa fa-random', availableListViews: ['list'], items: items })]
    }
  });
};

ControllerTimeMachine.prototype.listGeneratedRandomAlbums = function (decade) {
  var items = this.getRandomAlbumTrackItems(decade);
  this.logger.info('[timemachine] generated random album tracks for ' + decade + ': ' + items.length + ' item(s); first=' + (items[0] ? items[0].uri : '(none)'));
  return libQ.resolve({
    navigation: {
      prev: { uri: decade === 'Missing Year' ? URI_PREFIX + '/missing' : URI_PREFIX + '/decade/' + encodeURIComponent(decade) },
      lists: [browseList({ title: 'Random Albums - ' + decade, icon: 'fa fa-random', availableListViews: ['list'], items: items })]
    }
  });
};

ControllerTimeMachine.prototype.playRandomTracks = function (decade) {
  var self = this;
  var items = this.getRandomTrackItems(decade);
  this.logger.info('[timemachine] volumio play random-tracks for ' + decade + ': first five=' + items.slice(0,5).map(function (i) { return i.uri; }).join(' | '));
  return this.replaceVolumioQueue(items).then(function () {
    self.commandRouter.pushToastMessage('success', DISPLAY_NAME, 'Playing ' + items.length + ' random tracks from ' + decade + '.');
    return self.listDecadeActions(decade);
  }).fail(function (e) {
    self.logger.error('[timemachine] Volumio queue playback failed: ' + (e.stack || e.message));
    self.commandRouter.pushToastMessage('error', DISPLAY_NAME, e.message);
    return self.listDecadeActions(decade);
  });
};

ControllerTimeMachine.prototype.playRandomAlbums = function (decade) {
  var self = this;
  var items = this.getRandomAlbumTrackItems(decade);
  this.logger.info('[timemachine] volumio play random-albums for ' + decade + ': first five=' + items.slice(0,5).map(function (i) { return i.uri; }).join(' | '));
  return this.replaceVolumioQueue(items).then(function () {
    self.commandRouter.pushToastMessage('success', DISPLAY_NAME, 'Playing random albums from ' + decade + '.');
    return self.listDecadeActions(decade);
  }).fail(function (e) {
    self.logger.error('[timemachine] Volumio queue playback failed: ' + (e.stack || e.message));
    self.commandRouter.pushToastMessage('error', DISPLAY_NAME, e.message);
    return self.listDecadeActions(decade);
  });
};

ControllerTimeMachine.prototype.buildIndex = function () {
  var self = this;
  var defer = libQ.defer();
  var mpdPaths = this.getConfiguredMpdPaths();
  var allTracks = [];

  this.buildInProgress = true;
  this.logger.info('[timemachine] MPD index build start: ' + mpdPaths.join(', '));

  promiseSeries(mpdPaths, function (mpdPath) {
    self.logger.info('[timemachine] querying MPD path: ' + mpdPath);
    return mpdRequest('listallinfo ' + mpdQuote(mpdPath), { logger: self.logger }).then(function (response) {
      var fileLines = response.split(/\r?\n/).filter(function (l) { return l.indexOf('file: ') === 0; });
      self.logger.info('[timemachine] MPD path response bytes: ' + Buffer.byteLength(response, 'utf8'));
      self.logger.info('[timemachine] MPD path raw file-line count: ' + fileLines.length);
      self.logger.info('[timemachine] MPD path first file: ' + (fileLines[0] || '(none)'));
      self.logger.info('[timemachine] MPD path last file: ' + (fileLines[fileLines.length - 1] || '(none)'));
      var parsed = parseMpdListAllInfo(response, mpdPath);
      self.logger.info('[timemachine] MPD path parsed: ' + mpdPath + ' (' + parsed.length + ' tracks)');
      allTracks = allTracks.concat(parsed);
    });
  }).then(function () {
    var seen = {};
    var tracks = [];
    allTracks.forEach(function (t) {
      if (!t.mpdPath || seen[t.mpdPath]) return;
      seen[t.mpdPath] = true;
      tracks.push(t);
    });
    tracks.sort(trackSort);
    self.library = buildLibrary(tracks, mpdPaths);
    self.saveCache();
    self.logger.info('[timemachine] track count: ' + self.library.meta.trackCount);
    self.logger.info('[timemachine] album count: ' + self.library.meta.albumCount);
    self.logger.info('[timemachine] decade counts: ' + JSON.stringify(self.library.meta.decadeCounts));
    self.logger.info('[timemachine] missing-year count: ' + self.library.meta.missingYearCount);
    self.logger.info('[timemachine] MPD index build completed');
    self.buildInProgress = false;
    defer.resolve();
  }).fail(function (e) {
    self.buildInProgress = false;
    defer.reject(e);
  });

  return defer.promise;
};


ControllerTimeMachine.prototype.replaceVolumioQueue = function (items) {
  if (!items || items.length === 0) return libQ.reject(new Error('No matching tracks found.'));
  var self = this;
  var first = withQueueMetadata(items[0]);
  var rest = items.slice(1).map(withQueueMetadata);
  this.logger.info('[timemachine] replacing Volumio queue with ' + items.length + ' item(s) via local REST API');
  this.logger.info('[timemachine] replaceAndPlay queue item: ' + JSON.stringify(summariseQueueItem(first)));

  return postVolumioApi('/api/v1/replaceAndPlay', first).then(function (replaceResult) {
    self.logger.info('[timemachine] replaceAndPlay result: ' + summariseApiResult(replaceResult));
    var p = libQ.resolve();
    rest.forEach(function (item, index) {
      p = p.then(function () {
        if (index < 4) self.logger.info('[timemachine] addToQueue queue item #' + (index + 2) + ': ' + JSON.stringify(summariseQueueItem(item)));
        return postVolumioApi('/api/v1/addToQueue', item).then(function (addResult) {
          if (index < 4) self.logger.info('[timemachine] addToQueue result #' + (index + 2) + ': ' + summariseApiResult(addResult));
        });
      });
    });
    return p;
  }).then(function () {
    self.logger.info('[timemachine] Volumio queue replacement completed: ' + items.length + ' item(s)');
  });
};

ControllerTimeMachine.prototype.replaceMpdQueue = function (paths) {
  if (!paths || paths.length === 0) return libQ.reject(new Error('No matching tracks found.'));
  var lines = ['command_list_begin', 'clear'];
  paths.forEach(function (p) { lines.push('add ' + mpdQuote(p)); });
  lines.push('play');
  lines.push('command_list_end');
  this.logger.info('[timemachine] replacing MPD queue with ' + paths.length + ' tracks');
  return mpdRequest(lines.join('\n'), { logger: this.logger, timeoutMs: REQUEST_TIMEOUT_MS });
};

ControllerTimeMachine.prototype.ensureCacheDir = function () {
  try {
    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
  } catch (e) {
    this.logger.warn('[timemachine] could not create cache dir: ' + e.message);
  }
};

ControllerTimeMachine.prototype.loadCache = function () {
  try {
    if (!fs.existsSync(this.cacheFile)) {
      this.library = emptyLibrary();
      return;
    }
    var parsed = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    this.library = normaliseLibrary(parsed);
  } catch (e) {
    this.logger.warn('[timemachine] could not load cache: ' + e.message);
    this.library = emptyLibrary();
  }
};

ControllerTimeMachine.prototype.saveCache = function () {
  this.ensureCacheDir();
  fs.writeFileSync(this.cacheFile, JSON.stringify(this.library, null, 2), 'utf8');
};

ControllerTimeMachine.prototype.getConfiguredMpdPaths = function () {
  return String(this.config.get('mpdPaths') || DEFAULT_MPD_PATHS).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
};

ControllerTimeMachine.prototype.getConfiguredMaxRandomTracks = function () {
  return parseInt(this.config.get('maxRandomTracks') || DEFAULT_MAX_RANDOM_TRACKS, 10) || DEFAULT_MAX_RANDOM_TRACKS;
};

ControllerTimeMachine.prototype.getConfiguredRandomAlbumsCount = function () {
  return parseInt(this.config.get('randomAlbumsCount') || DEFAULT_RANDOM_ALBUMS_COUNT, 10) || DEFAULT_RANDOM_ALBUMS_COUNT;
};

ControllerTimeMachine.prototype.getConfiguredIncludeMissingYear = function () {
  return parseBoolean(this.config.get('includeMissingYear'));
};

ControllerTimeMachine.prototype.getTracksForDecade = function (decade) {
  return (this.library.tracks || []).filter(function (t) { return t.decade === decade; });
};

ControllerTimeMachine.prototype.countTracksForDecade = function (decade) {
  return this.getTracksForDecade(decade).length;
};

ControllerTimeMachine.prototype.countAlbumsForDecade = function (decade) {
  return this.getAlbumsForDecade(decade).length;
};

ControllerTimeMachine.prototype.getAlbumsForDecade = function (decade) {
  var map = {};
  this.getTracksForDecade(decade).forEach(function (t) {
    if (!map[t.albumKey]) {
      map[t.albumKey] = {
        id: t.albumKey,
        artist: t.albumArtist || t.artist || '',
        album: t.album || '(Unknown Album)',
        year: t.year,
        decade: t.decade,
        tracks: []
      };
    }
    map[t.albumKey].tracks.push(t);
  });
  return Object.keys(map).map(function (k) { return map[k]; }).sort(albumSort);
};

ControllerTimeMachine.prototype.trackItemsForAlbum = function (albumId) {
  return (this.library.tracks || []).filter(function (t) { return t.albumKey === albumId; }).sort(trackSort).map(trackToMpdItem);
};

ControllerTimeMachine.prototype.getRandomTrackItems = function (decade) {
  var tracks = this.getTracksForDecade(decade);
  if (decade === 'Missing Year' && !this.getConfiguredIncludeMissingYear()) tracks = [];
  var seed = makeNonce() + ':' + String(Date.now()) + ':' + String(process.hrtime ? process.hrtime().join(':') : Math.random());
  tracks = seededShuffle(tracks.slice(), seed).slice(0, this.getConfiguredMaxRandomTracks());
  this.logger.info('[timemachine] random-tracks seed for ' + decade + ': ' + seed);
  this.logger.info('[timemachine] random-tracks selected first five for ' + decade + ': ' + tracks.slice(0, 5).map(function (t) { return t.mpdPath; }).join(' | '));
  return tracks.map(trackToMpdItem);
};

ControllerTimeMachine.prototype.getRandomAlbumTrackItems = function (decade) {
  if (decade === 'Missing Year' && !this.getConfiguredIncludeMissingYear()) return [];
  var seed = makeNonce() + ':' + String(Date.now()) + ':' + String(process.hrtime ? process.hrtime().join(':') : Math.random());
  var albums = seededShuffle(this.getAlbumsForDecade(decade).slice(), seed).slice(0, this.getConfiguredRandomAlbumsCount());
  var tracks = [];
  albums.forEach(function (a) { tracks = tracks.concat(a.tracks.slice().sort(trackSort)); });
  this.logger.info('[timemachine] random-albums seed for ' + decade + ': ' + seed);
  this.logger.info('[timemachine] random-albums selected first five for ' + decade + ': ' + tracks.slice(0, 5).map(function (t) { return t.mpdPath; }).join(' | '));
  return tracks.map(trackToMpdItem);
};

ControllerTimeMachine.prototype.emptyNavigation = function (title, prev) {
  return {
    navigation: {
      prev: { uri: prev || ROOT_URI },
      lists: [browseList({ title: title, icon: 'fa fa-info-circle', availableListViews: ['list'], items: [] })]
    }
  };
};

function mpdRequest(command, options) {
  var defer = libQ.defer();
  options = options || {};
  var logger = options.logger;
  var host = options.host || DEFAULT_MPD_HOST;
  var port = options.port || DEFAULT_MPD_PORT;
  var timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  var socket = net.createConnection(port, host);
  var buffer = '';
  var sent = false;
  var finished = false;
  var timer = setTimeout(function () {
    finish(new Error('MPD request timed out after ' + timeoutMs + 'ms'));
  }, timeoutMs);

  function finish(err, result) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try { socket.destroy(); } catch (e) {}
    if (err) defer.reject(err);
    else defer.resolve(result);
  }

  function maybeSend() {
    if (sent) return;
    if (buffer.indexOf('OK MPD') !== 0) return;
    sent = true;
    socket.write(command + '\n');
  }

  function maybeResolve() {
    var lines = buffer.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('ACK ') === 0) return finish(new Error(lines[i]));
      if (sent && lines[i] === 'OK') {
        socket.write('close\n');
        return finish(null, buffer);
      }
    }
  }

  socket.on('connect', function () {});
  socket.on('data', function (chunk) {
    buffer += chunk.toString('utf8');
    maybeSend();
    maybeResolve();
  });
  socket.on('error', function (err) { finish(err); });
  socket.on('end', function () {
    if (!finished && logger) logger.warn('[timemachine] MPD socket ended before OK terminator');
  });

  return defer.promise;
}

function parseMpdListAllInfo(response, sourceRoot) {
  var lines = response.split(/\r?\n/);
  var records = [];
  var current = null;

  lines.forEach(function (line) {
    if (!line || line.indexOf('OK MPD') === 0 || line === 'OK') return;
    var idx = line.indexOf(': ');
    if (idx === -1) return;
    var key = line.slice(0, idx);
    var value = line.slice(idx + 2);
    if (key === 'file') {
      if (current) records.push(current);
      current = { raw: {}, mpdPath: value, sourceRoot: sourceRoot };
    } else if (current) {
      if (current.raw[key] === undefined) current.raw[key] = value;
      else if (Array.isArray(current.raw[key])) current.raw[key].push(value);
      else current.raw[key] = [current.raw[key], value];
    }
  });
  if (current) records.push(current);

  var nowYear = new Date().getFullYear();
  return records.map(function (r) {
    var raw = r.raw || {};
    var title = first(raw.Title) || basenameNoExt(r.mpdPath);
    var artist = first(raw.Artist) || first(raw.AlbumArtist) || '';
    var albumArtist = first(raw.AlbumArtist) || artist || '';
    var album = first(raw.Album) || '(Unknown Album)';
    var year = parseYear(first(raw.Date), nowYear);
    var decade = year ? (Math.floor(year / 10) * 10) + 's' : 'Missing Year';
    var discNumber = parseNumber(first(raw.Disc));
    var trackNumber = parseNumber(first(raw.Track));
    var albumKey = makeAlbumKey(albumArtist, artist, album, year, sourceRoot);
    return {
      id: hash(r.mpdPath),
      mpdPath: r.mpdPath,
      title: title,
      artist: artist,
      album: album,
      albumArtist: albumArtist,
      year: year,
      decade: decade,
      discNumber: discNumber,
      trackNumber: trackNumber,
      format: first(raw.Format) || '',
      albumKey: albumKey,
      sourceRoot: sourceRoot,
      raw: raw
    };
  });
}

function buildLibrary(tracks, mpdPaths) {
  var decadeCounts = {};
  DECADES.forEach(function (d) { decadeCounts[d] = 0; });
  var missing = 0;
  var albums = {};
  tracks.forEach(function (t) {
    if (t.decade === 'Missing Year') missing++;
    else if (decadeCounts[t.decade] !== undefined) decadeCounts[t.decade]++;
    albums[t.albumKey] = true;
  });
  return {
    meta: {
      source: 'mpd-listallinfo-robust',
      scannedAt: new Date().toISOString(),
      mpdPaths: mpdPaths,
      trackCount: tracks.length,
      albumCount: Object.keys(albums).length,
      decadeCounts: decadeCounts,
      missingYearCount: missing,
      uriVersion: URI_VERSION
    },
    tracks: tracks
  };
}

function normaliseLibrary(lib) {
  if (!lib || !Array.isArray(lib.tracks)) return emptyLibrary();
  if (!lib.meta) lib.meta = {};
  return lib;
}

function emptyLibrary() {
  return { meta: { source: 'mpd', trackCount: 0, albumCount: 0, decadeCounts: {}, missingYearCount: 0 }, tracks: [] };
}

function browseOnly(item) {
  item.playable = false;
  item.addToQueue = false;
  item.disablePlay = true;
  item.disableAddToQueue = true;
  return item;
}

function actionItem(item) {
  item.playable = true;
  item.addToQueue = true;
  item.disablePlay = false;
  item.disableAddToQueue = false;
  return item;
}

function browseList(list) {
  list.playable = false;
  list.addToQueue = false;
  list.disablePlay = true;
  list.disableAddToQueue = true;
  return list;
}


function buildSourceIconUri() {
  return '/albumart?sourceicon=music_service/' + PLUGIN_NAME + '/' + SOURCE_ICON_FILE;
}

function randomActionUri(base, action) {
  return base + '/' + action + '/' + makeNonce();
}

function makeNonce() {
  try {
    return crypto.randomBytes(8).toString('hex');
  } catch (e) {
    return String(Date.now()) + String(Math.floor(Math.random() * 1000000));
  }
}


function withQueueMetadata(item) {
  var copy = {};
  Object.keys(item || {}).forEach(function (k) { copy[k] = item[k]; });
  copy.service = copy.service || 'mpd';
  copy.type = copy.type || 'song';
  if (!copy.albumart && copy.uri) copy.albumart = buildAlbumArtUri(copy.uri);
  return copy;
}

function summariseQueueItem(item) {
  return {
    service: item && item.service,
    type: item && item.type,
    title: item && item.title,
    artist: item && item.artist,
    album: item && item.album,
    albumartist: item && item.albumartist,
    uri: item && item.uri,
    tracknumber: item && item.tracknumber,
    discnumber: item && item.discnumber,
    albumart: item && item.albumart
  };
}

function summariseApiResult(result) {
  var text = String(result || '');
  return text.length > 500 ? text.slice(0, 500) + '...' : text;
}

function buildAlbumArtUri(mpdPath) {
  // Volumio can normally resolve artwork itself for MPD library items, but
  // providing a standard albumart endpoint helps when items are inserted
  // through the queue API rather than selected from a native library page.
  return '/albumart?path=' + encodeURIComponent(String(mpdPath || ''));
}

function postVolumioApi(path, payload) {
  var defer = libQ.defer();
  var body = JSON.stringify(payload || {});
  var req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    },
    timeout: 30000
  }, function (res) {
    var out = '';
    res.on('data', function (chunk) { out += chunk.toString('utf8'); });
    res.on('end', function () {
      if (res.statusCode >= 200 && res.statusCode < 300) defer.resolve(out);
      else defer.reject(new Error('Volumio API ' + path + ' returned HTTP ' + res.statusCode + ': ' + out));
    });
  });
  req.on('timeout', function () {
    try { req.abort(); } catch (e) {}
    defer.reject(new Error('Volumio API ' + path + ' timed out'));
  });
  req.on('error', function (err) { defer.reject(err); });
  req.write(body);
  req.end();
  return defer.promise;
}

function reportItem(title, value) {
  return browseOnly({ service: PLUGIN_NAME, type: 'folder', title: title, artist: value, icon: 'fa fa-info-circle', uri: URI_PREFIX + '/report' });
}

function albumToBrowseItem(album) {
  var title = (album.artist ? album.artist + ' - ' : '') + album.album;
  var subtitle = (album.year ? String(album.year) + ' · ' : '') + album.tracks.length + ' tracks';
  return browseOnly({
    service: PLUGIN_NAME,
    type: 'folder',
    title: title,
    artist: subtitle,
    album: album.album,
    icon: 'fa fa-folder-open-o',
    uri: URI_PREFIX + '/album/' + encodeURIComponent(album.id)
  });
}

function trackToMpdItem(track) {
  return {
    service: 'mpd',
    type: 'song',
    title: track.title || basenameNoExt(track.mpdPath),
    artist: track.artist || track.albumArtist || '',
    album: track.album || '',
    albumartist: track.albumArtist || track.artist || '',
    icon: 'fa fa-music',
    uri: track.mpdPath,
    tracknumber: track.trackNumber || undefined,
    discnumber: track.discNumber || undefined
  };
}

function setUIConfigValue(uiconf, id, value) {
  var sections = [];
  if (uiconf && Array.isArray(uiconf.sections)) sections = uiconf.sections;
  if (uiconf && uiconf.page && Array.isArray(uiconf.page.sections)) sections = uiconf.page.sections;
  sections.forEach(function (section) {
    (section.content || []).forEach(function (item) {
      if (item.id === id) item.value = value;
    });
  });
}

function promiseSeries(items, iterator) {
  var p = libQ.resolve();
  items.forEach(function (item) {
    p = p.then(function () { return iterator(item); });
  });
  return p;
}

function mpdQuote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function parseYear(value, nowYear) {
  var text = String(value || '');
  var matches = text.match(/(?:^|[^0-9])((?:19|20)[0-9]{2})(?:[^0-9]|$)/g);
  if (!matches) return null;
  for (var i = 0; i < matches.length; i++) {
    var m = String(matches[i]).match(/((?:19|20)[0-9]{2})/);
    if (!m) continue;
    var y = parseInt(m[1], 10);
    if (y >= 1900 && y <= nowYear) return y;
  }
  return null;
}

function parseNumber(value) {
  var m = String(value || '').match(/[0-9]+/);
  return m ? parseInt(m[0], 10) : undefined;
}

function first(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function basenameNoExt(file) {
  return path.basename(String(file || '')).replace(/\.[^.]+$/, '');
}

function makeAlbumKey(albumArtist, artist, album, year, sourceRoot) {
  return hash([albumArtist || artist || '', album || '', year || '', sourceRoot || ''].join('|').toLowerCase());
}

function hash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 20);
}

function getSubmittedValue(data, id) {
  if (!data) return undefined;
  if (data[id] !== undefined) {
    if (data[id] && typeof data[id] === 'object' && data[id].value !== undefined) return data[id].value;
    return data[id];
  }
  if (data.formData && data.formData[id] !== undefined) return data.formData[id];
  if (Array.isArray(data)) {
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].id === id) return data[i].value;
    }
  }
  return undefined;
}

function parseBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  var s = String(value || '').toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function trackSort(a, b) {
  return cmp(a.albumArtist, b.albumArtist) || cmp(a.album, b.album) || numCmp(a.discNumber, b.discNumber) || numCmp(a.trackNumber, b.trackNumber) || cmp(a.title, b.title) || cmp(a.mpdPath, b.mpdPath);
}

function albumSort(a, b) {
  return cmp(a.artist, b.artist) || cmp(a.album, b.album) || numCmp(a.year, b.year);
}

function cmp(a, b) {
  a = String(a || '').toLowerCase();
  b = String(b || '').toLowerCase();
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function numCmp(a, b) {
  a = a || 9999;
  b = b || 9999;
  return a - b;
}


function seededShuffle(arr, seed) {
  return arr.map(function (item, index) {
    var keySource = seed + ':' + index + ':' + (item.mpdPath || item.id || item.albumKey || JSON.stringify(item));
    return { item: item, key: crypto.createHash('sha256').update(keySource).digest('hex') };
  }).sort(function (a, b) {
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  }).map(function (wrapped) { return wrapped.item; });
}

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = secureRandomIndex(i + 1);
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function secureRandomIndex(maxExclusive) {
  if (maxExclusive <= 1) return 0;
  try {
    var n = crypto.randomBytes(4).readUInt32BE(0);
    return n % maxExclusive;
  } catch (e) {
    return Math.floor(Math.random() * maxExclusive);
  }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
