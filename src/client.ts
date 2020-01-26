import * as client from './client-lib'

require('webrtc-adapter');

// config

export const rtcConfiguration: RTCConfiguration = {
  iceServers: [{
    urls: [
      'stun:127.0.0.1:3478', // coturn@localhost
      // 'stun:127.0.0.1:3479', // coturn@localhost
      'stun:stun.l.google.com:19302'
    ]
  }]
};

const meetingServer = 'ws://localhost:8080/'

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

    const { tokenUrl, readyPeerPromise, setupPeer } = await client.join(
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

main()