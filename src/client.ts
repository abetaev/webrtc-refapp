import * as client from './client-lib'
import uuid = require('uuid');

require('webrtc-adapter');

// config

export const rtcConfiguration: RTCConfiguration = {
  iceServers: [{
    urls: [
      // 'stun:192.168.1.13:3478', // coturn@localhost
      // 'stun:127.0.0.1:3479', // coturn@localhost
      'stun:stun.l.google.com:19302'
    ]
  }]
};

const url = new URL(document.URL)

let meetingServer = `wss://${url.host}/`
const meetingServerInput = document.getElementById("meetingServer") as HTMLInputElement
meetingServerInput.value = meetingServer
meetingServerInput.onchange = ({ target }) => meetingServer = target["value"]
export const tokenUrl = new URL(document.URL).searchParams.get("tokenUrl") || ""

const getLocalStream = async () => {
  const existingElement = document.getElementById('localStream') as HTMLVideoElement

  if (existingElement) {
    return existingElement.srcObject as MediaStream
  }

  const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })

  addVideoStream('localStream', localStream)

  return localStream
}

function addVideoStream(id: string, stream: MediaStream) {

  const videoElement = document.createElement("video")
  videoElement.id = id
  videoElement.autoplay = true
  videoElement.srcObject = stream
  videoElement.muted = true
  videoElement.load()

  if (id === 'localStream') {
    videoElement.style.position = 'absolute'
    videoElement.style.left = '0px'
    videoElement.style.bottom = '0px'
    videoElement.style.width = '100px'
  }

  const videosDiv = document.getElementById("videos") as HTMLDivElement
  videosDiv.appendChild(videoElement)

}

const channels: { [id: string]: RTCDataChannel } = {}

async function handleControlMessage(data: string, replyChannel: RTCDataChannel) {
  const message: ControlMessage = JSON.parse(data)

  switch (message.type) {

    case "network":
      network.connections.push(message.network.id)
      channels[message.network.id] = replyChannel
      const newConnections = message.network.connections.filter((id: string) => !network.connections.includes(id))
      console.log(`network updated: ${JSON.stringify(network)}`)
      console.log(`new connections: ${JSON.stringify(newConnections)}`)
      newConnections.forEach(
        id => {
          if (!channels[id]) {
            console.log(`joining to ${id}`)
            client.join(meetingServer)
              .then(async ({ joinUrl, initPeer }) => {
                configurePeer(initPeer, await getLocalStream());
                replyChannel.send(JSON.stringify({
                  type: "join",
                  to: id,
                  body: joinUrl
                }))
              })
          }
        }
      )
      break;

    case "join":
      if (message.to === network.id) {
        console.log('accepting')
        const { initPeer } = await client.accept(message.body)
        configurePeer(initPeer, await getLocalStream())
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

function initControlChannel(peer: RTCPeerConnection) {
  const channel = peer.createDataChannel("ctrl")
  channel.onopen = () => channel.send(JSON.stringify({
    type: "network",
    network
  }))
  channel.onmessage = ({ data }) => handleControlMessage(data, channel)
}

function joinControlChannel(peer: RTCPeerConnection) {
  peer.ondatachannel = ({ channel }) => {
    if (channel.label === "ctrl") {
      channel.onmessage = ({ data }) => handleControlMessage(data, channel)
      channel.onopen = () => channel.send(JSON.stringify({ type: "network", network }))
    }
  }
}

function configurePeer(peer: RTCPeerConnection, stream: MediaStream) {

  peer.ontrack = ({ streams: [stream] }) => {
    if (!document.getElementById(stream.id)) {
      addVideoStream(stream.id, stream)
    }
  }

  stream.getTracks().forEach(track => peer.addTrack(track, stream))

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

  generateJoinUrl: async () => {

    const localStream = await getLocalStream()

    // generate
    const { joinUrl, initPeer: setupPeer, readyPeerPromise } = await client.join(meetingServer, rtcConfiguration)
    console.log({ joinUrl, setupPeer, readyPeerPromise })

    // show
    const joinUrlInput = document.getElementById("joinUrl") as HTMLInputElement
    joinUrlInput.value = joinUrl
    joinUrlInput.hidden = false
    const generateJoinUrlButton = document.getElementById("generateJoinUrl") as HTMLButtonElement
    generateJoinUrlButton.hidden = true

    // configure
    configurePeer(setupPeer, localStream)
    joinControlChannel(setupPeer)

    await readyPeerPromise

    generateJoinUrlButton.hidden = false
    joinUrlInput.hidden = true

  },

  acceptJoinRequest: async () => {

    const localStream = await getLocalStream()

    const acceptUrlInput = document.getElementById("acceptUrl") as HTMLInputElement
    const acceptUrl = acceptUrlInput.value

    const { initPeer: setupPeer, readyPeerPromise } = await client.accept(acceptUrl)

    configurePeer(setupPeer, localStream)
    initControlChannel(setupPeer)

    await readyPeerPromise

    acceptUrlInput.value = ""

  }

})