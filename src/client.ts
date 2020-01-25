require('webrtc-adapter')

// config

const configuration: RTCConfiguration = {
  iceServers: [{
    // urls: ['stun:127.0.0.1:3478', 'stun:127.0.0.1:3479']
    // }, {
    urls: 'stun:stun.l.google.com:19302'
  }]
};

// page parameters

const invitation = new URL(document.URL).searchParams.get("invitation") || ""

if (invitation) {
  console.log(`joining ${invitation}`)
} else {
  console.log(`creating meeting`)
}

// websocket to the signaling server
const socket = new WebSocket(`ws://localhost:8080/${invitation}`)

// creating P2P connection
const peerConn = new RTCPeerConnection(configuration);

const sendMessage = (message: any) => socket.send(JSON.stringify(message))

// handle transferred data
function log(channel: RTCDataChannel) {
  const input = document.createElement('input')
  document.body.appendChild(input)
  input.onkeypress = ({ key }) => {
    if (key === "Enter") {
      channel.send(input.value)
      input.value = ""
    }
  }
  channel.onmessage = (message) => {
    const div = document.createElement('div')
    div.innerText = message.data
    document.body.appendChild(div)
  }
}

// https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity#Signaling

invitation && (socket.onopen = async () => {
  // 1. The caller captures local Media via navigator.mediaDevices.getUserMedia() 
  const dataChannel = peerConn.createDataChannel('data')
  log(dataChannel)
  // const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })

  // 2. The caller creates RTCPeerConnection and called RTCPeerConnection.addTrack() 
  // stream.getTracks().forEach(track => {
  //   console.log(`adding track`)
  //   peerConn.addTrack(track)
  // })

  // 3. The caller calls RTCPeerConnection.createOffer() to create an offer.
  const offer = await peerConn.createOffer();

  // 4. The caller calls RTCPeerConnection.setLocalDescription() to set that offer as the
  //    local description (that is, the description of the local end of the connection).
  await peerConn.setLocalDescription(offer)

  // 5! After setLocalDescription(), the caller asks STUN servers to generate the ice candidates
  //    [[[ice candidates are then sent to receiver through signalling channel]]]
  peerConn.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    console.log('sending ice candidate to peer')
    const { candidate } = event
    if (candidate) {
      sendMessage({
        type: 'candidate',
        candidate
      });
    }
  };

  // 6. The caller uses the signaling server to transmit the offer to the intended receiver of the call.
  sendMessage(offer)

})

let link: HTMLAnchorElement

socket.onmessage = async ({ data: signallingMessage }: MessageEvent) => {

  console.log(signallingMessage)

  const event: MessageEvent & any = JSON.parse(signallingMessage)
  const { type } = event

  switch (type) {

    case "invitation":

      link = document.createElement('a')
      const { invitation } = event
      link.href = `http://localhost:8080/?invitation=${invitation}`
      link.innerText = 'link'
      link.target = '_blank'
      document.body.appendChild(link)

      break;

    case 'candidate':

      console.log('received ice candidate from peer')

      // 5! After setLocalDescription(), the caller asks STUN servers to generate the ice candidates
      //    [[[receiver adds ice candidates sent by caller to connection]]]
      const { candidate } = event
      peerConn.addIceCandidate(new RTCIceCandidate(candidate));

      break;

    case 'offer':

      if (link) {
        document.body.removeChild(link)
      }

      // 7. The recipient receives the offer and calls RTCPeerConnection.setRemoteDescription() to record
      //    it as the remote description (the description of the other end of the connection).
      await peerConn.setRemoteDescription(new RTCSessionDescription(event))

      // 8. The recipient does any setup it needs to do for its end of the call: capture its local media,
      //    and attach each media tracks into the peer connection via RTCPeerConnection.addTrack()
      // const inboundStream = new MediaStream()
      // const video = document.createElement('video')
      // video.srcObject = inboundStream
      // document.body.appendChild(video)
      peerConn.ondatachannel = ({ channel }) => log(channel)

      // peerConn.ontrack = ({ streams, track }) => {
      //   console.log({ streams, track })
      //   if (streams && streams[0]) {
      //     video.srcObject = streams[0];
      //   } else {
      //     video.srcObject = inboundStream;
      //     inboundStream.addTrack(track);
      //   }
      // }
      // console.log(video)

      // 9. The recipient then creates an answer by calling RTCPeerConnection.createAnswer().
      const answer = await peerConn.createAnswer();

      // 10. The recipient calls RTCPeerConnection.setLocalDescription(), passing in the created answer,
      //     to set the answer as its local description. The recipient now knows the configuration of both
      //     ends of the connection.
      await peerConn.setLocalDescription(answer);

      // 11. The recipient uses the signaling server to send the answer to the caller.
      sendMessage(answer)

      break;

    case 'answer':

      // 12. The caller receives the answer.
      // 13. The caller calls RTCPeerConnection.setRemoteDescription() to set the answer as the remote
      //     description for its end of the call. It now knows the configuration of both peers. Media begins
      //     to flow as configured.
      console.log('answer')
      await peerConn.setRemoteDescription(new RTCSessionDescription(event));

      break;

    case "error":

      const { code } = event
      console.log(`error: ${code}`)

      break;

  }

}
