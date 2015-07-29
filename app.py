from tornado import websocket, web, ioloop
import json
from mpv_python_ipc import MpvProcess
from pathlib import Path
import os
from os.path import splitext, dirname, realpath, expanduser
from base64 import standard_b64encode, b64decode

script_path = Path(dirname(realpath(__file__)))


class BasicAccessAuth(object):

    def __init__(self, realm, auth):
        self.realm = realm
        self.auth = standard_b64encode(auth)

    def authenticated(self, handler):
        auth_header = handler.request.headers.get('Authorization')
        if auth_header == None:
            return False
        correct_auth = self._check_auth(auth_header)
        if correct_auth:
            return True
        else:
            print('Auth attempt from {}: {}'.format(
                handler.request.remote_ip,
                b64decode(auth_header[6:])
                ))
            return False

    def request_auth(self, handler):
        handler.set_header('WWW-Authenticate', 'Basic realm={}'.format(self.realm))
        handler.set_status(401)
        handler.finish()

    def _check_auth(self, auth):
        return auth == 'Basic {}'.format(self.auth.decode())


with (script_path / 'auth').open('rb') as f:
    basic_auth = BasicAccessAuth('mpv-remote-ws', f.read().strip())

clients = []

class IndexHandler(web.RequestHandler):
    def get(self):
        if not basic_auth.authenticated(self):
            return basic_auth.request_auth(self)
        self.render("index.html")


class WsHandler(websocket.WebSocketHandler):

    def open(self):
        if not basic_auth.authenticated(self):
            return self.close()
        if self not in clients:
            clients.append(self)

    def on_message(self, message):
        mpv_remote.handle_message(message, self)

    def on_close(self):
        if self in clients:
            clients.remove(self)


def get_app():
    return web.Application([
        (r'/', IndexHandler),
        (r'/static/(.*)', web.StaticFileHandler, {'path': str(script_path / 'static')}),
        (r'/ws', WsHandler),
    ])


class FolderContent(object):

    def __init__(self, path):
        self.path = Path(*path)
        if str(self.path) == 'HOME':
            self.path = Path(expanduser('~'))
        if str(self.path) == 'ROOT':
            if os.name == 'nt':
                self._windows_drives()
            elif os.name == 'posix':
                self.path = Path('/')
                self._folder_content()
        else:
            self._folder_content()

    def get(self):
        return dict(
            path=self.path.parts,
            content=self.content
            )

    def _item_info(self, item):
        try:
            _ = item.stat()
            return dict(
                path=item.parts,
                type='dir' if item.is_dir() else 'file',
                modified=_.st_mtime,
                size=_.st_size
                )
        except Exception as e:
            print(e)
            return

    def _folder_content(self):
        self.content = []
        try:
            for item in self.path.iterdir():
                i = self._item_info(item)
                if i:
                    self.content.append(i)
        except Exception as e:
            print(e)

    def is_drive(self, d):
        try: return d.is_dir()
        except: return False

    def _windows_drives(self):
        drives = [Path('{}:\\'.format(c)) for c in map(chr, range(65, 91))]
        drives = [self._item_info(d) for d in drives if self.is_drive(d)]
        self.content = drives


class Message(object):
    def __init__(self, msg):
        self.raw_msg = msg
        self.parse()

    def parse(self):
        msg = json.loads(self.raw_msg)
        self.method = msg['method']
        self.params = msg['params']
        self.id = msg['id']


class MpvRemote(object):
    def __init__(self):
        self.player = MpvProcess(debug=True, args=[])
        self.observe_properties(['media-title', 'idle'])

    def handle_message(self, message, client):
        message = Message(message)
        response = dict(id=message.id, result=None)
        if message.method == 'mpv_command':
            response['result'] = self.mpv_command(message.params)
        elif message.method == 'folder_content':
            response['result'] = FolderContent(message.params).get()
        client.write_message(json.dumps(response))


    def mpv_command(self, cmd):
        command = cmd['method']
        params = cmd['params']
        result = None
        if command == 'commandv':
            result = self.player.commandv(*params)
        elif command == 'get_property':
            result = self.player.get_property(params[0])
        elif command == 'get_property_native':
            result = self.player.get_property_native(params[0])
        elif command == 'set_property':
            self.player.set_property(params[0], params[1])
        elif command == 'play_file':
            self.player.commandv('stop')
            self.player.set_property('pause', 'no')
            self.player.commandv('loadfile', os.path.join(*params))
        return result

    def observe_properties(self, properties):
        def property_update(prop, val):
            msg = dict(id=prop, result=val)
            msg = json.dumps(msg)
            for c in clients:
                c.write_message(msg)
        for p in properties:
            self.player.observe_property(p, property_update)



if __name__ == '__main__':
    mpv_remote = MpvRemote()
    app = get_app()
    app.listen(9875)
    main_loop = ioloop.IOLoop.instance()
    main_loop.start()
