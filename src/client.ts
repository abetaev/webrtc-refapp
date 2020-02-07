import * as network from './network'
require('webrtc-adapter');

const url = new URL(document.URL)

const stunServerUrl = `stun:${url.hostname}:3478`
let meetingServer = `wss://${url.host}/`

// config

const rtcConfiguration: RTCConfiguration = {
  iceServers: [{
    urls: [
      stunServerUrl,
      'stun:stun.l.google.com:19302'
    ]
  }]
};

Object.assign(window, {
  join: (
    stream: MediaStream,
    sendInvite: (url: string) => void,
    streamHandler: (peer: string, stream: MediaStream) => void
  ) => {
    network.initiateMeeting(
      meetingServer,
      sendInvite,
      stream,
      (peer, stream) => streamHandler(peer, stream)
    )
  },
  accept: (
    stream: MediaStream,
    invitation: string,
    streamHandler: (id: string, stream: MediaStream) => void
  ) => {
    network.joinMeeting(
      invitation,
      stream,
      (peer, stream) => streamHandler(peer, stream)
    )
  }
})