import { meet, inviteAt } from './rtc-lib'

export interface Network {
  id: string
  peers: string[]
}

type Conversation = {
  peer: RTCPeerConnection
  controlChannel: RTCDataChannel
  stream: MediaStream
}

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

  console.log(`i am ${meeting.network.id} issuing invitation`)

  const { beaconServer, stream } = meeting

  const { peer, init, inviteUrl } = await inviteAt(beaconServer);

  // declare own resources to share
  const conversation = defineConversation(peer, stream);

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
        conversation.controlChannel = controlChannel

        controlChannel.onopen = async () => {
          await startConversation(meeting, conversation)
          resolve();
        }

      }

      sendInvite(inviteUrl);

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
  const { stream } = meeting

  const conversation = defineConversation(peer, stream);

  console.log('creating control channel')
  const controlChannel = peer.createDataChannel("control");
  controlChannel.onopen = () => {
    console.log('control channel is open');
    conversation.controlChannel = controlChannel;
    startConversation(meeting, conversation)
  }

  await init();

  console.log('peer connection initiated')

  return meeting;
}


function defineConversation(
  peer: RTCPeerConnection,
  stream: MediaStream
): Conversation {
  console.log('defining conversation')

  const conversation: Conversation = {
    peer: null as RTCPeerConnection,
    controlChannel: null as RTCDataChannel,
    stream: null as MediaStream
  }

  stream.getTracks()
    .forEach(track => peer.addTrack(track, stream))
  peer.ontrack = ({ streams: [stream] }) => {
    console.log(`received media stream: ${stream.id}`)
    conversation.stream && console.log(`measurement: ${conversation.stream.id}, ${stream.id}`)
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

  const { to, type } = message

  if (to && to !== network.id && type === "join") {
    if (network.peers.includes(to)) {
      console.log(`forwarding message`);
      sendControlMessage(meeting.conversations[to], message);
    } else {
      throw new Error(`undeliverable message: ${JSON.stringify(message)}`)
    }
    return;
  }

  if (message.type === "join") {
    console.log("it's a join request!")
    await acceptInvitation(meeting, message.invitation)
  } else {
    controlChannel.close();
    peer.close(); // any protocol violation causes abort
    throw new Error(`unsupported message: ${JSON.stringify(message)}`)
  }

}

function extendNetwork(meeting: Meeting, conversation: Conversation, peer: string, peers: string[]) {
  const { network } = meeting

  console.log(`extending network`)

  const newPeers = peers.filter(peer => !network.peers.includes(peer))
  const oldPeers = network.peers.filter(knownPeer => !newPeers.includes(knownPeer))

  if (!network.peers.includes(peer)) {
    console.log(`connected with ${peer}`);
    meeting.network.peers.push(peer);
    meeting.conversations[peer] = conversation;
    meeting.on('connect', peer)
    conversation.peer.onconnectionstatechange =
      () => conversation.peer.connectionState === "disconnected"
        && meeting.on('disconnect', peer);
  }

  console.log(`old peers: ${JSON.stringify(oldPeers)}`)

  console.log(`new peers: ${JSON.stringify(newPeers)}`)

  newPeers.forEach(async (newPeer) => {
    console.log(`inviting: ${newPeer}`)
    issueInvitation(
      meeting,
      (inviteUrl) => sendControlMessage(conversation, {
        to: newPeer,
        type: "join",
        invitation: inviteUrl.toString()
      })
    )
  })

  console.log(`network extended: ${JSON.stringify(network)}`)

}

