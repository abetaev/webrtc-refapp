import * as server from './server-rpc'

export interface Connection {
  peer: RTCPeerConnection
  ctrl: RTCDataChannel
}

type Call = {
  initPeer: RTCPeerConnection
  readyPeerPromise: Promise<RTCPeerConnection> // resolves when it's ready
}

export async function join(
  meetingServer: string,
  configuration?: RTCConfiguration
): Promise<Call & { joinUrl: string }> {
  const { socket, joinUrl } = await server.join(meetingServer)
  const initPeer = new RTCPeerConnection(configuration)
  console.log(joinUrl)
  return {
    joinUrl,
    initPeer,
    readyPeerPromise: handleJoinerDialog(initPeer, {
      onMessage: (receiver) => socket.onmessage = ({ data }) => receiver(JSON.parse(data)),
      sendMessage: (message: any) => socket.send(JSON.stringify(message))
    })
  }
}

export async function connect(
  channel: RTCDataChannel,
  onMessage: (recever: (event: MessageEvent) => void) => void,
  configuration?: RTCConfiguration
): Promise<Call> {

  const initPeer = new RTCPeerConnection(configuration)
  return {
    initPeer,
    readyPeerPromise: handleJoinerDialog(initPeer, {
      onMessage,
      sendMessage: data => channel.send(JSON.stringify({ type: "signal", data }))
    })
  }
}

export async function accept(
  joinUrl: string,
  configuration?: RTCConfiguration
): Promise<Call> {
  const socket = await server.accept(joinUrl)
  const initPeer = new RTCPeerConnection(configuration);
  return {
    initPeer,
    readyPeerPromise: handleAcceptorDialog(initPeer, socket)
  }
}

type DialogHandler = {
  onMessage: (receiver: (event: MessageEvent) => Promise<void>) => void,
  sendMessage: (message: any) => void
}

type CandidateEvent = { type: "candidate", candidate: RTCIceCandidate } & MessageEvent
type OfferEvent = { type: "offer" } & MessageEvent
type ErrorEvent = { type: "error", code: string } & MessageEvent

async function handleJoinerDialog(peer: RTCPeerConnection,
  { onMessage, sendMessage }: DialogHandler):
  Promise<RTCPeerConnection> {
  await new Promise(resolve => {
    onMessage(
      async (event: CandidateEvent | OfferEvent | ErrorEvent) => {

        const { type } = event

        switch (type) {

          case 'candidate':
            console.log('received ice candidate from peer')
            const { candidate } = event as CandidateEvent
            peer.addIceCandidate(new RTCIceCandidate(candidate));
            break;

          case 'offer':
            console.log('offer')
            await peer.setRemoteDescription(new RTCSessionDescription(event as OfferEvent))
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendMessage(answer)
            resolve()
            break;

          case "error":
            const { code } = event as ErrorEvent
            console.log(`error: ${code}`)
            break;
        }
      })
  })

  return peer;
}

async function handleAcceptorDialog(
  peer: RTCPeerConnection,
  socket: WebSocket,
): Promise<RTCPeerConnection> {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer)
  peer.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    const { candidate } = event
    if (candidate) {
      console.log('sending ice candidate to peer')
      sendMessage(socket, {
        type: 'candidate',
        candidate
      });
    }
  };
  sendMessage(socket, offer)

  await new Promise(resolve => {
    socket.onmessage = async ({ data: signallingMessage }: MessageEvent) => {

      const event: MessageEvent & any = JSON.parse(signallingMessage)
      const { type } = event

      switch (type) {

        case 'answer':
          console.log('answer')
          await peer.setRemoteDescription(new RTCSessionDescription(event));
          resolve()
          break;

        case "error":
          const { code } = event
          console.log(`error: ${code}`)
          break;

      }

    }
  })

  return peer;

}

function sendMessage(socket: WebSocket, message: any) {
  socket.send(JSON.stringify(message))
}