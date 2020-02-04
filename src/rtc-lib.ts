import * as server from './signalling'
import { SignallingConnection } from './signalling'

export interface Connection {
  peer: RTCPeerConnection
  ctrl: RTCDataChannel
}

type Call = {
  peer: RTCPeerConnection
  init: () => Promise<void> // resolves when it's ready
}

function createPeer(dialogHandler: SignallingConnection, configuration?: RTCConfiguration): RTCPeerConnection {
  const peer = new RTCPeerConnection(configuration)
  peer.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    const { candidate } = event
    if (candidate) {
      console.log('sending ice candidate to peer')
      dialogHandler.sendMessage({
        type: 'candidate',
        candidate
      });
    }
  };
  return peer
}

export async function join(
  meetingServer: string,
  configuration?: RTCConfiguration
): Promise<Call & { joinUrl: string }> {
  const { dialogHandler, joinUrl } = await server.join(meetingServer)
  const peer = createPeer(dialogHandler, configuration)
  return {
    joinUrl,
    peer,
    init: () => handlePeerDialog(peer, dialogHandler)
  }
}

export async function accept(
  joinUrl: string,
  configuration?: RTCConfiguration
): Promise<Call> {
  const dialogHandler = await server.accept(joinUrl)
  const peer = createPeer(dialogHandler, configuration)
  return {
    peer,
    init: async () => {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer)
      dialogHandler.sendMessage(offer)
      handlePeerDialog(
        peer,
        dialogHandler
      )
    }
  }
}

type CandidateEvent = { type: "candidate", candidate: RTCIceCandidate } & MessageEvent
type OfferEvent = { type: "offer" } & MessageEvent
type ErrorEvent = { type: "error", code: string } & MessageEvent
type AnswerEvent = { type: "answer" } & MessageEvent

async function handlePeerDialog(
  peer: RTCPeerConnection,
  { onMessage, sendMessage }: SignallingConnection
) {
  await new Promise((resolve, reject) => {
    onMessage(
      async (event: CandidateEvent | OfferEvent | AnswerEvent | ErrorEvent) => {

        const { type } = event;

        switch (type) {

          case 'offer':
            console.log('offer')
            await peer.setRemoteDescription(new RTCSessionDescription(event as OfferEvent));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendMessage(answer);
            resolve();
            break;

          case 'answer':
            console.log('answer')
            await peer.setRemoteDescription(new RTCSessionDescription(event as AnswerEvent));
            resolve()
            break;

          case 'candidate':
            console.log('received ice candidate from peer');
            const { candidate } = event as CandidateEvent;
            peer.addIceCandidate(new RTCIceCandidate(candidate));
            break;

          case "error":
            const { code } = event as ErrorEvent;
            reject(new Error(`unable to join: ${code}`));
            break;

        }
      })
  })

}