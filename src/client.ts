import * as client from './rtc-lib'
import uuid = require('uuid');

require('webrtc-adapter');

const url = new URL(document.URL)

const stunServerUrl = `stun:${url.hostname}:3478`
let meetingServer = `${url.host.startsWith("localhost") && !process.env.SSL ? 'ws' : 'wss'}://${url.host}/`

// config

export const rtcConfiguration: RTCConfiguration = {
  iceServers: [{
    urls: [
      stunServerUrl,
      'stun:stun.l.google.com:19302'
    ]
  }]
};


const channels: { [id: string]: RTCDataChannel } = {}

async function handleControlMessage(data: string, replyChannel: RTCDataChannel, localStream: MediaStream, onstream: (stream: MediaStream) => void) {
  const message: ControlMessage = JSON.parse(data)

  switch (message.type) {

    case "network":
      if (message.network.id === network.id) {
        return;
      }

      network.connections.push(message.network.id)
      channels[message.network.id] = replyChannel
      const newConnections = message.network.connections.filter((id: string) => !network.connections.includes(id))
      console.log(`network updated: ${JSON.stringify(network)}`)
      console.log(`new connections: ${JSON.stringify(newConnections)}`)
      newConnections.forEach(
        id => {
          if (!channels[id]) {
            client.join(meetingServer)
              .then(async ({ joinUrl, peer, init }) => {
                configurePeer(peer, localStream, onstream);
                replyChannel.send(JSON.stringify({
                  type: "join",
                  to: id,
                  body: joinUrl
                }))
                init()
                console.log(`joining to ${id}: ${joinUrl}`)
              })
          }
        }
      )
      break;

    case "join":
      if (message.to === network.id) {
        console.log('accepting')
        const { peer, init } = await client.accept(message.body)
        configurePeer(peer, localStream, onstream)
        init()
      } else if (channels[message.to]) {
        console.log('forwarding')
        // if it's not to us and we know to whom, just forward
        channels[message.to].send(data)
      } else {
        console.log('rejecting')
      }
      break;

  }

}

type ControlMessage = {
  type: "network",
  network: Network
} | {
  type: "join",
  to: string,
  body: any
}

type StreamHandler = (stream: MediaStream) => void

function initControlChannel(peer: RTCPeerConnection, localStream: MediaStream, onstream: StreamHandler) {
  const channel = peer.createDataChannel("ctrl")
  channel.onopen = () => channel.send(JSON.stringify({
    type: "network",
    network
  }))
  channel.onmessage = ({ data }) => handleControlMessage(data, channel, localStream, onstream)
}

function joinControlChannel(peer: RTCPeerConnection, localStream: MediaStream, onstream: StreamHandler) {
  peer.ondatachannel = ({ channel }) => {
    if (channel.label === "ctrl") {
      channel.onmessage = ({ data }) => handleControlMessage(data, channel, localStream, onstream)
      channel.onopen = () => channel.send(JSON.stringify({ type: "network", network }))
    }
  }
}

function configurePeer(
  peer: RTCPeerConnection,
  localStream: MediaStream,
  onstream: (stream: MediaStream) => void) {

  peer.ontrack = ({ streams: [stream] }) => {
    onstream(stream)
  }

  localStream.getTracks()
    .forEach(track => peer.addTrack(track, localStream))
}

interface Network {
  id: string,
  connections: string[]
}

const network: Network = {
  id: uuid(),
  connections: []
}

Object.assign(window, {

  join: async (
    localStream: MediaStream,
    onurl: (url: string) => void,
    onstream: (stream: MediaStream) => void
  ) => {

    // generate
    const { joinUrl, peer, init } = await client.join(meetingServer, rtcConfiguration)

    // configure
    configurePeer(peer, localStream, onstream)
    joinControlChannel(peer, localStream, onstream)

    // show
    onurl(joinUrl)

    await init()

  },

  accept: async (
    localStream: MediaStream,
    url: string,
    onstream: (stream: MediaStream) => void
  ) => {

    const { peer, init } = await client.accept(url, rtcConfiguration)

    configurePeer(peer, localStream, onstream)
    initControlChannel(peer, localStream, onstream)

    await init()

  }

})