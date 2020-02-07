import { meet, inviteAt } from './rtc-lib'
import uuid from 'uuid'

export interface Network {
  id: string
  peers: string[]
}

type Conversation = {
  peer: RTCPeerConnection
  controlChannel: RTCDataChannel
  stream: MediaStream
  handleStream: StreamHandler
  network: Network
  meetingServer: string
}

type StreamHandler = (id: string, stream: MediaStream) => void

export async function initiateMeeting(
  meetingServer: string,
  sendInvite: (inviteUrl: string) => void,
  stream: MediaStream,
  peerHandler: StreamHandler,
  network: Network = { id: uuid(), peers: [] },
): Promise<Network> {

  const { peer, init, inviteUrl } = await inviteAt(meetingServer);

  // defineConversation(peer, stream);

  console.log('creating control channel')
  const controlChannel = peer.createDataChannel("control");
  controlChannel.onopen = () => {
    console.log('control channel is open')
    startConversation({
      peer,
      controlChannel,
      stream,
      handleStream: peerHandler,
      network,
      meetingServer
    })
  }

  sendInvite(inviteUrl.toString());

  await init();

  console.log('peer connection initiated')

  return network;
}

export async function joinMeeting(
  invitation: string,
  stream: MediaStream,
  peerHandler: StreamHandler,
  network: Network = { id: uuid(), peers: [] },
): Promise<Network> {

  const inviteUrl = new URL(invitation);

  const { peer, init } = await meet(inviteUrl);

  // defineConversation(peer, stream);
//FIXMEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE
  await new Promise(
    async (resolve, reject) => {
      console.log('attaching to control channel')
      peer.ondatachannel = async ({ channel }) => {
        if (channel.label !== "control") {
          reject(`channel "${channel.label}" is not supported`);
        }

        console.log('attached to control channel')

        await startConversation({
          peer,
          controlChannel: channel,
          stream,
          handleStream: peerHandler,
          network,
          meetingServer: `${inviteUrl.protocol}//${inviteUrl.host}/`
        })

        resolve();
      }

      await init();

      console.log('peer connection initiated')
    
    }
  );

  return network;
}

function defineConversation(peer: RTCPeerConnection, stream: MediaStream) {
  console.log('defining conversation')
  stream.getTracks().forEach(track => peer.addTrack(track, stream))
}

async function startConversation(conversation: Conversation) {
  console.log('starting conversation')

  const { peer } = conversation

  const { network } = await setupControlChannel(conversation);

  peer.ontrack = ({ streams: [stream] }) =>
    conversation.handleStream(network.id, stream)

  extendNetwork(conversation, network.id, network.peers);
}


async function setupControlChannel(conversation: Conversation):
  Promise<HelloMessage> {

  console.log('initiating control connection')

  const { peer, controlChannel, network } = conversation

  controlChannel.onerror = (e) => console.log(e);

  // generously introduce ourselves and provide list of peers we know
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

  controlChannel.onmessage =
    ({ data }) => handleControlMessage(conversation, data);

  return message;

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

function handleControlMessage(conversation: Conversation, message: ControlMessage) {
  const { peer, controlChannel, stream, handleStream: peerHandler, network } = conversation;

  if (message.to && message.to !== network.id) {
    if (network.peers[message.to]) {
      network.peers[message.to].send(message)
      return;
    } else {
      throw new Error(`undeliverable message to ${message.to}`)
    }
  }

  if (message.type === "join") {
    joinMeeting(message.invitation, stream, peerHandler, network)
  } else {
    controlChannel.close();
    peer.close(); // any protocol violation causes abort
    throw new Error(`unsupported message: ${JSON.stringify(message)}`)
  }

}

function extendNetwork(connection: Conversation, peer: string, peers: string[]) {
  const { network, stream, handleStream, meetingServer } = connection

  const knownPeers = Object.keys(network.peers)
  const newPeers = peers.filter(peer => !knownPeers.includes(peer))
  const oldPeers = knownPeers.filter(knownPeer => !newPeers.includes(knownPeer))

  if (!knownPeers.includes(peer)) {
    console.log(`connected with ${peer}`);
    network.peers.push(peer);
  }

  console.log(`old peers: ${JSON.stringify(oldPeers)}`)

  console.log(`new peers: ${JSON.stringify(newPeers)}`)

  newPeers.forEach(async (newPeer) => {
    console.log(`inviting: ${newPeer}`)
    initiateMeeting(
      meetingServer,
      async (invitation) => sendControlMessage(connection, {
        to: newPeer,
        type: "join",
        invitation
      }),
      stream,
      handleStream,
      network
    )
  })

}

