export interface Meeting {
  address: string
  invitation: string
  configuration?: RTCConfiguration
}

export interface Connection {
  peer: RTCPeerConnection
  ctrl: RTCDataChannel
}


export async function invite(meetingServer: string, configuration?: RTCConfiguration): Promise<{
  meeting: Meeting
  connection: Promise<Connection>
}> {
  const socket = new WebSocket(meetingServer)

  let resolveInvitation: (invitation: string) => void
  const invitationPromise = new Promise<string>(((resolve) => resolveInvitation = resolve));

  let resolveConnection: (channel: Connection) => void;
  const connectionPromise = new Promise<Connection>(((resolve) => resolveConnection = resolve));

  const peer = new RTCPeerConnection(configuration)
  peer.ondatachannel = ({ channel }) => resolveConnection({ ctrl: channel, peer })

  socket.onmessage = async ({ data: signallingMessage }: MessageEvent) => {

    const event: MessageEvent & any = JSON.parse(signallingMessage)
    const { type } = event

    switch (type) {

      case "invitation":
        console.log('invitation')
        const { invitation } = event
        resolveInvitation(invitation)
        break;

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
        break;

      case "error":
        const { code } = event
        console.log(`error: ${code}`)
        break;

    }

  }

  const invitation = await invitationPromise

  return {
    meeting: {
      address: `${meetingServer}${invitation}`,
      invitation
    },
    connection: connectionPromise
  }
}

export async function accept(invitation: Meeting): Promise<Connection> {

  let resolveConnection: (connection: Connection) => void
  const connectionPromise = new Promise<Connection>((resolve => resolveConnection = resolve))

  const socket = new WebSocket(invitation.address)

  const peer = new RTCPeerConnection(invitation.configuration)
  const channel = peer.createDataChannel('data')

  socket.onopen = async () => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer)
    peer.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      console.log('sending ice candidate to peer')
      const { candidate } = event
      if (candidate) {
        sendMessage(socket, {
          type: 'candidate',
          candidate
        });
      }
    };
    sendMessage(socket, offer)
  }

  socket.onmessage = async ({ data: signallingMessage }: MessageEvent) => {

    const event: MessageEvent & any = JSON.parse(signallingMessage)
    const { type } = event

    switch (type) {

      case 'answer':
        console.log('answer')
        await peer.setRemoteDescription(new RTCSessionDescription(event));
        channel.onopen = () => resolveConnection({
          ctrl: channel,
          peer
        })
        break;

      case "error":
        const { code } = event
        console.log(`error: ${code}`)
        break;

    }

  }

  return connectionPromise

}

function sendMessage(socket: WebSocket, message: any) {
  socket.send(JSON.stringify(message))
}
