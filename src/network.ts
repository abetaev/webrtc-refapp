import { meet, inviteAt } from './rtc-lib'
import uuid from 'uuid'

export interface Network {
  id: string
  peers: string[]
}

type Conversation = {
  peer: RTCPeerConnection
  controlChannel: RTCDataChannel
}

export type Meeting = {
  stream: MediaStream
  network: Network
  meetingServer: string
  handleStream: StreamHandler
  conversations: { [peerId: string]: Conversation }
}


export type StreamHandler = (id: string, stream: MediaStream) => void

export async function issueInvitation(
  meeting: Meeting,
  sendInvite: (inviteUrl: string) => void) {

  console.log(`i am ${meeting.network.id} issuing invitation`)

  const { meetingServer, stream, handleStream } = meeting

  const { peer, init, inviteUrl } = await inviteAt(meetingServer);

  // declare own resources to share
  defineConversation(peer, stream, handleStream);

  await new Promise(
    async (resolve, reject) => {
      console.log('attaching to control channel')
      peer.ondatachannel = async ({ channel: controlChannel }) => {
        if (controlChannel.label !== "control") {
          // principle: incompatible? fail: *fail fast*!
          controlChannel.close()
          peer.close()
          reject(`channel "${controlChannel.label}" is not supported`);
        }

        console.log('attached to control channel')

        await startConversation(meeting, {
          peer,
          controlChannel
        })

        resolve();
      }

      sendInvite(inviteUrl.toString());

      await init();

      console.log('peer connection initiated')

    }
  );

  return meeting;
}

export async function acceptInvitation(
  meeting: Meeting,
  invitation: string
) {
  console.log(`network ${JSON.stringify(meeting.network)}
joins meeting: ${invitation}`)

  const inviteUrl = new URL(invitation);

  const { peer, init } = await meet(inviteUrl);
  const { stream, handleStream } = meeting

  defineConversation(peer, stream, handleStream);

  console.log('creating control channel')
  const controlChannel = peer.createDataChannel("control");
  controlChannel.onopen = () => {
    console.log('control channel is open')
    startConversation(meeting, {
      peer,
      controlChannel
    })
  }

  await init();

  console.log('peer connection initiated')

  return meeting;
}


function defineConversation(
  peer: RTCPeerConnection,
  stream: MediaStream,
  handleStream: StreamHandler
) {
  console.log('defining conversation')
  stream.getTracks()
    .forEach(track => peer.addTrack(track, stream))
  peer.ontrack = ({ streams: [stream] }) => {
    console.log(stream)
    handleStream('unknown', stream);
  }
}

async function startConversation(meeting: Meeting, conversation: Conversation) {
  console.log('starting conversation')

  const network = await setupControlChannel(meeting, conversation);

  meeting.conversations[network.id] = conversation;

  console.log(`control channel established, received peer network: ${JSON.stringify(network)}`)

  extendNetwork(meeting, conversation, network.id, network.peers);
}


async function setupControlChannel(meeting: Meeting, conversation: Conversation): Promise<Network> {

  console.log('initiating control connection')

  const { peer, controlChannel } = conversation
  const { network } = meeting

  controlChannel.onerror = (e) => console.log(e);

  // generously introduce ourselves and provide list of peers we know
  console.log(`introducing ourselves: ${JSON.stringify(network)}`)
  sendControlMessage(conversation, {
    type: "hello",
    network
  });

  // expect similar behavior in response
  const message = await nextMessage(controlChannel)
  if (message.type !== "hello") {
    controlChannel.close(); // or go away
    peer.close();
    throw new Error("peer did not greet")
  }

  console.log(`received greeting from ${message.network.id}
who knows ${JSON.stringify(message.network.peers)}`)

  // then just await pings and echos
  controlChannel.onmessage =
    ({ data }) => handleControlMessage(meeting, conversation, message.network.peers, JSON.parse(data));

  return message.network;

}

async function nextMessage(channel: RTCDataChannel): Promise<ControlMessage> {

  const oldHandler = channel.onmessage
  try {
    return await new Promise(resolve => channel.onmessage = ({ data }) => resolve(
      JSON.parse(data)
    ))
  } finally {
    channel.onmessage = oldHandler
  }

}

type HelloMessage = { type: "hello", network: Network }
type JoinMessage = { type: "join", invitation: string }
type ControlMessage = { to?: string } & (
  HelloMessage
  | JoinMessage
)

function sendControlMessage(conversation: Conversation, message: ControlMessage) {
  const { controlChannel } = conversation;
  controlChannel.send(JSON.stringify(message))
}

async function handleControlMessage(
  meeting: Meeting,
  conversation: Conversation,
  peers: string[],
  message: ControlMessage
) {
  const { peer, controlChannel } = conversation;
  const { network } = meeting

  const { to } = message

  if (to && to !== network.id) {
    if (network.peers.includes(to)) {
      console.log(`forwarding message`);
      sendControlMessage(meeting.conversations[to], message);
      return;
    } else if (peers.includes(to)) {
      console.log(`forwarding`)
      sendControlMessage(conversation, message);
      return;
    } else {
      throw new Error(`undeliverable message: ${JSON.stringify(message)}`)
    }
  }

  if (message.type === "join") {
    console.log("it's a join request!")
    const network = await acceptInvitation(meeting, message.invitation)
    Object.assign(conversation, { network })
  } else {
    controlChannel.close();
    peer.close(); // any protocol violation causes abort
    throw new Error(`unsupported message: ${JSON.stringify(message)}`)
  }

}

function extendNetwork(meeting: Meeting, conversation: Conversation, peer: string, peers: string[]) {
  const { network } = meeting

  console.log(`extending network`)

  const knownPeers = Object.keys(network.peers)
  console.log({ peers, peer, knownPeers })
  const newPeers = peers.filter(peer => !knownPeers.includes(peer))
  const oldPeers = knownPeers.filter(knownPeer => !newPeers.includes(knownPeer))

  if (!knownPeers.includes(peer)) {
    console.log(`connected with ${peer}`);
    meeting.network.peers.push(peer);
    meeting.conversations[peer] = conversation;
  }

  console.log(`old peers: ${JSON.stringify(oldPeers)}`)

  console.log(`new peers: ${JSON.stringify(newPeers)}`)

  newPeers.forEach(async (newPeer) => {
    console.log(`inviting: ${newPeer}`)
    issueInvitation(
      meeting,
      (invitation) => sendControlMessage(conversation, {
        to: newPeer,
        type: "join",
        invitation
      })
    )
  })

  console.log(`network extended: ${JSON.stringify(network)}`)

}

