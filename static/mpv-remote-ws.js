// helpers
var SetALike = function(list) {
    var o = {};
    for (i = 0; i < list.length; i++) {
        o[list[i]] = true;
    }
    return o;
}

var video_extensions = new SetALike(['avi', 'mp4', 'mkv', 'ogv', 'ogg', 'flv', 'm4v', 'mov', 'mpg', 'mpeg', 'wmv', 'm3u']);

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

    this.req_id = 0;
    this.onmessage_handlers = {};

    this.onmessage = function(ev){
        var response = JSON.parse(ev.data);
        if (response.id in this.onmessage_handlers) {
            this.onmessage_handlers[response.id](response.result);
            if (typeof response.id === 'number')
                delete this.onmessage_handlers[response.id];
        }
    }.bind(this);

    this.address = 'ws://' + window.location.host + '/ws';
    this.ws = new WebSocket(this.address);
    this.ws.onopen = onopen;
    this.ws.onmessage = this.onmessage;

    this.send = function(data, cb) {
        if (cb)
            this.onmessage_handlers[this.req_id] = cb;
        data.id = this.req_id;
        this.req_id += 1;
        if (this.ws.readyState !== 1) {
            this.ws = new WebSocket(this.address);
            this.ws.onmessage = onmessage;
            this.ws.onopen = function () {
                this.ws.send(JSON.stringify(data));
            }
        }
        else {
            this.ws.send(JSON.stringify(data));
        }
    }.bind(this);
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

var pathbutton = function(path, extra_classes) {
    var link = document.createElement('a');
    link.href = '#';
    link.classList.add('navlink');

    if (extra_classes) {
        extra_classes.forEach(function(cls) {
            link.classList.add(cls);
        });
    }

    link.innerHTML = path[path.length - 1];

    link.onclick = function() {
        MPV_REMOTE_WS.filebrowser.open(path);
        return false;
    }

    var li = document.createElement('li');
    li.appendChild(link);
    return li;
}


var contentbutton = function(item) {

    var path_json = JSON.stringify(item.path);

    var link = document.createElement('a');
    link.href = '#';
    link.classList.add('contentlink');

    var visited = localStorage.getItem(path_json);
    if (visited && JSON.parse(visited).visited) {
        link.classList.add('visited');
    }

    var icon = document.createElement('i');

    var description = document.createElement('span');
    description.innerHTML = item.path[item.path.length - 1];

    var modified = document.createElement('span');
    modified.className = 'modified';
    modified.innerHTML = new Date(item.modified * 1000).toLocaleString();

    var newline = document.createElement('br');

    if (item.type == 'file') {
        link.classList.add('file');
        var ext = item.path[item.path.length - 1].split('.').pop();
        if (video_extensions[ext]) {
            link.classList.add('video');
        }
        link.onclick = function() {
            link.classList.add('visited');
            localStorage.setItem(path_json, JSON.stringify({'visited': true}))
            MPV_REMOTE_WS.mp.play_file(item.path);
            return false;
        }
        icon.className = 'fa fa-file-o';
    }

    else if (item.type == 'dir') {
        link.classList.add('folder');
        link.onclick = function() {
            MPV_REMOTE_WS.filebrowser.open(item.path);
            return false;
        }
        icon.className = 'fa fa-folder';
    }

    link.appendChild(icon);
    link.appendChild(description);
    link.appendChild(newline);
    link.appendChild(modified);

    var li = document.createElement('li');
    li.appendChild(link);
    return li;
}

var FileBrowser = function() {};

FileBrowser.prototype = {

    open: function(path, from_history) {
        if (!from_history)
            history.pushState(path, '');
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

            var root_button = pathbutton(['ROOT'], ['top']);
            path_listing.appendChild(root_button);

            for (var i = 0; i < this.path.length; i++) {
                var path_btn = pathbutton(this.path.slice(0, i + 1));
                path_listing.appendChild(path_btn);
            }

            sorted_content.forEach(function(i) {
                var content_btn = contentbutton(i);
                dir_listing.appendChild(content_btn);
            });

        }.bind(this));

    },

    hide: function() {
        document.getElementById('filebrowser').innerHTML = '';
    }
}

var Remote = function() {
    this.element = document.getElementById('remote');
};


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
            this.element.classList.remove('hide');
            this.element.ontouchmove = function(e) {
                if (e.target.id !== 'vol') e.preventDefault();
            }
            document.getElementById('controls').innerHTML = data;

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
        }.bind(this));
    },

    hide: function() {
        this.element.classList.add('hide');
    },

    toggle: function() {
        if (this.element.classList.contains('hide')) {
            this.element.classList.remove('hide');
        }
        else {
            this.element.classList.add('hide');
        }
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
window.onpopstate = function(e) {
    MPV_REMOTE_WS.filebrowser.open(e.state, true);
}
MPV_REMOTE_WS.remote = new Remote();
MPV_REMOTE_WS.mp = new MpvProcess();
MPV_REMOTE_WS.connection = new Connection(function(){
    var path = ['HOME'];
    if (localStorage.last_dir) {
        path = JSON.parse(localStorage.last_dir);
    }
    history.replaceState(path, '');
    MPV_REMOTE_WS.filebrowser.open(path, true);

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
