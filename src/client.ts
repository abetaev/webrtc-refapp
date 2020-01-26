import * as client from './client-lib'

require('webrtc-adapter');

// config

export const rtcConfiguration: RTCConfiguration = {
  iceServers: [{
    urls: [
      'stun:192.168.1.13:3478', // coturn@localhost
      // 'stun:127.0.0.1:3479', // coturn@localhost
      'stun:stun.l.google.com:19302'
    ]
  }]
};

const meetingServer = 'wss://192.168.1.13:8082/'

export const tokenUrl = new URL(document.URL).searchParams.get("tokenUrl") || ""

async function main() {

  const localStream = (await navigator.mediaDevices.getUserMedia({ audio: true, video: true }))
  if (tokenUrl) {

    console.log(`accept ${tokenUrl}`)

    const { readyPeerPromise, setupPeer } = await client.accept(
      tokenUrl,
      rtcConfiguration
    );

    const ctrl = setupPeer.createDataChannel('ctrl');
    ctrl.onopen = () => ctrl.send('hello');
    ctrl.onmessage = ({ data }) => console.log(`incomming message: ${data}`);

    setupPeer.ontrack = ({ streams: [stream] }) => {
      if (!document.getElementById(stream.id)) {
        console.log(stream.id)
        console.log('receiving track!!!')
        const video = document.createElement("video");
        video.id = stream.id
        video.srcObject = stream
        video.autoplay = true
        document.body.appendChild(video);
      }
    }
    stream(setupPeer, localStream)
    await readyPeerPromise

  } else {

    console.log(`join`)

    const { joinUrl: tokenUrl, readyPeerPromise, setupPeer } = await client.join(
      meetingServer,
      rtcConfiguration
    )

    const link = document.createElement('a')
    link.href = `./?tokenUrl=${tokenUrl}`
    link.innerText = 'link'
    link.target = '_blank'
    document.body.appendChild(link);

    setupPeer.ondatachannel = ({ channel }: RTCDataChannelEvent) => {
      channel.onmessage = ({ data }) => {
        console.log(`incomming message: ${data}`)
        if (data === "hello") {
          channel.send("hi!")
        }
      }
    }

    stream(setupPeer, localStream)

    setupPeer.ontrack = ({ streams: [stream] }) => {
      if (!document.getElementById(stream.id)) {
        console.log(stream.id)
        console.log('receiving track!!!')
        const video = document.createElement("video");
        video.id = stream.id
        video.srcObject = stream
        video.autoplay = true
        document.body.appendChild(video);
      }
    }

    await readyPeerPromise

    document.body.removeChild(link)

  }

}

const stream = (peer: RTCPeerConnection, stream: MediaStream) =>
  stream.getTracks().forEach(track => peer.addTrack(track, stream));

// main()

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
  videoElement.load()
  
  const videosDiv = document.getElementById("videos") as HTMLDivElement
  videosDiv.appendChild(videoElement)

}

function configurePeer(peer: RTCPeerConnection, stream: MediaStream) {

  peer.ontrack = ({ streams: [stream] }) => {
    if (!document.getElementById(stream.id)) {
      addVideoStream(stream.id, stream)
    }
  }

  stream.getTracks().forEach(track => peer.addTrack(track, stream))

}

Object.assign(window, {

  generateJoinUrl: async () => {

    const localStream = await getLocalStream()

    // generate
    const { joinUrl, setupPeer, readyPeerPromise } = await client.join(meetingServer, rtcConfiguration)
    console.log({ joinUrl, setupPeer, readyPeerPromise })

    // configure
    configurePeer(setupPeer, localStream)

    // show
    const joinUrlInput = document.getElementById("joinUrl") as HTMLInputElement
    joinUrlInput.value = joinUrl
    joinUrlInput.hidden = false
    const generateJoinUrlButton = document.getElementById("generateJoinUrl") as HTMLButtonElement
    generateJoinUrlButton.hidden = true

    await readyPeerPromise

    generateJoinUrlButton.hidden = false
    joinUrlInput.hidden = true

  },

  acceptJoinRequest: async () => {

    const localStream = await getLocalStream()

    const acceptUrlInput = document.getElementById("acceptUrl") as HTMLInputElement
    const acceptUrl = acceptUrlInput.value

    const { setupPeer, readyPeerPromise } = await client.accept(acceptUrl)

    configurePeer(setupPeer, localStream)

    await readyPeerPromise

    acceptUrlInput.value = ""

  }

})