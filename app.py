from tornado import websocket, web, ioloop
import json
from mpv_python_ipc import MpvProcess

clients = []

class MpvInstance(MpvProcess):
    def observe_properties(self, properties):
        def inform_clients(prop, val):
            message = json.dumps(dict(id=prop, result=val))
            for c in clients:
                c.write_message(message)
        for p in properties:
            self.observe_property(p, inform_clients)

class Message(object):
    def __init__(self, msg):
        self.method = msg.get('method')
        self.params = msg.get('params')
        self.id = msg.get('id')

    def handle(self, connection):
        if self.method == 'mpv_command':
            mpv_command = self.params['method']
            params = self.params['params']
            if mpv_command == 'commandv':
                response = mp.commandv(*params)
                response = json.dumps(dict(result=response, id=self.id))
                connection.write_message(response)
            elif mpv_command == 'get_property':
                value = mp.get_property(params[0])
                response = json.dumps(dict(result=value, id=self.id))
                connection.write_message(response)
            elif mpv_command == 'get_property_native':
                value = mp.get_property_native(params[0])
                response = json.dumps(dict(result=value, id=self.id))
                connection.write_message(json.dumps(value))
            elif mpv_command == 'set_property':
                mp.set_property(params[0], params[1])
                response = json.dumps(dict(result=[], id=self.id))
                connection.write_message(json.dumps(response))


class IndexHandler(web.RequestHandler):
    def get(self):
        self.render("index.html")

class WsHandler(websocket.WebSocketHandler):

    def open(self):
        if self not in clients:
            clients.append(self)

    def on_message(self, message):
        message = json.loads(message)
        message = Message(message)
        message.handle(self)

    def on_close(self):
        if self in clients:
            clients.remove(self)

class ApiHandler(web.RequestHandler):

    @web.asynchronous
    def get(self, *args):
        self.finish()

    @web.asynchronous
    def post(self):
        pass

app = web.Application([
    (r'/', IndexHandler),
    (r'/ws', WsHandler),
    (r'/api', ApiHandler),
])

if __name__ == '__main__':
    mp = MpvInstance(debug=True, args=['--screen=1'])
    mp.observe_properties(['media-title', 'time-pos', 'idle'])
    app.listen(9875)
    main_loop = ioloop.IOLoop.instance()
    main_loop.start()
