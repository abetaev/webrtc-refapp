import * as NETWORK from './network'
import uuid = require('uuid');
require('webrtc-adapter');
import { Meeting, StreamHandler } from './network'

let meetingServer = `wss://${(new URL(document.URL)).host}/`

// config

let meeting: Meeting = null

const createMeeting = (
  stream: MediaStream,
  handleStream: StreamHandler
): Meeting => ({
  stream,
  handleStream: handleStream,
  conversations: {},
  meetingServer,
  network: {
    id: uuid(),
    peers: []
  }
})

Object.assign(window, {
  join: async (
    stream: MediaStream,
    sendInvite: (url: string) => void,
    handleStream: (peer: string, stream: MediaStream) => void
  ) => {
    if (!meeting) {
      meeting = createMeeting(stream, handleStream)
    }
    NETWORK.issueInvitation(meeting, sendInvite);
  },
  accept: async (
    stream: MediaStream,
    invitation: string,
    handleStream: (id: string, stream: MediaStream) => void
  ) => {
    if (!meeting) {
      meeting = createMeeting(stream, handleStream);
    }
    NETWORK.acceptInvitation(meeting, invitation);
  }
})