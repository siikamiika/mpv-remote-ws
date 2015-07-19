from tornado import websocket, web, ioloop
import json
from mpv_python_ipc import MpvProcess

clients = []

class Message(object):
    def __init__(self, msg):
        self.type = msg.get('type')
        self.args = msg.get('args')

    def handle(self):
        if self.type == 'commandv':
            mp.commandv(*self.args)
        elif self.type == 'get_property':
            value = mp.get_property(self.args[0])
        elif self.type == 'get_property_native':
            value = mp.get_property_native(self.args[0])
        elif self.type == 'set_property':
            mp.set_property(self.args[0], self.args[1])
        elif self.type == 'register_event':
            value = mp.register_event(self.args[0], lambda: print(self.args[0]))
        elif self.type == 'unregister_event':
            value = mp.unregister_event(self.args[0])
        elif self.type == 'observe_property':
            def send_property_change(name, value):
                for c in clients:
                    c.write_message(json.dumps([name, value]))
            mp.observe_property(self.args[0], send_property_change)
        elif self.type == 'unobserve_property':
            value = mp.unobserve_property(self.args[0])


class IndexHandler(web.RequestHandler):
    def get(self):
        self.render("index.html")

class WsHandler(websocket.WebSocketHandler):
    def check_origin(self, origin):
        return True

    def open(self):
        if self not in clients:
            clients.append(self)

    def on_message(self, message):
        message = json.loads(message)
        message = Message(message)
        message.handle()

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
    mp = MpvProcess()
    app.listen(9875)
    ioloop.IOLoop.instance().start()
