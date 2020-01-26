// HTTPS

import https from 'https'
import { Server as FileServer } from 'node-static'
import fs from 'fs'

const fileServer = new FileServer("./dist")

const rootServer = https.createServer(
  {
    cert: fs.readFileSync("server.cert"),
    key: fs.readFileSync("server.key")
  },
  (req, res) => {
    fileServer.serve(req, res)
  }).listen(8082)

// WebSocket

process.env.LOGGING = "true"

import WebSocket, { Server } from 'ws'
import { v4 as uuid } from 'uuid'

const { stringify } = JSON

const wsServer = new Server({ server: rootServer });

const hosts: { [invitation: string]: WebSocket } = {}

wsServer.on('connection', (socket, request) => {
  let [, invitation] = request.url.split('/')
  if (!invitation) {
    invitation = uuid()
    hosts[invitation] = socket
    socket.send(invitation)
    log(`create ${invitation}`)
  } else if (hosts[invitation]) {
    meet(hosts[invitation], socket)
    delete hosts[invitation]
    log(`accept ${invitation}`)
  } else {
    log(`invitation ${invitation} does not exist`)
    socket.send(stringify({ type: "error", code: "void" }))
    socket.close()
  }
})

wsServer.on('error', error => {
  log(error)
})


function meet(host: WebSocket, guest: WebSocket) {

  [[host, guest], [guest, host]].forEach(
    ([from, to]) => from.on('message', data => {
      log(`${from === host ? 'host' : 'guest'}: ${stringify(data)}`)
      to.send(data)
    })
  );

}

function log(...args: any) {
  if (process.env.LOGGING) {
    console.log(args)
  }
}