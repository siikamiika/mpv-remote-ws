// namespace
var MPV_REMOTE_WS = {};
MPV_REMOTE_WS.cache_buster = new Date().getTime();

// xhr
var XHR = function(type, path, data, onready, async) {
    if (!onready) {onready = function(){}}
    if (!(async === false)) {async = true};
    var xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
            onready(xhr.responseText);
        }
    }

    xhr.open(type, path, async);
    xhr.send(data);
}

// websocket init

var Connection = function(onopen) {
    var _this = this;
    this.req_id = 0;
    this.onmessage_handlers = {};

    this.ws = new WebSocket('ws://' + window.location.host + '/ws');

    this.ws.onopen = onopen;

    var onmessage = function(ev){
        var response = JSON.parse(ev.data);
        if (response.id in _this.onmessage_handlers) {
            _this.onmessage_handlers[response.id](response.result);
            if (typeof response.id === 'number')
                delete _this.onmessage_handlers[response.id];
        }
    }

    this.ws.onmessage = onmessage;

    this.send = function(data, cb) {
        if (cb)
            this.onmessage_handlers[this.req_id] = cb;
        data.id = this.req_id;
        this.req_id += 1;
        if (this.ws.readyState !== 1) {
            _this.ws = new WebSocket('ws://' + window.location.host + '/ws');
            _this.ws.onmessage = onmessage;
            _this.ws.onopen = function () {
                _this.ws.send(JSON.stringify(data));
            }
        }
        else {
            this.ws.send(JSON.stringify(data));
        }
    }
}

// mpv commands
var MpvProcess = function() {};

MpvProcess.prototype = {

    get_property: function(name, cb, _native) {
        var method = 'get_property';
        if (_native) method += '_native';
        this._send_message(method, [name], cb);
    },

    get_property_native: function(name, cb) {
        this.get_property(name, cb, true);
    },

    set_property: function(name, val, cb) {
        var method = 'set_property';
        this._send_message(method, [name, val], cb);
    },

    commandv: function(params, cb) {
        var method = 'commandv';
        this._send_message(method, params, cb);
    },

    play_file: function(path) {
        var method = 'play_file';
        this._send_message(method, path);
    },

    pause: function() {
        this.commandv(['cycle', 'pause']);
    },

    stop: function() {
        this.commandv(['stop']);
    },

    cycle_aspect: function() {
        this.commandv(['osd-msg', 'cycle-values', 'video-aspect', '16:9', '4:3', '2.35:1', '-1']);
    },

    set_vol: function(val) {
        this.commandv(['osd-msg-bar', 'set', 'volume', val]);
    },

    seek: function(seconds) {
        this.commandv(['osd-msg-bar', 'seek', seconds]);
    },

    chapter: function(amount) {
        this.commandv(['osd-msg-bar', 'add', 'chapter', amount]);
    },

    chapter_next: function() {
        this.chapter(1);
    },

    chapter_prev: function() {
        this.chapter(-1);
    },

    subdelay: function(seconds) {
        this.commandv(['osd-msg', 'add', 'sub-delay', seconds]);
    },

    audiodelay: function(seconds) {
        this.commandv(['osd-msg', 'add', 'audio-delay', seconds]);
    },

    cycle_sub: function() {
        this.commandv(['osd-msg', 'cycle', 'sub']);
    },

    cycle_audio: function() {
        this.commandv(['osd-msg', 'cycle', 'audio']);
    },

    toggle_drc: function() {
        this.commandv(['osd-msg', 'af', 'toggle', 'drc']);
    },

    _send_message: function(method, params, cb) {
        MPV_REMOTE_WS.connection.send({
            method: 'mpv_command',
            params: {
                method: method,
                params: params
            }
        }, cb);
    }
}

// UI
var sorting = function(attr, reverse) {
    return function(a, b) {
        if (reverse) b = [a, a = b][0];
        if (attr == 'path') {
            a = a.path[a.path.length - 1];
            b = b.path[b.path.length - 1];
        }
        else if (attr == 'modified') {
            a = a.modified;
            b = b.modified;
        }
        if (a < b)
            return -1;
        if (b < a)
            return 1;
        return 0;
    }
}

var FileBrowser = function() {};

FileBrowser.prototype = {

    open: function(path) {
        this.get_folder_content(path, this.render);
        localStorage.last_dir = JSON.stringify(path);
    },

    get_folder_content: function(path, cb) {
        MPV_REMOTE_WS.connection.send({
            method: 'folder_content',
            params: path
        }, cb);
    },

    render: function(content) {
        var _this = this;
        this.path = content.path;
        this.content = content.content;

        var files = this.content.filter(function(i) {
            return i.type == 'file';
        }).sort(sorting('path'));

        var folders = this.content.filter(function(i) {
            return i.type == 'dir';
        }).sort(sorting('modified', true));

        var sorted_content = [];
        var first = 'folders';
        if (first == 'folders') {
            sorted_content = folders.concat(files);
        }
        else if (first == 'files') {
            sorted_content = files.concat(folders);
        }


        XHR('GET', 'static/filebrowser.html?' + MPV_REMOTE_WS.cache_buster, null, function(data) {
            var filebrowser_element = document.getElementById('filebrowser');
            filebrowser_element.innerHTML = data;
            var path_listing = document.createElement('ul');
            var dir_listing = document.createElement('ul');
            document.getElementById('filebrowser-path').appendChild(path_listing);
            document.getElementById('filebrowser-content').appendChild(dir_listing);

            var activate_path_link = function(link, i) {
                link.onclick = function() {
                    MPV_REMOTE_WS.filebrowser.open(_this.path.slice(0, i + 1));
                    return false;
                }
            }

            var link = document.createElement('a');
            link.href  = '#';
            link.classList.add('navlink');
            link.classList.add('top');
            link.innerHTML = 'ROOT';
            link.onclick = function() {
                MPV_REMOTE_WS.filebrowser.open(['ROOT']);
            }
            var li = document.createElement('li');
            li.appendChild(link);
            path_listing.appendChild(li);

            for (var i = 0; i < _this.path.length; i++) {
                var link = document.createElement('a');
                link.href = '#';
                link.classList.add('navlink');
                link.innerHTML = _this.path[i];
                activate_path_link(link, i);
                var li = document.createElement('li');
                li.appendChild(link);
                path_listing.appendChild(li);
            }

            sorted_content.forEach(function(i) {
                var link = document.createElement('a');
                link.href = '#';
                link.classList.add('contentlink');

                if (i.type == 'file') {
                    link.classList.add('file');
                    link.onclick = function() {
                        MPV_REMOTE_WS.mp.play_file(i.path);
                        return false;
                    }
                    link.innerHTML = '<i class="fa fa-file-o"></i>' +
                        '<span class="file">' + i.path[i.path.length - 1] + '</span><br>' +
                        '<span class="modified">' + new Date(i.modified * 1000).toLocaleString() + '</span>';
                }

                else if (i.type == 'dir') {
                    link.classList.add('folder');
                    link.onclick = function() {
                        MPV_REMOTE_WS.filebrowser.open(i.path);
                        return false;
                    }
                    link.innerHTML = '<i class="fa fa-folder"></i>' +
                        '<span class="folder">' + i.path[i.path.length - 1] + '</span><br>' +
                        '<span class="modified">' + new Date(i.modified * 1000).toLocaleString() + '</span>';
                }

                var li = document.createElement('li');
                li.appendChild(link);
                dir_listing.appendChild(li);
            });
        });

    },

    hide: function() {
        document.getElementById('filebrowser').innerHTML = '';
    }
}

var Remote = function() {};


var activate_repeating_control = function(button) {
    var press_button = function(command) {
        release_button(command);
        window.pressed_buttons[command + '_timeout'] = setTimeout(function() {
            var interval_id = setInterval(function() {
                if (!window.pressed) {
                    clearInterval(interval_id);
                }
                else {
                    eval(command);
                }
            }, 50);
            window.pressed_buttons[command + '_interval'] = interval_id;
        }, 500);
    }

    var release_button = function(command) {
        clearTimeout(pressed_buttons[command + '_timeout']);
        clearInterval(pressed_buttons[command + '_interval']);
    }

    var command = button.getAttribute('onclick');
    if ('ontouchstart' in window) {
        button.addEventListener('touchstart', function() {press_button(command)}, false);
        button.addEventListener('touchend', function() {release_button(command)}, false);
    }
    else {
        button.addEventListener('mousedown', function() {press_button(command)}, false);
        button.addEventListener('mouseup', function() {release_button(command)}, false);
    }
}

Remote.prototype = {

    render: function() {
        XHR('GET', 'static/remote.html?' + MPV_REMOTE_WS.cache_buster, null, function(data) {
            document.getElementById('remote').innerHTML = data;

            // repeated buttons
            window.pressed = false;
            window.pressed_buttons = {};

            if ('ontouchstart' in window) {
                window.ontouchstart = function () {window.pressed = true};
                window.ontouchend = function () {window.pressed = false};
                window.onorientationchange = function () {window.pressed = false};
            }
            else {
                window.onmousedown = function () {window.pressed = true};
                window.onmouseup = function () {window.pressed = false};
            }

            var repeating_controls = document.getElementsByClassName('repeat');

            for (var i = 0; i < repeating_controls.length; i++) {
                activate_repeating_control(repeating_controls[i]);
            }

            // restore old volume bar location
            var vol_element = document.getElementById('vol');
            if (localStorage.volume) {
                vol_element.value = localStorage.volume;
            }
        });
    },

    hide: function() {
        document.getElementById('remote').innerHTML = '';
    },

    set_volume: function() {
        var vol_input = document.getElementById('vol');
        var vol = vol_input.value;
        localStorage.volume = vol;
        MPV_REMOTE_WS.mp.set_vol(vol);
    },

}

// instantiation
MPV_REMOTE_WS.filebrowser = new FileBrowser();
MPV_REMOTE_WS.remote = new Remote();
MPV_REMOTE_WS.mp = new MpvProcess();
MPV_REMOTE_WS.connection = new Connection(function(){
    var path = ['HOME'];
    if (localStorage.last_dir) {
        path = JSON.parse(localStorage.last_dir);
    }
    MPV_REMOTE_WS.filebrowser.open(path);

    // observed properties
    var title = MPV_REMOTE_WS.mp.get_property_native('media-title', function(data) {
        if (data) document.getElementById('title').innerHTML = data;
    });
    MPV_REMOTE_WS.connection.onmessage_handlers['media-title'] = function(data) {
        document.getElementById('title').innerHTML = data;
    }

    MPV_REMOTE_WS.mp.get_property_native('idle', function(data) {
        if (!(data === true)) MPV_REMOTE_WS.remote.render();
    });
    MPV_REMOTE_WS.connection.onmessage_handlers['idle'] = function(data) {
        if (data === true)
            MPV_REMOTE_WS.remote.hide();
        else
            MPV_REMOTE_WS.remote.render();
    }
});

// helpers
var debug = function (text) {
    console.log(text);
}
