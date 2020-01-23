// HTTP

import http from 'http'
import { Server as FileServer } from 'node-static'

const fileServer = new FileServer("./dist")

const rootServer = http.createServer((req, res) => {
  fileServer.serve(req, res)
}).listen(8080)

// WebSocket

import WebSocket, { Server } from 'ws'
import { v4 as uuid } from 'uuid'

const { stringify } = JSON

const wsServer = new Server({ server: rootServer });

const hosts: { [invitation: string]: WebSocket } = {}

wsServer.on('connection', (socket, request) => {
  const [_, action, ...args] = request.url.split('/')

  switch (action) {
    case "meet":
      let [invitation] = args
      if (!invitation) {
        invitation = uuid()
        hosts[invitation] = socket
        socket.send(stringify({ type: "invitation", invitation }))
        console.log(`create ${invitation}`)
      } else if (hosts[invitation]) {
        meet(hosts[invitation], socket)
        delete hosts[invitation]
        console.log(`accept ${invitation}`)
      } else {
        socket.send(stringify({ type: "error", data: "void" }))
        socket.close()
      }
      break;
    default:
      socket.send(stringify({ type: "error", data: "unsupported" }))
      socket.close()
  }

})

wsServer.on('error', error => {
  console.log(error)
})


function meet(host: WebSocket, guest: WebSocket) {

  host.send(stringify({ type: "ready" }));

  [[host, guest], [guest, host]].forEach(
    ([from, to]) => {
      from.on('message', data => {
        to.send(data)
      })
    }
  );

}

