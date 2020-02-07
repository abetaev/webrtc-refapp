import { issueInvite as issueInvitation, accept as acceptInvitation } from './signalling'
import { SignallingConnection } from './signalling'

export interface Connection {
  peer: RTCPeerConnection
  ctrl: RTCDataChannel
}

type Meeting = {
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

export async function inviteAt(
  meetingServer: string,
  configuration?: RTCConfiguration
): Promise<Meeting & { inviteUrl: URL }> {
  const { dialogHandler, inviteUrl } = await issueInvitation(meetingServer)
  const peer = createPeer(dialogHandler, configuration)
  return {
    inviteUrl: new URL(inviteUrl),
    peer,
    init: () => handlePeerDialog(peer, dialogHandler)
  }
}

export async function meet(
  inviteUrl: URL,
  configuration?: RTCConfiguration
): Promise<Meeting> {
  const dialogHandler = await acceptInvitation(inviteUrl.toString())
  const peer = createPeer(dialogHandler, configuration)
  return {
    peer,
    init: async () => {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer)
      dialogHandler.sendMessage(offer)
      await handlePeerDialog(
        peer,
        dialogHandler
      );
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
  console.log('handling peer dialog')
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
  console.log('peer connection negotiated')
}