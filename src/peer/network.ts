import { meet, inviteAt } from './rtc-lib'

export interface Network {
  id: string
  peers: string[]
}

export type Conversation = {
  peer: RTCPeerConnection
  controlChannel: RTCDataChannel
  stream: MediaStream
}

export type Conversations = { [id: string]: Conversation }

export type Meeting = {
  stream: MediaStream
  network: Network
  beaconServer: string
  conversations: { [peerId: string]: Conversation }
  on: (event: 'connect' | 'disconnect', peer: string) => void
}

export async function issueInvitation(
  meeting: Meeting,
  sendInvite: (inviteUrl: URL) => void) {

  const { beaconServer, stream } = meeting

  const { peer, init, inviteUrl } = await inviteAt(beaconServer);

  // declare own resources to share
  const conversation = defineConversation(peer, stream);

  await new Promise(
    async (resolve, reject) => {
      peer.ondatachannel = async ({ channel: controlChannel }) => {
        if (controlChannel.label !== "control") {
          // principle: incompatible? fail: *fail fast*!
          controlChannel.close()
          peer.close()
          reject(`channel "${controlChannel.label}" is not supported`);
        }

        conversation.controlChannel = controlChannel

        controlChannel.onopen = async () => {
          await startConversation(meeting, conversation)
          resolve();
        }

      }

      sendInvite(inviteUrl);

      await init();

    }
  );

  return meeting;
}

export async function acceptInvitation(
  meeting: Meeting,
  invitation: string
) {
  const inviteUrl = new URL(invitation);

  const { peer, init } = await meet(inviteUrl);
  const { stream } = meeting

  const conversation = defineConversation(peer, stream);

  const controlChannel = peer.createDataChannel("control");
  controlChannel.onopen = () => {
    conversation.controlChannel = controlChannel;
    startConversation(meeting, conversation)
  }

  await init();
}


function defineConversation(
  peer: RTCPeerConnection,
  stream: MediaStream
): Conversation {
  const conversation: Conversation = {
    peer: null as RTCPeerConnection,
    controlChannel: null as RTCDataChannel,
    stream: null as MediaStream
  }

  stream.getTracks()
    .forEach(track => peer.addTrack(track, stream))
  peer.ontrack = ({ streams: [stream] }) => {
    if (conversation.stream === null) {
      conversation.stream = stream;
    } else if (conversation.stream.id !== stream.id) {
      peer.close()
      throw new Error(`peer tries to send more than one media stream: ${stream.id}`)
    }
  }

  Object.assign(conversation, { peer })

  return conversation;
}

async function startConversation(meeting: Meeting, conversation: Conversation) {
  const network = await setupControlChannel(meeting, conversation);

  meeting.conversations[network.id] = conversation;

  extendNetwork(meeting, conversation, network.id, network.peers);
}


async function setupControlChannel(meeting: Meeting, conversation: Conversation): Promise<Network> {

  const { peer, controlChannel } = conversation
  const { network } = meeting

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

  // then just await pings and echos
  controlChannel.onmessage =
    ({ data }) => handleControlMessage(
      meeting,
      conversation,
      JSON.parse(data)
    );

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
  message: ControlMessage
) {
  const { peer, controlChannel } = conversation;
  const { network } = meeting

  const { to } = message

  if (to && to !== network.id) {
    if (network.peers.includes(to)) {
      sendControlMessage(meeting.conversations[to], message);
    } else {
      throw new Error(`undeliverable message: ${JSON.stringify(message)}`)
    }
    return;
  }

  if (message.type === "join") {
    await acceptInvitation(meeting, message.invitation)
  } else {
    controlChannel.close();
    peer.close(); // any protocol violation causes abort
    throw new Error(`unsupported message: ${JSON.stringify(message)}`)
  }

}

function extendNetwork(meeting: Meeting, conversation: Conversation, peer: string, peers: string[]) {
  const { network } = meeting

  peers = peers.filter(peer => peer != network.id)
  const newPeers = peers.filter(peer => !network.peers.includes(peer))

  if (!network.peers.includes(peer)) {
    meeting.network.peers.push(peer);
    meeting.conversations[peer] = conversation;
    conversation.peer.onconnectionstatechange = () => {
      if (conversation.peer.connectionState === "disconnected") {
        delete meeting.conversations[peer]
        meeting.network.peers = meeting.network.peers.filter(that => that !== peer)
        meeting.on('disconnect', peer);
      }
    }
    meeting.on('connect', peer)
  }

  newPeers.forEach(async (newPeer) => {
    issueInvitation(
      meeting,
      (inviteUrl) => sendControlMessage(conversation, {
        to: newPeer,
        type: "join",
        invitation: inviteUrl.toString()
      })
    )
  })

}

