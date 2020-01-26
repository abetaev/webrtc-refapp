import * as server from './server-rpc'

export interface Connection {
  peer: RTCPeerConnection
  ctrl: RTCDataChannel
}

type Call = {
  setupPeer: RTCPeerConnection
  readyPeerPromise: Promise<RTCPeerConnection> // resolves when it's ready
}

/*
 * funny fact is that you literally cannot use result of this
 * function in a way it is not supposed to be used not becuase of
 * syntax restrictions of any kind, but because it is absurd to do so
 * :)
*/
export async function join(
  meetingServer: string,
  configuration?: RTCConfiguration
): Promise<Call & { tokenUrl: string }> {
  const { socket, url: invitation } = await server.join(meetingServer)
  const setupPeer = new RTCPeerConnection(configuration)
  return {
    tokenUrl: invitation,
    setupPeer,
    readyPeerPromise: handleJoinerDialog(setupPeer, socket)
  }
}

export async function accept(
  tokenUrl: string,
  configuration?: RTCConfiguration
): Promise<Call> {
  const socket = await server.accept(tokenUrl)
  const setupPeer = new RTCPeerConnection(configuration);
  return {
    setupPeer,
    readyPeerPromise: handleAcceptorDialog(setupPeer, socket)
  }
}

async function handleJoinerDialog(peer: RTCPeerConnection, socket: WebSocket):
  Promise<RTCPeerConnection> {
  await new Promise(resolve => {
    socket.onmessage = async ({ data: signallingMessage }: MessageEvent) => {

      const event: MessageEvent & any = JSON.parse(signallingMessage)
      const { type } = event

      switch (type) {

        case 'candidate':
          console.log('received ice candidate from peer')
          const { candidate } = event
          peer.addIceCandidate(new RTCIceCandidate(candidate));
          break;

        case 'offer':
          console.log('offer')
          await peer.setRemoteDescription(new RTCSessionDescription(event))
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendMessage(socket, answer)
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